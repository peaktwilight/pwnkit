import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type {
  ScanDepth,
  OutputFormat,
  RuntimeMode,
  ScanMode,
  Finding,
  NpmAuditFinding,
  SemgrepFinding,
  ScanConfig,
} from "@pwnkit/shared";
import type { ScanListener } from "./scanner.js";
import { runAnalysisAgent } from "./agent-runner.js";
import { auditAgentPrompt, reviewAgentPrompt } from "./analysis-prompts.js";
import { sourceVerifyPrompt } from "./agent/prompts.js";
import { runSemgrepScan, bufferToString } from "./shared-analysis.js";

// ── Public types ──

export interface PipelineOptions {
  target: string;
  targetType?: "npm-package" | "source-code" | "url" | "web-app";
  depth: ScanDepth;
  format: OutputFormat;
  runtime?: RuntimeMode;
  mode?: ScanMode;
  onEvent?: (event: { type: string; stage?: string; message: string; data?: unknown }) => void;
  dbPath?: string;
  apiKey?: string;
  model?: string;
  timeout?: number;
  packageVersion?: string;
}

export interface PipelineReport {
  target: string;
  targetType: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: {
    totalAttacks: number;
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  findings: Finding[];
  warnings: Array<{ stage: string; message: string }>;
  // Extras for backwards compat
  package?: string;
  version?: string;
  repo?: string;
  semgrepFindings?: number;
  npmAuditFindings?: NpmAuditFinding[];
}

// ── Internal helpers ──

interface PrepareResult {
  scopePath: string;
  resolvedTarget: string;
  resolvedType: "npm-package" | "source-code" | "url" | "web-app";
  packageName?: string;
  packageVersion?: string;
  tempDir?: string;
  needsCleanup: boolean;
}

/**
 * Detect target type from the raw target string if not explicitly provided.
 */
function detectTargetType(target: string): "npm-package" | "source-code" | "url" | "web-app" {
  if (target.startsWith("http://") || target.startsWith("https://")) {
    return "url";
  }
  // Git URL patterns
  if (target.startsWith("git@") || target.startsWith("git://") || target.endsWith(".git")) {
    return "source-code";
  }
  // Local directory
  if (existsSync(resolve(target))) {
    return "source-code";
  }
  // Default: treat as npm package name
  return "npm-package";
}

/**
 * Phase 1: Prepare the target for analysis.
 *
 * - npm-package: install in temp dir
 * - source-code: clone if URL, resolve if local path
 * - url/web-app: no-op (target is the URL itself)
 */
function prepareTarget(
  opts: PipelineOptions,
  emit: ScanListener,
): PrepareResult {
  const targetType = opts.targetType ?? detectTargetType(opts.target);

  if (targetType === "npm-package") {
    return prepareNpmPackage(opts.target, opts.packageVersion, emit);
  }

  if (targetType === "source-code") {
    return prepareSourceCode(opts.target, emit);
  }

  // url or web-app — nothing to install/clone
  return {
    scopePath: opts.target,
    resolvedTarget: opts.target,
    resolvedType: targetType,
    needsCleanup: false,
  };
}

function prepareNpmPackage(
  packageName: string,
  requestedVersion: string | undefined,
  emit: ScanListener,
): PrepareResult {
  const tempDir = join(tmpdir(), `pwnkit-pipeline-${randomUUID().slice(0, 8)}`);
  mkdirSync(tempDir, { recursive: true });

  const spec = requestedVersion ? `${packageName}@${requestedVersion}` : `${packageName}@latest`;

  emit({ type: "stage:start", stage: "prepare", message: `Installing ${spec}...` });

  try {
    execFileSync("npm", ["init", "-y", "--silent"], {
      cwd: tempDir,
      timeout: 15_000,
      stdio: "pipe",
    });
    execFileSync("npm", ["install", spec, "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: tempDir,
      timeout: 120_000,
      stdio: "pipe",
    });
  } catch (err) {
    rmSync(tempDir, { recursive: true, force: true });
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to install ${spec}: ${msg}`);
  }

  const pkgJsonPath = join(tempDir, "node_modules", packageName, "package.json");
  if (!existsSync(pkgJsonPath)) {
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`Package ${packageName} not found after install. Check the package name.`);
  }

  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  const installedVersion = pkgJson.version as string;
  const packagePath = join(tempDir, "node_modules", packageName);

  emit({ type: "stage:end", stage: "prepare", message: `Installed ${packageName}@${installedVersion}` });

  return {
    scopePath: packagePath,
    resolvedTarget: `npm:${packageName}@${installedVersion}`,
    resolvedType: "npm-package",
    packageName,
    packageVersion: installedVersion,
    tempDir,
    needsCleanup: true,
  };
}

function prepareSourceCode(target: string, emit: ScanListener): PrepareResult {
  const isUrl =
    target.startsWith("https://") ||
    target.startsWith("http://") ||
    target.startsWith("git@") ||
    target.startsWith("git://");

  if (!isUrl) {
    const absPath = resolve(target);
    if (!existsSync(absPath)) {
      throw new Error(`Repository path not found: ${absPath}`);
    }
    return {
      scopePath: absPath,
      resolvedTarget: `repo:${absPath}`,
      resolvedType: "source-code",
      needsCleanup: false,
    };
  }

  const tempDir = join(tmpdir(), `pwnkit-pipeline-${randomUUID().slice(0, 8)}`);
  mkdirSync(tempDir, { recursive: true });

  emit({ type: "stage:start", stage: "prepare", message: `Cloning ${target}...` });

  try {
    execFileSync("git", ["clone", "--depth", "1", target, `${tempDir}/repo`], {
      timeout: 120_000,
      stdio: "pipe",
    });
  } catch (err) {
    rmSync(tempDir, { recursive: true, force: true });
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to clone ${target}: ${msg}`);
  }

  const repoPath = join(tempDir, "repo");

  emit({ type: "stage:end", stage: "prepare", message: `Cloned ${basename(target.replace(/\.git$/, ""))}` });

  return {
    scopePath: repoPath,
    resolvedTarget: `repo:${target}`,
    resolvedType: "source-code",
    tempDir,
    needsCleanup: true,
  };
}

/**
 * Run npm audit against the project directory.
 */
function runNpmAudit(projectDir: string, emit: ScanListener): NpmAuditFinding[] {
  emit({ type: "stage:start", stage: "analyze", message: "Running npm audit..." });

  let rawOutput = "";
  try {
    rawOutput = execSync("npm audit --json", {
      cwd: projectDir,
      timeout: 120_000,
      stdio: "pipe",
    }).toString("utf-8");
  } catch (err) {
    const stdout =
      err && typeof err === "object" && "stdout" in err
        ? (err.stdout as Buffer | string | undefined)
        : undefined;
    const stderr =
      err && typeof err === "object" && "stderr" in err
        ? (err.stderr as Buffer | string | undefined)
        : undefined;
    rawOutput = bufferToString(stdout) || bufferToString(stderr) || "";
  }

  const findings = parseNpmAuditOutput(rawOutput);

  emit({ type: "stage:end", stage: "analyze", message: `npm audit: ${findings.length} advisories` });

  return findings;
}

function parseNpmAuditOutput(rawOutput: string): NpmAuditFinding[] {
  if (!rawOutput.trim()) return [];

  try {
    const raw = JSON.parse(rawOutput) as {
      vulnerabilities?: Record<
        string,
        {
          name?: string;
          severity?: string;
          via?: Array<string | Record<string, unknown>>;
          range?: string;
          fixAvailable?: boolean | { name?: string; version?: string } | string;
        }
      >;
    };

    return Object.entries(raw.vulnerabilities ?? {}).map(([pkgName, vuln]) => {
      const via = (vuln.via ?? []).map((entry) => {
        if (typeof entry === "string") return entry;
        const source = typeof entry.source === "number" ? `GHSA:${entry.source}` : null;
        const title = typeof entry.title === "string" ? entry.title : null;
        const name = typeof entry.name === "string" ? entry.name : null;
        return [name, title, source].filter(Boolean).join(" - ") || "unknown advisory";
      });

      const firstObjectVia = (vuln.via ?? []).find(
        (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
      );

      return {
        name: vuln.name ?? pkgName,
        severity: normalizeSeverity(vuln.severity),
        title:
          (typeof firstObjectVia?.title === "string" && firstObjectVia.title) ||
          via[0] ||
          "npm audit advisory",
        range: vuln.range,
        source:
          typeof firstObjectVia?.source === "number" || typeof firstObjectVia?.source === "string"
            ? (firstObjectVia.source as number | string)
            : undefined,
        url: typeof firstObjectVia?.url === "string" ? firstObjectVia.url : undefined,
        via,
        fixAvailable: formatFixAvailable(vuln.fixAvailable),
      };
    });
  } catch {
    return [];
  }
}

function normalizeSeverity(value: string | undefined): "critical" | "high" | "medium" | "low" | "info" {
  switch ((value ?? "").toLowerCase()) {
    case "critical": return "critical";
    case "high": return "high";
    case "moderate":
    case "medium": return "medium";
    case "low": return "low";
    default: return "info";
  }
}

function formatFixAvailable(
  fixAvailable: boolean | { name?: string; version?: string } | string | undefined,
): boolean | string {
  if (typeof fixAvailable === "string" || typeof fixAvailable === "boolean") return fixAvailable;
  if (fixAvailable && typeof fixAvailable === "object") {
    const next = [fixAvailable.name, fixAvailable.version].filter(Boolean).join("@");
    return next || true;
  }
  return false;
}

// ── CLI prompt builders (for CLI runtime fast path) ──

function buildCliPrompt(
  scopePath: string,
  semgrepFindings: SemgrepFinding[],
  npmAuditFindings: NpmAuditFinding[],
  label: string,
): string {
  const semgrepContext = semgrepFindings.length > 0
    ? semgrepFindings
        .slice(0, 30)
        .map((f, i) => `  ${i + 1}. [${f.severity}] ${f.ruleId} — ${f.path}:${f.startLine}: ${f.message}`)
        .join("\n")
    : "  None.";

  const npmContext = npmAuditFindings.length > 0
    ? npmAuditFindings
        .slice(0, 30)
        .map((f, i) => `  ${i + 1}. [${f.severity}] ${f.name}: ${f.title}`)
        .join("\n")
    : "  None.";

  return `Audit the ${label} at ${scopePath}.

Read the source code, look for: prototype pollution, ReDoS, path traversal, injection, unsafe deserialization, missing validation. Map data flow from untrusted input to sensitive operations. Report any security findings with severity and PoC suggestions.

Semgrep already found these leads:
${semgrepContext}

npm audit found these advisories:
${npmContext}

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

// ── Verify phase ──

async function runVerifyPhase(
  findings: Finding[],
  prepared: PrepareResult,
  opts: PipelineOptions,
  db: any,
  scanId: string,
  emit: ScanListener,
): Promise<Finding[]> {
  // Only source-code and npm-package targets support source verification
  if (prepared.resolvedType !== "source-code" && prepared.resolvedType !== "npm-package") {
    return findings;
  }

  const verifySystemPrompt = sourceVerifyPrompt(prepared.scopePath, findings);

  const verifiedFindings = await runAnalysisAgent({
    role: "review", // reuse review role which has read_file + run_command tools
    scopePath: prepared.scopePath,
    target: prepared.resolvedTarget,
    scanId,
    config: {
      runtime: opts.runtime,
      timeout: opts.timeout,
      depth: opts.depth,
      apiKey: opts.apiKey,
      model: opts.model,
    },
    db,
    emit,
    cliPrompt: buildVerifyCliPrompt(prepared.scopePath, findings),
    agentSystemPrompt: verifySystemPrompt,
    cliSystemPrompt: "You are a security verification agent. Re-read the code for each finding, trace data flow, and confirm or reject each finding. Be precise.",
  });

  // Merge: keep verified findings, mark missing ones as false-positive
  const verifiedIds = new Set(verifiedFindings.map((f) => f.title.toLowerCase()));
  return findings.map((f) => {
    if (verifiedIds.has(f.title.toLowerCase())) {
      // Find the matching verified finding for any updated info
      const verified = verifiedFindings.find(
        (vf) => vf.title.toLowerCase() === f.title.toLowerCase(),
      );
      return {
        ...f,
        status: "verified" as Finding["status"],
        confidence: verified?.confidence ?? f.confidence,
        description: verified?.description ?? f.description,
      };
    }
    return { ...f, status: "false-positive" as Finding["status"] };
  });
}

function buildVerifyCliPrompt(scopePath: string, findings: Finding[]): string {
  const findingList = findings
    .map(
      (f, i) =>
        `${i + 1}. [${f.severity}] ${f.title} (${f.category})\n   ${f.description.slice(0, 300)}`,
    )
    .join("\n\n");

  return `You are verifying security findings in the source code at ${scopePath}.

## Findings to verify:

${findingList}

For each finding:
1. Re-read the vulnerable file independently
2. Trace data flow from entry point to sink
3. Confirm exploitability or mark as false positive

For EACH CONFIRMED finding, output:

---FINDING---
title: <exact title from above>
severity: <critical|high|medium|low|info>
category: <same category>
description: <updated description with verification evidence>
file: <path/to/file.js:lineNumber>
---END---

Only output findings you have CONFIRMED. Omit any you determined are false positives.`;
}

// ── Build summary from findings ──

function buildSummary(findings: Finding[], totalAttacks: number) {
  return {
    totalAttacks,
    totalFindings: findings.length,
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    info: findings.filter((f) => f.severity === "info").length,
  };
}

// ── Main entry point ──

/**
 * Unified pipeline for all pwnkit scan types.
 *
 * Pipeline:
 *   Phase 1: PREPARE  — detect target type, install/clone/resolve
 *   Phase 2: ANALYZE  — semgrep + npm audit (static analysis)
 *   Phase 3: AGENT    — AI agent deep analysis via runAnalysisAgent
 *   Phase 4: VERIFY   — re-read code and confirm findings (source targets only)
 *
 * Reuses runAnalysisAgent() from agent-runner.ts which handles all runtimes
 * (Claude Code CLI, Codex, API with native tool_use, legacy fallback).
 */
export async function runPipeline(opts: PipelineOptions): Promise<PipelineReport> {
  const emit: ScanListener = (opts.onEvent as ScanListener) ?? (() => {});
  const startTime = Date.now();
  const warnings: Array<{ stage: string; message: string }> = [];

  // ── PHASE 1: PREPARE ──
  emit({ type: "stage:start", stage: "prepare", message: "Preparing target..." });

  let prepared: PrepareResult;
  try {
    prepared = prepareTarget(opts, emit);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Prepare failed: ${msg}`);
  }

  emit({ type: "stage:end", stage: "prepare", message: `Target ready: ${prepared.resolvedType}` });

  // Initialize DB (optional, best-effort)
  const db = await (async () => {
    try {
      const { pwnkitDB } = await import("@pwnkit/db");
      return new pwnkitDB(opts.dbPath);
    } catch {
      return null as any;
    }
  })() as any;

  const scanConfig: ScanConfig = {
    target: prepared.resolvedTarget,
    depth: opts.depth,
    format: opts.format,
    runtime: opts.runtime ?? "api",
    mode: opts.mode ?? "deep",
  };
  const scanId = db?.createScan(scanConfig) ?? `pipeline-${randomUUID().slice(0, 8)}`;

  try {
    // ── PHASE 2: ANALYZE (static analysis) ──
    emit({ type: "stage:start", stage: "analyze", message: "Running static analysis..." });

    let semgrepFindings: SemgrepFinding[] = [];
    let npmAuditFindings: NpmAuditFinding[] = [];

    // Semgrep scan (source-code and npm-package targets)
    if (prepared.resolvedType === "source-code" || prepared.resolvedType === "npm-package") {
      try {
        semgrepFindings = runSemgrepScan(
          prepared.scopePath,
          emit,
          prepared.resolvedType === "npm-package" ? { noGitIgnore: true } : undefined,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push({ stage: "analyze", message: `Semgrep scan failed: ${msg}` });
      }
    }

    // npm audit (npm-package targets only, need the temp project dir)
    if (prepared.resolvedType === "npm-package" && prepared.tempDir) {
      try {
        npmAuditFindings = runNpmAudit(prepared.tempDir, emit);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push({ stage: "analyze", message: `npm audit failed: ${msg}` });
      }
    }

    emit({
      type: "stage:end",
      stage: "analyze",
      message: `Analysis complete: ${semgrepFindings.length} semgrep findings, ${npmAuditFindings.length} npm advisories`,
    });

    // ── PHASE 3: AGENT ──
    emit({ type: "stage:start", stage: "agent", message: "AI agent analyzing..." });

    let findings: Finding[] = [];

    if (prepared.resolvedType === "npm-package") {
      // Use audit role with audit-specific prompts
      const agentSystemPrompt = auditAgentPrompt(
        prepared.packageName!,
        prepared.packageVersion!,
        prepared.scopePath,
        semgrepFindings,
        npmAuditFindings,
      );

      findings = await runAnalysisAgent({
        role: "audit",
        scopePath: prepared.scopePath,
        target: prepared.resolvedTarget,
        scanId,
        config: {
          runtime: opts.runtime,
          timeout: opts.timeout,
          depth: opts.depth,
          apiKey: opts.apiKey,
          model: opts.model,
        },
        db,
        emit,
        cliPrompt: buildCliPrompt(
          prepared.scopePath,
          semgrepFindings,
          npmAuditFindings,
          `npm package ${prepared.packageName}@${prepared.packageVersion}`,
        ),
        agentSystemPrompt,
        cliSystemPrompt:
          "You are a security researcher performing an authorized npm package audit. Be thorough and precise. Only report real, exploitable vulnerabilities.",
      });
    } else if (prepared.resolvedType === "source-code") {
      // Use review role with review-specific prompts
      const agentSystemPrompt = reviewAgentPrompt(prepared.scopePath, semgrepFindings);

      findings = await runAnalysisAgent({
        role: "review",
        scopePath: prepared.scopePath,
        target: prepared.resolvedTarget,
        scanId,
        config: {
          runtime: opts.runtime,
          timeout: opts.timeout,
          depth: opts.depth,
          apiKey: opts.apiKey,
          model: opts.model,
        },
        db,
        emit,
        cliPrompt: buildCliPrompt(prepared.scopePath, semgrepFindings, npmAuditFindings, "repository"),
        agentSystemPrompt,
        cliSystemPrompt:
          "You are a security researcher performing an authorized source code review. Be thorough and precise. Only report real, exploitable vulnerabilities.",
      });
    } else {
      // URL / web-app targets — not supported yet in unified pipeline
      // These should use the agentic-scanner.ts flow for now
      warnings.push({
        stage: "agent",
        message: `Target type "${prepared.resolvedType}" is not yet supported in the unified pipeline. Use 'pwnkit scan' for URL/web-app targets.`,
      });
    }

    emit({
      type: "stage:end",
      stage: "agent",
      message: `Agent complete: ${findings.length} findings`,
    });

    // ── PHASE 4: VERIFY (only if findings exist and target is source-based) ──
    if (findings.length > 0 && (prepared.resolvedType === "source-code" || prepared.resolvedType === "npm-package")) {
      emit({ type: "stage:start", stage: "verify", message: `Verifying ${findings.length} findings...` });

      try {
        findings = await runVerifyPhase(findings, prepared, opts, db, scanId, emit);

        const confirmed = findings.filter((f) => f.status !== "false-positive").length;
        const rejected = findings.filter((f) => f.status === "false-positive").length;

        emit({
          type: "stage:end",
          stage: "verify",
          message: `Verification complete: ${confirmed} confirmed, ${rejected} rejected`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push({ stage: "verify", message: `Verification failed: ${msg}` });
        emit({ type: "stage:end", stage: "verify", message: `Verification failed: ${msg}` });
      }
    }

    // ── BUILD REPORT ──
    const confirmedFindings = findings.filter((f) => f.status !== "false-positive");
    const durationMs = Date.now() - startTime;
    const summary = buildSummary(confirmedFindings, semgrepFindings.length + npmAuditFindings.length);

    db?.completeScan(scanId, summary);

    const report: PipelineReport = {
      target: opts.target,
      targetType: prepared.resolvedType,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs,
      summary,
      findings: confirmedFindings,
      warnings,
      // Backwards-compat extras
      ...(prepared.resolvedType === "npm-package"
        ? {
            package: prepared.packageName,
            version: prepared.packageVersion,
            npmAuditFindings,
            semgrepFindings: semgrepFindings.length,
          }
        : {}),
      ...(prepared.resolvedType === "source-code"
        ? {
            repo: opts.target,
            semgrepFindings: semgrepFindings.length,
          }
        : {}),
    };

    return report;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db?.failScan(scanId, msg);
    throw err;
  } finally {
    db?.close();
    // Clean up temporary directories
    if (prepared.needsCleanup && prepared.tempDir) {
      try {
        rmSync(prepared.tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
