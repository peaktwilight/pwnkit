import { execFileSync } from "node:child_process";
import type { SemgrepFinding } from "@pwnkit/shared";
import type { RuntimeType } from "./runtime/index.js";
import type { ScanListener } from "./scanner.js";

/**
 * CLI runtimes (claude, codex, etc.) are full agents — they can read files,
 * run commands, and do multi-turn analysis natively. We bypass our own agent
 * loop and let the CLI handle everything, then parse findings from its output.
 */
export const CLI_RUNTIME_TYPES = new Set<RuntimeType>(["claude", "codex", "gemini", ]);

export function bufferToString(value: Buffer | string | undefined): string {
  if (!value) {
    return "";
  }
  return Buffer.isBuffer(value) ? value.toString("utf-8") : value;
}

export function mapSemgrepSeverity(level: string): string {
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
 * Run semgrep security scan against a directory.
 * Returns parsed findings from JSON output.
 *
 * @param targetPath - Path to scan
 * @param emit - Event listener for progress updates
 * @param opts.noGitIgnore - Pass --no-git-ignore flag (used for installed packages outside a git repo)
 */
export function runSemgrepScan(
  targetPath: string,
  emit: ScanListener,
  opts?: { noGitIgnore?: boolean },
): SemgrepFinding[] {
  emit({
    type: "stage:start",
    stage: "source-analysis",
    message: "Running semgrep security scan...",
  });

  const args = [
    "scan",
    "--config",
    "auto",
    "--json",
    ...(opts?.noGitIgnore ? ["--no-git-ignore"] : []),
    "--timeout",
    "60",
    "--max-target-bytes",
    "1000000",
    targetPath,
  ];

  let rawOutput = "";

  try {
    rawOutput = execFileSync("semgrep", args, {
      timeout: 300_000, // 5 min max for semgrep
      stdio: "pipe",
      encoding: "utf-8",
      env: { ...process.env, SEMGREP_SEND_METRICS: "off" },
    });
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
