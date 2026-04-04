#!/usr/bin/env node

/**
 * pwnkit npm audit benchmark — issue #21
 *
 * Ground-truth test suite for npm package security scanning.
 * 30 cases: 10 known-malicious, 10 known-CVE, 10 known-safe.
 *
 * Usage:
 *   tsx src/npm-bench.ts
 *   tsx src/npm-bench.ts --json
 *   tsx src/npm-bench.ts --depth deep
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI Args ──

const args = process.argv.slice(2);
const depth = args.includes("--depth") ? args[args.indexOf("--depth") + 1] : "quick";
const jsonOutput = args.includes("--json");

// ── Ground Truth ──

type Verdict = "malicious" | "vulnerable" | "safe";

interface TestCase {
  /** npm package specifier (name or name@version) */
  pkg: string;
  verdict: Verdict;
  /** Short description of why this is in the ground truth set */
  reason: string;
}

const TEST_CASES: TestCase[] = [
  // ── Known malicious (should be flagged) ──
  { pkg: "event-stream",   verdict: "malicious", reason: "supply-chain attack — flatmap-stream dependency" },
  { pkg: "ua-parser-js",   verdict: "malicious", reason: "compromised version shipped crypto-miner" },
  { pkg: "colors",         verdict: "malicious", reason: "maintainer sabotaged with infinite loop (v1.4.1+)" },
  { pkg: "faker",          verdict: "malicious", reason: "maintainer sabotaged, replaced with ENDGAME" },
  { pkg: "node-ipc",       verdict: "malicious", reason: "protestware / peacenotwar geo-targeted wiper" },
  { pkg: "coa",            verdict: "malicious", reason: "hijacked — malicious preinstall script" },
  { pkg: "rc",             verdict: "malicious", reason: "hijacked — malicious preinstall script" },
  { pkg: "eslint-scope",   verdict: "malicious", reason: "credential-theft via npm token exfiltration" },
  { pkg: "crossenv",       verdict: "malicious", reason: "typosquat of cross-env — data exfiltration" },
  { pkg: "loadsh",         verdict: "malicious", reason: "typosquat of lodash" },

  // ── Known CVE packages (should report vulnerabilities) ──
  { pkg: "lodash@4.17.20",     verdict: "vulnerable", reason: "prototype pollution CVE-2021-23337" },
  { pkg: "minimist@1.2.5",     verdict: "vulnerable", reason: "prototype pollution CVE-2021-44906" },
  { pkg: "node-forge@0.9.0",   verdict: "vulnerable", reason: "multiple CVEs in older forge" },
  { pkg: "express@4.17.1",     verdict: "vulnerable", reason: "path traversal in serve-static dep" },
  { pkg: "axios@0.21.0",       verdict: "vulnerable", reason: "SSRF CVE-2021-3749" },
  { pkg: "tar@4.4.12",         verdict: "vulnerable", reason: "arbitrary file overwrite CVE-2021-32803" },
  { pkg: "glob-parent@5.1.0",  verdict: "vulnerable", reason: "ReDoS CVE-2021-35065" },
  { pkg: "json5@2.2.1",        verdict: "vulnerable", reason: "prototype pollution CVE-2022-46175" },
  { pkg: "qs@6.5.2",           verdict: "vulnerable", reason: "prototype pollution CVE-2022-24999" },
  { pkg: "semver@7.3.7",       verdict: "vulnerable", reason: "ReDoS CVE-2022-25883" },

  // ── Safe packages (should produce 0 findings) ──
  { pkg: "express@latest",     verdict: "safe", reason: "widely-used, patched" },
  { pkg: "react@latest",       verdict: "safe", reason: "well-maintained, no known issues" },
  { pkg: "typescript@latest",  verdict: "safe", reason: "well-maintained, no known issues" },
  { pkg: "zod@latest",         verdict: "safe", reason: "well-maintained, no known issues" },
  { pkg: "drizzle-orm@latest", verdict: "safe", reason: "well-maintained, no known issues" },
  { pkg: "vitest@latest",      verdict: "safe", reason: "well-maintained, no known issues" },
  { pkg: "esbuild@latest",     verdict: "safe", reason: "well-maintained, no known issues" },
  { pkg: "chalk@latest",       verdict: "safe", reason: "well-maintained, no known issues" },
  { pkg: "commander@latest",   verdict: "safe", reason: "well-maintained, no known issues" },
  { pkg: "dotenv@latest",      verdict: "safe", reason: "well-maintained, no known issues" },
];

// ── Types ──

interface CaseResult {
  pkg: string;
  verdict: Verdict;
  reason: string;
  findingsCount: number;
  hasFindings: boolean;
  correct: boolean;
  durationMs: number;
  error?: string;
}

interface NpmBenchReport {
  timestamp: string;
  depth: string;
  totalCases: number;
  /** True positive + true negative rate */
  accuracy: number;
  /** TP / (TP + FN) — how many bad packages we caught */
  detectionRate: number;
  /** FP / (FP + TN) — how often we cry wolf on safe packages */
  falsePositiveRate: number;
  /** Harmonic mean of precision and recall */
  f1: number;
  totalDurationMs: number;
  results: CaseResult[];
  verdictBreakdown: Record<Verdict, { total: number; correct: number; rate: number }>;
}

// ── Runner ──

async function auditPackage(pkg: string): Promise<{ findings: any[]; raw: string }> {
  try {
    const { stdout } = await execFileAsync(
      "pwnkit",
      ["audit", pkg, "--format", "json", "--depth", depth],
      { timeout: 60_000 },
    );
    const parsed = JSON.parse(stdout);
    return { findings: parsed.findings ?? [], raw: stdout };
  } catch (err: any) {
    // pwnkit may exit non-zero when findings exist; try to parse stdout anyway
    if (err.stdout) {
      try {
        const parsed = JSON.parse(err.stdout);
        return { findings: parsed.findings ?? [], raw: err.stdout };
      } catch {
        // fall through
      }
    }
    throw err;
  }
}

function shouldHaveFindings(verdict: Verdict): boolean {
  return verdict === "malicious" || verdict === "vulnerable";
}

async function runNpmBench(): Promise<NpmBenchReport> {
  const results: CaseResult[] = [];
  const start = Date.now();

  for (const tc of TEST_CASES) {
    const caseStart = Date.now();
    try {
      const { findings } = await auditPackage(tc.pkg);
      const hasFindings = findings.length > 0;
      const expectFindings = shouldHaveFindings(tc.verdict);
      const correct = hasFindings === expectFindings;

      results.push({
        pkg: tc.pkg,
        verdict: tc.verdict,
        reason: tc.reason,
        findingsCount: findings.length,
        hasFindings,
        correct,
        durationMs: Date.now() - caseStart,
      });
    } catch (err) {
      results.push({
        pkg: tc.pkg,
        verdict: tc.verdict,
        reason: tc.reason,
        findingsCount: 0,
        hasFindings: false,
        correct: false,
        durationMs: Date.now() - caseStart,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Terminal progress
    const last = results[results.length - 1];
    const icon = last.error
      ? "\x1b[33m?\x1b[0m"
      : last.correct
        ? "\x1b[32m✓\x1b[0m"
        : "\x1b[31m✗\x1b[0m";

    if (!jsonOutput) {
      console.log(
        `  ${icon} [${last.verdict.padEnd(10)}] ${last.pkg.padEnd(30)} ${last.findingsCount} findings  ${last.durationMs}ms${last.error ? "  ERR" : ""}`,
      );
    }
  }

  // ── Metrics ──

  // Confusion matrix (positive = "should have findings")
  let tp = 0; // bad pkg flagged
  let fn = 0; // bad pkg missed
  let fp = 0; // safe pkg wrongly flagged
  let tn = 0; // safe pkg correctly clean

  for (const r of results) {
    const expectPositive = shouldHaveFindings(r.verdict);
    if (expectPositive && r.hasFindings) tp++;
    else if (expectPositive && !r.hasFindings) fn++;
    else if (!expectPositive && r.hasFindings) fp++;
    else tn++;
  }

  const accuracy = (tp + tn) / results.length;
  const detectionRate = tp + fn > 0 ? tp / (tp + fn) : 0;
  const falsePositiveRate = fp + tn > 0 ? fp / (fp + tn) : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = detectionRate;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // Per-verdict breakdown
  const verdictBreakdown = {} as Record<Verdict, { total: number; correct: number; rate: number }>;
  for (const v of ["malicious", "vulnerable", "safe"] as Verdict[]) {
    const subset = results.filter((r) => r.verdict === v);
    const correct = subset.filter((r) => r.correct).length;
    verdictBreakdown[v] = {
      total: subset.length,
      correct,
      rate: subset.length > 0 ? correct / subset.length : 0,
    };
  }

  return {
    timestamp: new Date().toISOString(),
    depth,
    totalCases: results.length,
    accuracy,
    detectionRate,
    falsePositiveRate,
    f1,
    totalDurationMs: Date.now() - start,
    results,
    verdictBreakdown,
  };
}

// ── Main ──

async function main() {
  if (!jsonOutput) {
    console.log("\n\x1b[31m\x1b[1m  pwnkit npm audit benchmark\x1b[0m");
    console.log(`  depth: ${depth}  cases: ${TEST_CASES.length}\n`);
  }

  const report = await runNpmBench();

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("\n  ──────────────────────────────────────");
    console.log(`  Accuracy:          \x1b[1m${(report.accuracy * 100).toFixed(1)}%\x1b[0m  (${Math.round(report.accuracy * report.totalCases)}/${report.totalCases})`);
    console.log(`  Detection rate:    \x1b[1m${(report.detectionRate * 100).toFixed(1)}%\x1b[0m  (recall)`);
    console.log(`  False positive:    \x1b[1m${(report.falsePositiveRate * 100).toFixed(1)}%\x1b[0m`);
    console.log(`  F1 score:          \x1b[1m${report.f1.toFixed(3)}\x1b[0m`);
    console.log(`  Total time:        ${(report.totalDurationMs / 1000).toFixed(1)}s`);

    console.log("\n  By verdict:");
    for (const [verdict, data] of Object.entries(report.verdictBreakdown)) {
      const bar =
        "\x1b[32m" +
        "█".repeat(Math.round(data.rate * 10)) +
        "\x1b[0m" +
        "░".repeat(10 - Math.round(data.rate * 10));
      console.log(`    ${verdict.padEnd(14)} ${bar} ${data.correct}/${data.total}`);
    }
    console.log("");
  }

  // Save results
  const resultsDir = join(__dirname, "..", "results");
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(
    join(resultsDir, "npm-bench-latest.json"),
    JSON.stringify(report, null, 2),
  );

  if (!jsonOutput) {
    console.log(`  Results saved to results/npm-bench-latest.json\n`);
  }
}

main().catch((err) => {
  console.error("npm-bench failed:", err);
  process.exit(1);
});
