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
import { researchPrompt, blindVerifyPrompt } from "./agent/prompts.js";
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
 *   Phase 1: PREPARE   — detect target type, install/clone/resolve
 *   Phase 2: ANALYZE   — semgrep + npm audit (static analysis)
 *   Phase 3: RESEARCH  — single AI agent discovers, attacks, and writes PoCs
 *   Phase 4: VERIFY    — parallel blind agents independently verify each finding
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

    // Intercept inner events — convert to analyze sub-actions
    const analyzeEmit: ScanListener = (event) => {
      if (event.type === "stage:start") {
        emit({ type: "stage:start", stage: "analyze", message: event.message });
      }
    };

    let semgrepFindings: SemgrepFinding[] = [];
    let npmAuditFindings: NpmAuditFinding[] = [];

    // Semgrep scan (source-code and npm-package targets)
    if (prepared.resolvedType === "source-code" || prepared.resolvedType === "npm-package") {
      try {
        semgrepFindings = runSemgrepScan(
          prepared.scopePath,
          analyzeEmit,
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

    // ── PHASE 3: RESEARCH (single agent: discover + attack + PoC) ──
    // Check if AI analysis is available
    const hasApiKey = !!(opts.apiKey || process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
    const { detectAvailableRuntimes } = await import("./runtime/registry.js");
    const availableRuntimes = await detectAvailableRuntimes();
    const hasCliRuntime = availableRuntimes.size > 0;

    // Log pipeline decisions to stderr for CI visibility
    if (process.env.CI || process.env.PWNKIT_DEBUG) {
      process.stderr.write(`[pwnkit] Research: apiKey=${hasApiKey}, runtimes=[${[...availableRuntimes].join(",")}], config=${opts.runtime ?? "auto"}\n`);
    }

    if (!hasApiKey && !hasCliRuntime) {
      warnings.push({ stage: "research", message: "No API key or CLI runtime available. AI analysis skipped. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY." });
      emit({ type: "stage:end", stage: "research", message: "Skipped — no API key or CLI runtime" });
      emit({ type: "stage:end", stage: "verify", message: "Skipped" });
      // Skip research + verify, go straight to report
    }

    let findings: Finding[] = [];

    if (hasApiKey || hasCliRuntime) {
    emit({ type: "stage:start", stage: "research", message: "Researching vulnerabilities..." });

    const researchEmit: ScanListener = (event) => {
      if (event.type === "stage:start") {
        emit({ type: "stage:start", stage: "research", message: event.message });
      } else if (event.type === "finding") {
        emit(event);
      }
    };

    

    if (prepared.resolvedType === "npm-package" || prepared.resolvedType === "source-code") {
      const targetLabel = prepared.resolvedType === "npm-package"
        ? `npm package ${prepared.packageName}@${prepared.packageVersion}`
        : "repository";

      const agentSystemPrompt = researchPrompt(
        prepared.scopePath,
        semgrepFindings.map(f => ({ ruleId: f.ruleId, message: f.message, path: f.path, startLine: f.startLine })),
        npmAuditFindings.map(f => ({ name: f.name, severity: f.severity, title: f.title })),
        targetLabel,
      );

      try {
        findings = await runAnalysisAgent({
          role: prepared.resolvedType === "npm-package" ? "audit" : "review",
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
          emit: researchEmit,
          cliPrompt: buildCliPrompt(
            prepared.scopePath,
            semgrepFindings,
            npmAuditFindings,
            targetLabel,
          ),
          agentSystemPrompt,
          cliSystemPrompt:
            "You are a security researcher performing an authorized source code audit. For EACH vulnerability you find, output it using the exact ---FINDING--- / ---END--- format specified in the prompt. Do NOT write prose analysis — only output structured finding blocks. If you find no vulnerabilities, say 'No vulnerabilities found.' and nothing else.",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push({ stage: "research", message: `AI analysis failed: ${msg}` });
      }
    } else {
      // URL / web-app targets — not supported yet in unified pipeline
      warnings.push({
        stage: "research",
        message: `Target type "${prepared.resolvedType}" is not yet supported in the unified pipeline. Use 'pwnkit scan' for URL/web-app targets.`,
      });
    }

    emit({
      type: "stage:end",
      stage: "research",
      message: `${findings.length} findings discovered`,
    });

    // ── PHASE 4: VERIFY (parallel blind agents) ──
    if (findings.length > 0 && (prepared.resolvedType === "source-code" || prepared.resolvedType === "npm-package")) {
      emit({ type: "stage:start", stage: "verify", message: `Blind-verifying ${findings.length} findings...` });

      try {
        const verifyResults = await Promise.all(
          findings.map(async (finding) => {
            // Extract file path from evidence_request field
            const filePath = finding.evidence.request || "";
            // Extract PoC from evidence_response (the PoC code)
            const poc = finding.evidence.response || finding.evidence.analysis || "";
            const claimedSeverity = finding.severity;

            const verifySystemPrompt = blindVerifyPrompt(
              filePath,
              poc,
              claimedSeverity,
              prepared.scopePath,
            );

            const verifyEmit: ScanListener = (event) => {
              if (event.type === "finding") {
                emit({ type: "verify:result", message: `Confirmed: ${finding.title}`, data: { confirmed: true, finding } });
              }
            };

            try {
              const verifiedFindings = await runAnalysisAgent({
                role: "review",
                scopePath: prepared.scopePath,
                target: prepared.resolvedTarget,
                scanId,
                config: {
                  runtime: "api", // API runtime: cheaper and faster for focused verification
                  timeout: Math.min(opts.timeout ?? 120_000, 120_000),
                  depth: "quick",
                  apiKey: opts.apiKey,
                  model: opts.model,
                },
                db,
                emit: verifyEmit,
                cliPrompt: `Verify this vulnerability in ${filePath}:\n\nPoC:\n${poc}\n\nClaimed severity: ${claimedSeverity}\n\nRead the file, trace data flow, confirm or reject.`,
                agentSystemPrompt: verifySystemPrompt,
                cliSystemPrompt: "You are a blind verification agent. Read the file, trace the PoC, confirm or reject the vulnerability.",
              });

              const confirmed = verifiedFindings.length > 0;
              const rejectionReason = confirmed ? undefined : "Could not independently reproduce";
              return { finding, confirmed, verifiedFinding: verifiedFindings[0] ?? null, rejectionReason };
            } catch (err) {
              // If verification fails, keep the finding (fail-open)
              const msg = err instanceof Error ? err.message : String(err);
              warnings.push({ stage: "verify", message: `Verification failed for "${finding.title}": ${msg}` });
              return { finding, confirmed: true, verifiedFinding: null };
            }
          }),
        );

        // Emit results and filter
        let confirmedCount = 0;
        let rejectedCount = 0;

        findings = verifyResults
          .map(({ finding, confirmed, verifiedFinding, rejectionReason }) => {
            if (confirmed) {
              confirmedCount++;
              emit({ type: "verify:result", message: `Confirmed: ${finding.title}`, data: { confirmed: true, title: finding.title } });
              return {
                ...finding,
                status: "verified" as Finding["status"],
                confidence: verifiedFinding?.confidence ?? finding.confidence,
                severity: verifiedFinding?.severity ?? finding.severity,
              };
            } else {
              rejectedCount++;
              emit({ type: "verify:result", message: `Rejected: ${finding.title}`, data: { confirmed: false, title: finding.title, reason: rejectionReason ?? "Could not independently reproduce" } });
              return { ...finding, status: "false-positive" as Finding["status"] };
            }
          });

        emit({
          type: "stage:end",
          stage: "verify",
          message: `Verification complete: ${confirmedCount} confirmed, ${rejectedCount} rejected`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push({ stage: "verify", message: `Verification failed: ${msg}` });
        emit({ type: "stage:end", stage: "verify", message: `Verification failed: ${msg}` });
      }
    }

    } // end of hasApiKey || hasCliRuntime else block

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
