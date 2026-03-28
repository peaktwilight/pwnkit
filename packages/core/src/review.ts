import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type {
  ReviewConfig,
  ReviewReport,
  SemgrepFinding,
  Finding,
  ScanConfig,
  Severity,
} from "@nightfang/shared";
import type { ScanEvent, ScanListener } from "./scanner.js";
// DB lazy-loaded to avoid native module issues
import { createRuntime } from "./runtime/index.js";
import type { RuntimeType } from "./runtime/index.js";
import { LlmApiRuntime } from "./runtime/llm-api.js";
import { detectAvailableRuntimes, pickRuntimeForStage } from "./runtime/registry.js";
import { runAgentLoop } from "./agent/loop.js";
import { getToolsForRole } from "./agent/tools.js";
import { reviewAgentPrompt } from "./review-prompt.js";

export interface SourceReviewOptions {
  config: ReviewConfig;
  onEvent?: ScanListener;
}

/**
 * Resolve the repo path: if it's a URL, clone it; if local, use as-is.
 * Returns the absolute path to the repo and whether it was cloned (needs cleanup).
 */
function resolveRepo(
  repo: string,
  emit: ScanListener,
): { repoPath: string; cloned: boolean; tempDir?: string } {
  // Check if it's a git URL (https, ssh, or git protocol)
  const isUrl =
    repo.startsWith("https://") ||
    repo.startsWith("http://") ||
    repo.startsWith("git@") ||
    repo.startsWith("git://");

  if (!isUrl) {
    // Local path
    const absPath = resolve(repo);
    if (!existsSync(absPath)) {
      throw new Error(`Repository path not found: ${absPath}`);
    }
    return { repoPath: absPath, cloned: false };
  }

  // Clone the repo
  const tempDir = join(tmpdir(), `nightfang-review-${randomUUID().slice(0, 8)}`);
  mkdirSync(tempDir, { recursive: true });

  emit({
    type: "stage:start",
    stage: "discovery",
    message: `Cloning ${repo}...`,
  });

  try {
    execFileSync("git", ["clone", "--depth", "1", repo, `${tempDir}/repo`], {
      timeout: 120_000,
      stdio: "pipe",
    });
  } catch (err) {
    rmSync(tempDir, { recursive: true, force: true });
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to clone ${repo}: ${msg}`);
  }

  const repoPath = join(tempDir, "repo");

  emit({
    type: "stage:end",
    stage: "discovery",
    message: `Cloned ${basename(repo.replace(/\.git$/, ""))}`,
  });

  return { repoPath, cloned: true, tempDir };
}

/**
 * Run semgrep security scan against the repository.
 */
function runSemgrepScan(
  repoPath: string,
  emit: ScanListener,
): SemgrepFinding[] {
  emit({
    type: "stage:start",
    stage: "source-analysis",
    message: "Running semgrep security scan...",
  });

  let rawOutput = "";

  try {
    rawOutput = execFileSync(
      "semgrep",
      [
        "scan",
        "--config",
        "auto",
        "--json",
        "--timeout",
        "60",
        "--max-target-bytes",
        "1000000",
        repoPath,
      ],
      {
        timeout: 300_000,
        stdio: "pipe",
        encoding: "utf-8",
        env: { ...process.env, SEMGREP_SEND_METRICS: "off" },
      },
    );
  } catch (err) {
    const stdout =
      err && typeof err === "object" && "stdout" in err
        ? (err.stdout as Buffer | string | undefined)
        : undefined;
    rawOutput = bufferToString(stdout);
  }

  let findings: SemgrepFinding[] = [];

  if (rawOutput.trim()) {
    try {
      const raw = JSON.parse(rawOutput);
      const results = (raw.results ?? []) as Array<{
        check_id: string;
        extra: {
          message: string;
          severity: string;
          lines: string;
          metadata?: Record<string, unknown>;
        };
        path: string;
        start: { line: number };
        end: { line: number };
      }>;

      findings = results.map((r) => ({
        ruleId: r.check_id,
        message: r.extra?.message ?? "",
        severity: mapSemgrepSeverity(r.extra?.severity ?? "WARNING"),
        path: r.path,
        startLine: r.start?.line ?? 0,
        endLine: r.end?.line ?? 0,
        snippet: r.extra?.lines ?? "",
        metadata: r.extra?.metadata,
      }));
    } catch {
      // JSON parse failed
    }
  }

  emit({
    type: "stage:end",
    stage: "source-analysis",
    message: `Semgrep: ${findings.length} findings`,
  });

  return findings;
}

function mapSemgrepSeverity(level: string): string {
  switch (level.toUpperCase()) {
    case "ERROR":
      return "high";
    case "WARNING":
      return "medium";
    case "INFO":
      return "low";
    default:
      return "info";
  }
}

function bufferToString(value: Buffer | string | undefined): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf-8");
  return "";
}

/**
 * CLI runtimes (claude, codex, etc.) are full agents — they can read files,
 * run commands, and do multi-turn analysis natively. We bypass our own agent
 * loop and let the CLI handle everything, then parse findings from its output.
 */
const CLI_RUNTIME_TYPES = new Set<RuntimeType>(["claude", "codex", "gemini", "opencode"]);

function buildCliReviewPrompt(
  repoPath: string,
  semgrepFindings: SemgrepFinding[],
): string {
  const semgrepContext = semgrepFindings.length > 0
    ? semgrepFindings
        .slice(0, 30)
        .map((f, i) => `  ${i + 1}. [${f.severity}] ${f.ruleId} — ${f.path}:${f.startLine}: ${f.message}`)
        .join("\n")
    : "  None.";

  return `Audit the npm package at ${repoPath}.

Read the source code, look for: prototype pollution, ReDoS, path traversal, injection, unsafe deserialization, missing validation. Map data flow from untrusted input to sensitive operations. Report any security findings with severity and PoC suggestions.

Semgrep already found these leads:
${semgrepContext}

For EACH confirmed vulnerability, output a block in this exact format:

---FINDING---
title: <clear title>
severity: <critical|high|medium|low|info>
category: <prototype-pollution|redos|path-traversal|command-injection|code-injection|unsafe-deserialization|ssrf|information-disclosure|missing-validation|other>
description: <detailed description of the vulnerability, how to exploit it, and suggested PoC>
file: <path/to/file.js:lineNumber>
---END---

Output as many ---FINDING--- blocks as needed. Be precise and honest about severity.`;
}

function parseFindingsFromCliOutput(output: string, _scanId: string): Finding[] {
  const findings: Finding[] = [];
  const blocks = output.split("---FINDING---").slice(1);

  for (const block of blocks) {
    const endIdx = block.indexOf("---END---");
    const content = endIdx >= 0 ? block.slice(0, endIdx) : block;

    const title = content.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? "Untitled finding";
    const severity = content.match(/^severity:\s*(.+)$/m)?.[1]?.trim()?.toLowerCase() ?? "info";
    const category = content.match(/^category:\s*(.+)$/m)?.[1]?.trim() ?? "other";
    const description = content.match(/^description:\s*([\s\S]*?)(?=^(?:file|---)|$)/m)?.[1]?.trim() ?? "";
    const file = content.match(/^file:\s*(.+)$/m)?.[1]?.trim() ?? "";

    const validSeverities = new Set(["critical", "high", "medium", "low", "info"]);
    const normalizedSeverity = validSeverities.has(severity) ? severity as Severity : "info";

    findings.push({
      id: randomUUID(),
      templateId: `cli-review-${Date.now()}`,
      title,
      description,
      severity: normalizedSeverity,
      category: category as Finding["category"],
      status: "discovered",
      evidence: {
        request: `Review of source at ${file}`,
        response: description,
        analysis: `Found by CLI agent during automated review`,
      },
      confidence: undefined,
      timestamp: Date.now(),
    });
  }

  return findings;
}

/**
 * Run an AI agent to perform deep source code review.
 */
async function runReviewAgent(
  repoPath: string,
  semgrepFindings: SemgrepFinding[],
  db: any,
  scanId: string,
  config: ReviewConfig,
  emit: ScanListener,
): Promise<Finding[]> {
  emit({
    type: "stage:start",
    stage: "attack",
    message: "AI agent performing deep code review...",
  });

  // Detect available CLI runtimes
  const available = await detectAvailableRuntimes();

  // Determine runtime: prefer CLI runtimes, fall back to API agent loop
  let runtimeType: RuntimeType;
  if (config.runtime === "auto") {
    runtimeType = available.size > 0
      ? pickRuntimeForStage("source-analysis", available)
      : "api";
  } else {
    runtimeType = (config.runtime ?? "api") as RuntimeType;
  }

  // ── Fast path: use CLI runtime (claude/codex/etc.) as a full agent ──
  if (CLI_RUNTIME_TYPES.has(runtimeType) && available.has(runtimeType)) {
    emit({
      type: "stage:start",
      stage: "attack",
      message: `Using ${runtimeType} CLI for deep AI analysis...`,
    });

    const { ProcessRuntime } = await import("./runtime/process.js");
    const cliRuntime = new ProcessRuntime({
      type: runtimeType,
      timeout: config.timeout ?? 600_000, // 10 min for deep analysis
      cwd: repoPath,
    });

    const prompt = buildCliReviewPrompt(repoPath, semgrepFindings);
    const result = await cliRuntime.execute(prompt, {
      systemPrompt: "You are a security researcher performing an authorized source code review. Be thorough and precise. Only report real, exploitable vulnerabilities.",
    });

    if (result.error && !result.output) {
      emit({
        type: "stage:end",
        stage: "attack",
        message: `CLI agent error: ${result.error}`,
      });
      // Fall through to basic mode
    } else {
      const findings = parseFindingsFromCliOutput(result.output, scanId);

      for (const f of findings) {
        emit({
          type: "finding",
          message: `[${f.severity}] ${f.title}`,
          data: f,
        });
      }

      emit({
        type: "stage:end",
        stage: "attack",
        message: `CLI agent complete: ${findings.length} findings (${result.durationMs}ms)`,
      });

      return findings;
    }
  }

  // ── API runtime: multi-turn agentic loop with native tool_use ──
  if (runtimeType === "api" || !available.has(runtimeType)) {
    emit({
      type: "stage:start",
      stage: "attack",
      message: "Running agentic source code review via API...",
    });

    const apiRuntime = new LlmApiRuntime({
      type: "api" as RuntimeType,
      timeout: config.timeout ?? 120_000,
      apiKey: config.apiKey,
      model: config.model,
    });

    const supportsNative = typeof (apiRuntime as any).executeNative === "function";

    if (supportsNative) {
      const { runNativeAgentLoop } = await import("./agent/native-loop.js");
      const maxTurns = config.depth === "deep" ? 40 : config.depth === "default" ? 25 : 15;

      const agentState = await runNativeAgentLoop({
        config: {
          role: "review",
          systemPrompt: reviewAgentPrompt(repoPath, semgrepFindings),
          tools: getToolsForRole("review"),
          maxTurns,
          target: `repo:${repoPath}`,
          scanId,
          scopePath: repoPath,
        },
        runtime: apiRuntime as any,
        db,
        onTurn: (_turn, toolCalls) => {
          for (const call of toolCalls) {
            if (call.name === "save_finding") {
              emit({
                type: "finding",
                message: `[${call.arguments.severity}] ${call.arguments.title}`,
                data: call.arguments,
              });
            } else if (call.name === "read_file") {
              emit({
                type: "stage:start",
                stage: "attack",
                message: `Reading ${call.arguments.path}`,
              });
            } else if (call.name === "run_command") {
              emit({
                type: "stage:start",
                stage: "attack",
                message: `Running: ${call.arguments.command}`,
              });
            }
          }
        },
      });

      emit({
        type: "stage:end",
        stage: "attack",
        message: `Review complete: ${agentState.findings.length} findings in ${agentState.turnCount} turns (${agentState.totalUsage.inputTokens + agentState.totalUsage.outputTokens} tokens)`,
      });

      return agentState.findings;
    }
  }

  // ── Legacy fallback: text-based agent loop ──
  const maxTurns =
    config.depth === "deep" ? 50 : config.depth === "default" ? 30 : 15;

  const runtimeConfig = {
    type: runtimeType as RuntimeType,
    timeout: config.timeout ?? 120_000,
    apiKey: config.apiKey,
    model: config.model,
  };
  const runtime =
    runtimeType === "api" || !available.has(runtimeType)
      ? new LlmApiRuntime(runtimeConfig)
      : createRuntime(runtimeConfig);

  const agentState = await runAgentLoop({
    config: {
      role: "review",
      systemPrompt: reviewAgentPrompt(repoPath, semgrepFindings),
      tools: getToolsForRole("review"),
      maxTurns,
      target: `repo:${repoPath}`,
      scanId,
      scopePath: repoPath,
    },
    runtime,
    db,
    onTurn: (_turn, msg) => {
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

  emit({
    type: "stage:end",
    stage: "attack",
    message: `Review complete: ${agentState.findings.length} findings`,
  });

  return agentState.findings;
}

/**
 * Main entry point: deep source code review of a repository.
 *
 * Pipeline:
 * 1. Clone repo (if URL) or resolve local path
 * 2. Run semgrep with security rules
 * 3. AI agent performs deep source code review
 * 4. Generate report with severity and PoC suggestions
 * 5. Persist to nightfang DB
 */
export async function sourceReview(
  opts: SourceReviewOptions,
): Promise<ReviewReport> {
  const { config, onEvent } = opts;
  const emit: ScanListener = onEvent ?? (() => {});
  const startTime = Date.now();

  // Step 1: Resolve repo
  const { repoPath, cloned, tempDir } = resolveRepo(config.repo, emit);

  // Initialize DB and create scan record
  const db = await (async () => { try { const { NightfangDB } = await import("@nightfang/db"); return new NightfangDB(config.dbPath); } catch { return null as any; } })() as any;
  const scanConfig: ScanConfig = {
    target: `repo:${config.repo}`,
    depth: config.depth,
    format: config.format,
    runtime: config.runtime ?? "api",
    mode: "deep",
  };
  const scanId = db.createScan(scanConfig);

  try {
    // Step 2: Semgrep scan
    const semgrepFindings = runSemgrepScan(repoPath, emit);

    // Step 3: AI agent review
    const findings = await runReviewAgent(
      repoPath,
      semgrepFindings,
      db,
      scanId,
      config,
      emit,
    );

    // Step 4: Build report
    const durationMs = Date.now() - startTime;
    const summary = {
      totalAttacks: semgrepFindings.length,
      totalFindings: findings.length,
      critical: findings.filter((f) => f.severity === "critical").length,
      high: findings.filter((f) => f.severity === "high").length,
      medium: findings.filter((f) => f.severity === "medium").length,
      low: findings.filter((f) => f.severity === "low").length,
      info: findings.filter((f) => f.severity === "info").length,
    };

    db.completeScan(scanId, summary);

    emit({
      type: "stage:end",
      stage: "report",
      message: `Review complete: ${summary.totalFindings} findings (${summary.critical} critical, ${summary.high} high)`,
    });

    return {
      repo: config.repo,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs,
      semgrepFindings: semgrepFindings.length,
      summary,
      findings,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.failScan(scanId, msg);
    throw err;
  } finally {
    db.close();
    // Clean up cloned repos
    if (cloned && tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}
