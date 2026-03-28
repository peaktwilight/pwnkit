import type { ScanConfig, ScanReport, Finding } from "@nightfang/shared";
import { loadTemplates } from "@nightfang/templates";
import { createRuntime } from "./runtime/index.js";
import { LlmApiRuntime } from "./runtime/llm-api.js";
// DB lazy-loaded to avoid native module issues
import { runAgentLoop } from "./agent/loop.js";
import { runNativeAgentLoop } from "./agent/native-loop.js";
import { getToolsForRole } from "./agent/tools.js";
import {
  discoveryPrompt,
  attackPrompt,
  verifyPrompt,
  reportPrompt,
} from "./agent/prompts.js";
import type { ScanEvent, ScanListener } from "./scanner.js";
import type { NativeRuntime } from "./runtime/types.js";

export interface AgenticScanOptions {
  config: ScanConfig;
  dbPath?: string;
  onEvent?: ScanListener;
  /** Resume from a previous scan (uses persisted sessions) */
  resumeScanId?: string;
}

/**
 * Run a full agentic scan with multi-turn agents, tool use, and persistent state.
 *
 * Pipeline:
 * - Discovery Agent: probes target, maps endpoints, builds profile
 * - Attack Agent: runs attacks with adaptation and multi-turn escalation
 * - Verification Agent: replays and confirms findings
 * - Report Agent: generates summary
 *
 * When ANTHROPIC_API_KEY is set, uses the native Claude Messages API with
 * structured tool_use for reliable tool execution. Otherwise, falls back to
 * the legacy text-based agent loop via subprocess runtimes.
 *
 * All findings persist to SQLite between stages and across scans.
 * Sessions are saved so interrupted scans can be resumed.
 */
export async function agenticScan(opts: AgenticScanOptions): Promise<ScanReport> {
  const { config, dbPath, onEvent, resumeScanId } = opts;
  const emit = onEvent ?? (() => {});

  const db = await (async () => { try { const { NightfangDB } = await import("@nightfang/db"); return new NightfangDB(dbPath); } catch { return null as any; } })() as any;

  // Resume or create new scan
  const scanId = resumeScanId ?? db.createScan(config);

  if (resumeScanId) {
    const existing = db.getScan(resumeScanId);
    if (!existing) throw new Error(`Scan ${resumeScanId} not found`);
    db.logEvent({
      scanId,
      stage: "discovery",
      eventType: "scan_resumed",
      payload: { originalScanId: resumeScanId },
      timestamp: Date.now(),
    });
    emit({ type: "stage:start", stage: "discovery", message: "Resuming scan..." });
  }

  // Determine runtime mode
  const runtimeMode = config.runtime ?? "api";
  const legacyRuntime = createRuntime({
    type: runtimeMode === "auto" ? "api" : runtimeMode,
    timeout: config.timeout ?? 60_000,
  });

  // Try to use native Claude API runtime for structured tool_use
  const claudeRuntime = new LlmApiRuntime({
    type: "api",
    timeout: config.timeout ?? 120_000,
    model: config.model,
    apiKey: config.apiKey,
  });
  const useNative = await claudeRuntime.isAvailable();

  const templates = loadTemplates(config.depth);
  const categories = [...new Set(templates.map((t) => t.category))];

  let allFindings: Finding[] = [];

  // Log scan start
  db.logEvent({
    scanId,
    stage: "discovery",
    eventType: "scan_start",
    payload: {
      target: config.target,
      depth: config.depth,
      mode: config.mode ?? "probe",
      useNative,
      templateCount: templates.length,
      categoryCount: categories.length,
    },
    timestamp: Date.now(),
  });

  try {
    // ── Stage 1: Discovery Agent ──
    emit({ type: "stage:start", stage: "discovery", message: "Discovery agent starting..." });
    db.logEvent({
      scanId,
      stage: "discovery",
      eventType: "stage_start",
      agentRole: "discovery",
      payload: {},
      timestamp: Date.now(),
    });

    const discoveryState = useNative
      ? await runNativeDiscovery(claudeRuntime, db, config, scanId, emit)
      : await runLegacyDiscovery(legacyRuntime, db, config, scanId, emit);

    // Persist target profile
    if (discoveryState.targetInfo.type) {
      db.upsertTarget({
        url: config.target,
        type: discoveryState.targetInfo.type ?? "unknown",
        model: discoveryState.targetInfo.model,
        systemPrompt: discoveryState.targetInfo.systemPrompt,
        endpoints: discoveryState.targetInfo.endpoints,
        detectedFeatures: discoveryState.targetInfo.detectedFeatures,
      });
    }

    db.logEvent({
      scanId,
      stage: "discovery",
      eventType: "stage_complete",
      agentRole: "discovery",
      payload: { summary: discoveryState.summary.slice(0, 500) },
      timestamp: Date.now(),
    });
    emit({
      type: "stage:end",
      stage: "discovery",
      message: `Discovery complete: ${discoveryState.summary}`,
    });

    // ── Stage 2: Attack Agent ──
    const maxAttackTurns = config.depth === "deep" ? 20 : config.depth === "default" ? 12 : 6;

    emit({
      type: "stage:start",
      stage: "attack",
      message: `Attack agent starting (${categories.length} categories)...`,
    });
    db.logEvent({
      scanId,
      stage: "attack",
      eventType: "stage_start",
      agentRole: "attack",
      payload: { categories, maxTurns: maxAttackTurns },
      timestamp: Date.now(),
    });

    const attackState = useNative
      ? await runNativeAttack(claudeRuntime, db, config, scanId, discoveryState.targetInfo, categories, maxAttackTurns, emit)
      : await runLegacyAttack(legacyRuntime, db, config, scanId, discoveryState.targetInfo, categories, maxAttackTurns, emit);

    allFindings = [...attackState.findings];

    db.logEvent({
      scanId,
      stage: "attack",
      eventType: "stage_complete",
      agentRole: "attack",
      payload: { findingCount: allFindings.length, summary: attackState.summary.slice(0, 500) },
      timestamp: Date.now(),
    });
    emit({
      type: "stage:end",
      stage: "attack",
      message: `Attack complete: ${attackState.findings.length} findings, ${attackState.summary}`,
    });

    // ── Stage 3: Verification Agent ──
    if (allFindings.length > 0) {
      emit({
        type: "stage:start",
        stage: "verify",
        message: `Verifying ${allFindings.length} findings...`,
      });
      db.logEvent({
        scanId,
        stage: "verify",
        eventType: "stage_start",
        agentRole: "verify",
        payload: { findingCount: allFindings.length },
        timestamp: Date.now(),
      });

      if (useNative) {
        await runNativeVerify(claudeRuntime, db, config, scanId, allFindings, emit);
      } else {
        await runLegacyVerify(legacyRuntime, db, config, scanId, allFindings, emit);
      }

      // Merge verification results — DB is source of truth
      const dbFindings = db.getFindings(scanId);
      allFindings = dbFindings.map(dbFindingToFinding);

      db.logEvent({
        scanId,
        stage: "verify",
        eventType: "stage_complete",
        agentRole: "verify",
        payload: {
          verified: allFindings.filter((f) => f.status === "verified").length,
          falsePositive: allFindings.filter((f) => f.status === "false-positive").length,
        },
        timestamp: Date.now(),
      });
      emit({
        type: "stage:end",
        stage: "verify",
        message: `Verification complete: ${allFindings.filter((f) => f.status !== "false-positive").length} confirmed`,
      });
    }

    // ── Stage 4: Report ──
    emit({ type: "stage:start", stage: "report", message: "Generating report..." });

    const confirmed = allFindings.filter(
      (f) => f.status !== "false-positive" && f.status !== "discovered",
    ).length;
    const summary = {
      totalAttacks: attackState.turnCount,
      totalFindings: allFindings.length,
      critical: allFindings.filter((f) => f.severity === "critical").length,
      high: allFindings.filter((f) => f.severity === "high").length,
      medium: allFindings.filter((f) => f.severity === "medium").length,
      low: allFindings.filter((f) => f.severity === "low").length,
      info: allFindings.filter((f) => f.severity === "info").length,
    };

    db.completeScan(scanId, summary);

    const report: ScanReport = {
      target: config.target,
      scanDepth: config.depth,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
      summary,
      findings: allFindings.filter((f) => f.status !== "false-positive"),
      warnings: [],
    };

    // Compute actual duration from DB
    const dbScan = db.getScan(scanId);
    if (dbScan) {
      report.startedAt = dbScan.startedAt;
      report.completedAt = dbScan.completedAt ?? report.completedAt;
      report.durationMs = dbScan.durationMs ?? 0;
    }

    db.logEvent({
      scanId,
      stage: "report",
      eventType: "scan_complete",
      payload: { ...summary, durationMs: report.durationMs },
      timestamp: Date.now(),
    });

    emit({
      type: "stage:end",
      stage: "report",
      message: `Report: ${summary.totalFindings} findings (${confirmed} confirmed)`,
    });

    return report;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.failScan(scanId, msg);
    db.logEvent({
      scanId,
      stage: "report",
      eventType: "scan_error",
      payload: { error: msg },
      timestamp: Date.now(),
    });
    throw err;
  } finally {
    db.close();
  }
}

// ── Shared state type for agent outputs ──

interface AgentOutput {
  findings: Finding[];
  targetInfo: Partial<import("@nightfang/shared").TargetInfo>;
  summary: string;
  turnCount: number;
}

// ── Native (Claude API) stage runners ──

async function runNativeDiscovery(
  runtime: NativeRuntime,
  db: any,
  config: ScanConfig,
  scanId: string,
  emit: ScanListener,
): Promise<AgentOutput> {
  const state = await runNativeAgentLoop({
    config: {
      role: "discovery",
      systemPrompt: discoveryPrompt(config.target),
      tools: getToolsForRole("discovery"),
      maxTurns: 8,
      target: config.target,
      scanId,
      sessionId: db.getSession(scanId, "discovery")?.id,
    },
    runtime,
    db,
    onTurn: (turn) => {
      emit({ type: "stage:end", stage: "discovery", message: `Discovery turn ${turn}` });
    },
  });
  return {
    findings: state.findings,
    targetInfo: state.targetInfo,
    summary: state.summary,
    turnCount: state.turnCount,
  };
}

async function runNativeAttack(
  runtime: NativeRuntime,
  db: any,
  config: ScanConfig,
  scanId: string,
  targetInfo: Partial<import("@nightfang/shared").TargetInfo>,
  categories: string[],
  maxTurns: number,
  emit: ScanListener,
): Promise<AgentOutput> {
  const state = await runNativeAgentLoop({
    config: {
      role: "attack",
      systemPrompt: attackPrompt(config.target, targetInfo, categories),
      tools: getToolsForRole("attack"),
      maxTurns,
      target: config.target,
      scanId,
      sessionId: db.getSession(scanId, "attack")?.id,
    },
    runtime,
    db,
    onTurn: (turn, toolCalls) => {
      for (const call of toolCalls) {
        if (call.name === "save_finding") {
          emit({
            type: "finding",
            message: `[${call.arguments.severity}] ${call.arguments.title}`,
            data: call.arguments,
          });
        }
      }
    },
  });
  return {
    findings: state.findings,
    targetInfo: state.targetInfo,
    summary: state.summary,
    turnCount: state.turnCount,
  };
}

async function runNativeVerify(
  runtime: NativeRuntime,
  db: any,
  config: ScanConfig,
  scanId: string,
  findings: Finding[],
  emit: ScanListener,
): Promise<void> {
  await runNativeAgentLoop({
    config: {
      role: "verify",
      systemPrompt: verifyPrompt(config.target, findings),
      tools: getToolsForRole("verify"),
      maxTurns: Math.min(findings.length * 3, 15),
      target: config.target,
      scanId,
      sessionId: db.getSession(scanId, "verify")?.id,
    },
    runtime,
    db,
  });
}

// ── Legacy (text-based) stage runners ──

async function runLegacyDiscovery(
  runtime: import("./runtime/types.js").Runtime,
  db: any,
  config: ScanConfig,
  scanId: string,
  emit: ScanListener,
): Promise<AgentOutput> {
  const state = await runAgentLoop({
    config: {
      role: "discovery",
      systemPrompt: discoveryPrompt(config.target),
      tools: getToolsForRole("discovery"),
      maxTurns: 8,
      target: config.target,
      scanId,
    },
    runtime,
    db,
    onTurn: (turn, msg) => {
      emit({
        type: "stage:end",
        stage: "discovery",
        message: `Discovery turn ${turn}: ${msg.content.slice(0, 100)}...`,
      });
    },
  });
  return {
    findings: state.findings,
    targetInfo: state.targetInfo,
    summary: state.summary,
    turnCount: state.turnCount,
  };
}

async function runLegacyAttack(
  runtime: import("./runtime/types.js").Runtime,
  db: any,
  config: ScanConfig,
  scanId: string,
  targetInfo: Partial<import("@nightfang/shared").TargetInfo>,
  categories: string[],
  maxTurns: number,
  emit: ScanListener,
): Promise<AgentOutput> {
  const state = await runAgentLoop({
    config: {
      role: "attack",
      systemPrompt: attackPrompt(config.target, targetInfo, categories),
      tools: getToolsForRole("attack"),
      maxTurns,
      target: config.target,
      scanId,
    },
    runtime,
    db,
    onTurn: (turn, msg) => {
      const calls = msg.toolCalls ?? [];
      for (const call of calls) {
        if (call.name === "save_finding") {
          emit({
            type: "finding",
            message: `[${call.arguments.severity}] ${call.arguments.title}`,
            data: call.arguments,
          });
        }
      }
    },
  });
  return {
    findings: state.findings,
    targetInfo: state.targetInfo,
    summary: state.summary,
    turnCount: state.turnCount,
  };
}

async function runLegacyVerify(
  runtime: import("./runtime/types.js").Runtime,
  db: any,
  config: ScanConfig,
  scanId: string,
  findings: Finding[],
  _emit: ScanListener,
): Promise<void> {
  await runAgentLoop({
    config: {
      role: "verify",
      systemPrompt: verifyPrompt(config.target, findings),
      tools: getToolsForRole("verify"),
      maxTurns: Math.min(findings.length * 3, 15),
      target: config.target,
      scanId,
    },
    runtime,
    db,
  });
}

// ── Helper: convert DB finding row to Finding type ──

function dbFindingToFinding(dbf: {
  id: string;
  templateId: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  status: string;
  confidence: number | null;
  cvssVector: string | null;
  cvssScore: number | null;
  evidenceRequest: string;
  evidenceResponse: string;
  evidenceAnalysis: string | null;
  timestamp: number;
}): Finding {
  return {
    id: dbf.id,
    templateId: dbf.templateId,
    title: dbf.title,
    description: dbf.description,
    severity: dbf.severity as Finding["severity"],
    category: dbf.category as Finding["category"],
    status: dbf.status as Finding["status"],
    confidence: dbf.confidence ?? undefined,
    cvssVector: dbf.cvssVector ?? undefined,
    cvssScore: dbf.cvssScore ?? undefined,
    evidence: {
      request: dbf.evidenceRequest,
      response: dbf.evidenceResponse,
      analysis: dbf.evidenceAnalysis ?? undefined,
    },
    timestamp: dbf.timestamp,
  };
}
