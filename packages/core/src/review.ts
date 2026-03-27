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
} from "@nightfang/shared";
import type { ScanEvent, ScanListener } from "./scanner.js";
// DB lazy-loaded to avoid native module issues
import { createRuntime } from "./runtime/index.js";
import type { RuntimeType } from "./runtime/index.js";
import { ClaudeApiRuntime } from "./runtime/claude-api.js";
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

  const maxTurns =
    config.depth === "deep" ? 25 : config.depth === "default" ? 15 : 8;

  // Resolve runtime
  let runtimeType: RuntimeType;
  if (config.runtime === "auto") {
    const available = await detectAvailableRuntimes();
    runtimeType = available.size > 0
      ? pickRuntimeForStage("source-analysis", available)
      : "api";
  } else {
    runtimeType = (config.runtime ?? "api") as RuntimeType;
  }

  const runtimeConfig = { type: runtimeType, timeout: config.timeout ?? 120_000 };
  const runtime =
    runtimeType === "api"
      ? new ClaudeApiRuntime(runtimeConfig)
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
