import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type {
  AuditConfig,
  AuditReport,
  NpmAuditFinding,
  SemgrepFinding,
  Finding,
  ScanConfig,
  Severity,
} from "@nightfang/shared";
import type { ScanEvent, ScanListener } from "./scanner.js";
// DB lazy-loaded to avoid native module issues
import { createRuntime } from "./runtime/index.js";
import type { RuntimeType } from "./runtime/index.js";
import { ClaudeApiRuntime } from "./runtime/claude-api.js";
import { detectAvailableRuntimes, pickRuntimeForStage } from "./runtime/registry.js";
import { runAgentLoop } from "./agent/loop.js";
import { getToolsForRole } from "./agent/tools.js";
import { auditAgentPrompt } from "./audit-prompt.js";

export interface PackageAuditOptions {
  config: AuditConfig;
  onEvent?: ScanListener;
}

interface InstalledPackage {
  name: string;
  version: string;
  path: string;
  tempDir: string;
}

/**
 * Install an npm package in a temporary directory and return its path.
 */
function installPackage(
  packageName: string,
  requestedVersion: string | undefined,
  emit: ScanListener,
): InstalledPackage {
  const tempDir = join(tmpdir(), `nightfang-audit-${randomUUID().slice(0, 8)}`);
  mkdirSync(tempDir, { recursive: true });

  const spec = requestedVersion
    ? `${packageName}@${requestedVersion}`
    : `${packageName}@latest`;

  emit({
    type: "stage:start",
    stage: "discovery",
    message: `Installing ${spec}...`,
  });

  try {
    // Initialize a minimal package.json so npm install works cleanly
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

  // Resolve actual installed version from package.json
  const pkgJsonPath = join(tempDir, "node_modules", packageName, "package.json");
  if (!existsSync(pkgJsonPath)) {
    // Try scoped package path
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error(
      `Package ${packageName} not found after install. Check the package name.`,
    );
  }

  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  const installedVersion = pkgJson.version as string;
  const packagePath = join(tempDir, "node_modules", packageName);

  emit({
    type: "stage:end",
    stage: "discovery",
    message: `Installed ${packageName}@${installedVersion}`,
  });

  return {
    name: packageName,
    version: installedVersion,
    path: packagePath,
    tempDir,
  };
}

/**
 * Run semgrep security scan against the package source.
 * Returns parsed findings from SARIF/JSON output.
 */
function runSemgrepScan(
  packagePath: string,
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
        "--no-git-ignore",
        "--timeout",
        "60",
        "--max-target-bytes",
        "1000000",
        packagePath,
      ],
      {
        timeout: 300_000, // 5 min max for semgrep
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
      // JSON parse failed — semgrep output was malformed
    }
  }

  emit({
    type: "stage:end",
    stage: "source-analysis",
    message: `Semgrep: ${findings.length} findings`,
  });

  return findings;
}

function runNpmAudit(
  projectDir: string,
  emit: ScanListener,
): NpmAuditFinding[] {
  emit({
    type: "stage:start",
    stage: "discovery",
    message: "Running npm audit...",
  });

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

  emit({
    type: "stage:end",
    stage: "discovery",
    message: `npm audit: ${findings.length} advisories`,
  });

  return findings;
}

function parseNpmAuditOutput(rawOutput: string): NpmAuditFinding[] {
  if (!rawOutput.trim()) {
    return [];
  }

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
        if (typeof entry === "string") {
          return entry;
        }

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

function bufferToString(value: Buffer | string | undefined): string {
  if (!value) {
    return "";
  }
  return Buffer.isBuffer(value) ? value.toString("utf-8") : value;
}

function normalizeSeverity(value: string | undefined): Severity {
  switch ((value ?? "").toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "moderate":
    case "medium":
      return "medium";
    case "low":
      return "low";
    default:
      return "info";
  }
}

function formatFixAvailable(
  fixAvailable: boolean | { name?: string; version?: string } | string | undefined,
): boolean | string {
  if (typeof fixAvailable === "string" || typeof fixAvailable === "boolean") {
    return fixAvailable;
  }

  if (fixAvailable && typeof fixAvailable === "object") {
    const next = [fixAvailable.name, fixAvailable.version].filter(Boolean).join("@");
    return next || true;
  }

  return false;
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

/**
 * CLI runtimes (claude, codex, etc.) are full agents — they can read files,
 * run commands, and do multi-turn analysis natively. We bypass our own agent
 * loop and let the CLI handle everything, then parse findings from its output.
 */
const CLI_RUNTIME_TYPES = new Set<RuntimeType>(["claude", "codex", "gemini", "opencode"]);

function buildCliAuditPrompt(
  pkg: InstalledPackage,
  semgrepFindings: SemgrepFinding[],
  npmAuditFindings: NpmAuditFinding[],
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

  return `Audit the npm package at ${pkg.path} (${pkg.name}@${pkg.version}).

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

function parseFindingsFromCliOutput(output: string, scanId: string): Finding[] {
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
      templateId: `cli-audit-${Date.now()}`,
      title,
      description,
      severity: normalizedSeverity,
      category: category as Finding["category"],
      status: "discovered",
      evidence: {
        request: `Audit of source at ${file}`,
        response: description,
        analysis: `Found by CLI agent during automated audit`,
      },
      confidence: undefined,
      timestamp: Date.now(),
    });
  }

  return findings;
}

/**
 * Run an AI agent to analyze semgrep findings and hunt for additional
 * vulnerabilities in the package source code.
 */
async function runAuditAgent(
  pkg: InstalledPackage,
  semgrepFindings: SemgrepFinding[],
  npmAuditFindings: NpmAuditFinding[],
  db: any,
  scanId: string,
  config: AuditConfig,
  emit: ScanListener,
): Promise<Finding[]> {
  emit({
    type: "stage:start",
    stage: "attack",
    message: "AI agent analyzing source code...",
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
      cwd: pkg.path,
    });

    const prompt = buildCliAuditPrompt(pkg, semgrepFindings, npmAuditFindings);
    const result = await cliRuntime.execute(prompt, {
      systemPrompt: "You are a security researcher performing an authorized npm package audit. Be thorough and precise. Only report real, exploitable vulnerabilities.",
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

  // ── Fallback: basic API agent loop ──
  if (runtimeType === "api" || !available.has(runtimeType)) {
    emit({
      type: "stage:start",
      stage: "attack",
      message: "⚠ Install Claude Code or Codex for deep AI analysis. Running basic mode only.",
    });
  }

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
      ? new ClaudeApiRuntime(runtimeConfig)
      : createRuntime(runtimeConfig);

  const agentState = await runAgentLoop({
    config: {
      role: "audit",
      systemPrompt: auditAgentPrompt(
        pkg.name,
        pkg.version,
        pkg.path,
        semgrepFindings,
        npmAuditFindings,
      ),
      tools: getToolsForRole("audit"),
      maxTurns,
      target: `npm:${pkg.name}@${pkg.version}`,
      scanId,
      scopePath: pkg.path,
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
    message: `Agent complete: ${agentState.findings.length} findings, ${agentState.summary}`,
  });

  return agentState.findings;
}

/**
 * Main entry point: audit an npm package for security vulnerabilities.
 *
 * Pipeline:
 * 1. npm install <package>@latest in a temp dir
 * 2. Run semgrep with security rules
 * 3. AI agent analyzes semgrep findings + hunts for additional vulns
 * 4. Generate report with severity and PoC suggestions
 * 5. Persist to nightfang DB
 */
export async function packageAudit(
  opts: PackageAuditOptions,
): Promise<AuditReport> {
  const { config, onEvent } = opts;
  const emit: ScanListener = onEvent ?? (() => {});
  const startTime = Date.now();

  // Step 1: Install package
  const pkg = installPackage(config.package, config.version, emit);

  // Initialize DB and create scan record
  const db = await (async () => { try { const { NightfangDB } = await import("@nightfang/db"); return new NightfangDB(config.dbPath); } catch { return null as any; } })() as any;
  const scanConfig: ScanConfig = {
    target: `npm:${pkg.name}@${pkg.version}`,
    depth: config.depth,
    format: config.format,
    runtime: config.runtime ?? "api",
    mode: "deep",
  };
  const scanId = db.createScan(scanConfig);

  try {
    // Step 2: npm audit + Semgrep scan
    const npmAuditFindings = runNpmAudit(pkg.tempDir, emit);
    const semgrepFindings = runSemgrepScan(pkg.path, emit);

    // Step 3: AI agent analysis
    const findings = await runAuditAgent(
      pkg,
      semgrepFindings,
      npmAuditFindings,
      db,
      scanId,
      config,
      emit,
    );

    // Step 4: Build report
    const durationMs = Date.now() - startTime;
    const summary = {
      totalAttacks: semgrepFindings.length + npmAuditFindings.length,
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
      message: `Audit complete: ${summary.totalFindings} findings (${npmAuditFindings.length} npm advisories, ${semgrepFindings.length} semgrep findings)`,
    });

    const report: AuditReport = {
      package: pkg.name,
      version: pkg.version,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs,
      semgrepFindings: semgrepFindings.length,
      npmAuditFindings,
      summary,
      findings,
    };

    return report;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.failScan(scanId, msg);
    throw err;
  } finally {
    db.close();
    // Clean up temp directory
    try {
      rmSync(pkg.tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
