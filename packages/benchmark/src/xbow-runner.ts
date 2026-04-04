#!/usr/bin/env node

/**
 * XBOW Benchmark Runner
 *
 * Runs pwnkit against the XBOW validation benchmarks (104 Docker CTF challenges).
 * Each challenge is a vulnerable web app with a hidden flag.
 *
 * Prerequisites:
 * - Docker + Docker Compose installed
 * - XBOW repo cloned: git clone https://github.com/xbow-engineering/validation-benchmarks /tmp/xbow-benchmarks
 *
 * Usage:
 *   tsx src/xbow-runner.ts                    # run all 104
 *   tsx src/xbow-runner.ts --limit 10         # first 10 only
 *   tsx src/xbow-runner.ts --tag xss          # filter by tag
 *   tsx src/xbow-runner.ts --level 1          # easy only
 *   tsx src/xbow-runner.ts --json             # JSON output
 */

import { execSync, spawnSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { scan, agenticScan } from "@pwnkit/core";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const XBOW_PATH = process.env.XBOW_PATH ?? "/tmp/xbow-benchmarks";

// ── CLI Args ──
const args = process.argv.slice(2);
const limit = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1]) : Infinity;
const tagFilter = args.includes("--tag") ? args[args.indexOf("--tag") + 1] : undefined;
const levelFilter = args.includes("--level") ? parseInt(args[args.indexOf("--level") + 1]) : undefined;
const jsonOutput = args.includes("--json");
const useAgentic = args.includes("--agentic");
const dryRun = args.includes("--dry-run");
const retries = args.includes("--retries") ? parseInt(args[args.indexOf("--retries") + 1]) : 1;

// ── Types ──
interface XbowChallenge {
  id: string;
  name: string;
  description: string;
  level: number;
  tags: string[];
  winCondition: string;
  path: string;
}

interface XbowResult {
  id: string;
  name: string;
  level: number;
  tags: string[];
  passed: boolean;
  flagFound: boolean;
  findingsCount: number;
  durationMs: number;
  error?: string;
}

// ── Load Challenges ──
function loadChallenges(): XbowChallenge[] {
  const benchDir = join(XBOW_PATH, "benchmarks");
  if (!existsSync(benchDir)) {
    console.error(`XBOW benchmarks not found at ${benchDir}`);
    console.error(`Clone them: git clone https://github.com/xbow-engineering/validation-benchmarks ${XBOW_PATH}`);
    process.exit(1);
  }

  const dirs = readdirSync(benchDir).filter((d) => d.startsWith("XBEN-")).sort();
  const challenges: XbowChallenge[] = [];

  for (const dir of dirs) {
    const configPath = join(benchDir, dir, "benchmark.json");
    const yamlPath = join(benchDir, dir, "benchmark.yaml");

    let config: any;
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, "utf8"));
    } else if (existsSync(yamlPath)) {
      // Simple YAML parser for the benchmark format
      const yaml = readFileSync(yamlPath, "utf8");
      config = {
        name: yaml.match(/name:\s*(.+)/)?.[1]?.trim() ?? dir,
        description: yaml.match(/content:\s*(.+)/)?.[1]?.trim() ?? "",
        level: parseInt(yaml.match(/level:\s*(\d)/)?.[1] ?? "2"),
        win_condition: yaml.match(/win_condition:\s*(\w+)/)?.[1] ?? "flag",
        tags: (yaml.match(/tags:\n((?:\s*-\s*.+\n?)*)/)?.[1] ?? "")
          .split("\n")
          .map((l: string) => l.replace(/^\s*-\s*/, "").trim())
          .filter(Boolean),
      };
    } else {
      continue;
    }

    challenges.push({
      id: dir,
      name: config.name ?? dir,
      description: config.description ?? "",
      level: parseInt(config.level ?? "2"),
      tags: config.tags ?? [],
      winCondition: config.win_condition ?? "flag",
      path: join(benchDir, dir),
    });
  }

  return challenges;
}

// ── Docker Helpers ──
function buildChallenge(challenge: XbowChallenge, flag: string): boolean {
  try {
    execSync(`docker compose build --build-arg FLAG=${flag}`, {
      cwd: challenge.path,
      stdio: "pipe",
      timeout: 120_000,
    });
    return true;
  } catch {
    return false;
  }
}

function startChallenge(challenge: XbowChallenge): number | null {
  try {
    execSync("docker compose up -d --wait", {
      cwd: challenge.path,
      stdio: "pipe",
      timeout: 60_000,
    });

    // Get the mapped port
    const output = execSync("docker compose port web 80 2>/dev/null || docker compose port web 5000 2>/dev/null || docker compose port web 5003 2>/dev/null || docker compose port web 8080 2>/dev/null || docker compose ps --format json", {
      cwd: challenge.path,
      encoding: "utf8",
      timeout: 10_000,
    }).trim();

    // Parse port from "0.0.0.0:XXXXX" format
    const portMatch = output.match(/:(\d+)$/m);
    if (portMatch) return parseInt(portMatch[1]);

    // Try parsing JSON format
    try {
      const services = output.split("\n").filter(Boolean).map((l) => JSON.parse(l));
      for (const svc of services) {
        const ports = svc.Publishers ?? [];
        for (const p of ports) {
          if (p.PublishedPort) return p.PublishedPort;
        }
      }
    } catch {}

    return null;
  } catch {
    return null;
  }
}

function stopChallenge(challenge: XbowChallenge): void {
  try {
    execSync("docker compose down -v --remove-orphans", {
      cwd: challenge.path,
      stdio: "pipe",
      timeout: 30_000,
    });
  } catch {}
}

// ── Run Single Challenge ──
async function runChallenge(challenge: XbowChallenge): Promise<XbowResult> {
  const flag = `FLAG{${randomBytes(12).toString("hex")}}`;
  const start = Date.now();

  // Build
  if (!buildChallenge(challenge, flag)) {
    return { id: challenge.id, name: challenge.name, level: challenge.level, tags: challenge.tags, passed: false, flagFound: false, findingsCount: 0, durationMs: Date.now() - start, error: "Docker build failed" };
  }

  // Start
  const port = startChallenge(challenge);
  if (!port) {
    stopChallenge(challenge);
    return { id: challenge.id, name: challenge.name, level: challenge.level, tags: challenge.tags, passed: false, flagFound: false, findingsCount: 0, durationMs: Date.now() - start, error: "Docker start failed or port not found" };
  }

  const target = `http://localhost:${port}`;

  try {
    let report: any;
    if (useAgentic) {
      const dbPath = join(tmpdir(), `pwnkit-xbow-${challenge.id}-${Date.now()}.db`);
      report = await agenticScan({
        config: { target, depth: "quick", format: "json", mode: "web", timeout: 60_000, runtime: "auto" },
        dbPath,
      });
    } else {
      report = await scan({ target, depth: "quick", format: "json", mode: "web", timeout: 30_000 });
    }

    const findings = report.findings ?? [];
    const allText = JSON.stringify(report).toLowerCase();
    const flagFound = allText.includes(flag.toLowerCase());

    return {
      id: challenge.id,
      name: challenge.name,
      level: challenge.level,
      tags: challenge.tags,
      // XBOW uses flag extraction as the only valid pass condition.
      // Generic findings (header issues, fingerprinting) don't count.
      passed: flagFound,
      flagFound,
      findingsCount: findings.length,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: challenge.id,
      name: challenge.name,
      level: challenge.level,
      tags: challenge.tags,
      passed: false,
      flagFound: false,
      findingsCount: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    stopChallenge(challenge);
  }
}

// ── Main ──
async function main() {
  let challenges = loadChallenges();

  if (tagFilter) challenges = challenges.filter((c) => c.tags.includes(tagFilter));
  if (levelFilter) challenges = challenges.filter((c) => c.level === levelFilter);
  challenges = challenges.slice(0, limit);

  if (!jsonOutput) {
    console.log("\x1b[31m\x1b[1m  pwnkit x XBOW benchmark\x1b[0m");
    console.log(`  mode: ${useAgentic ? "agentic" : "baseline"}  challenges: ${challenges.length}/104`);
    console.log("");
  }

  if (dryRun) {
    for (const c of challenges) {
      const levelLabel = ["", "easy", "med", "hard"][c.level] ?? "?";
      console.log(`  [${levelLabel}] ${c.id}  ${c.name}  [${c.tags.join(", ")}]`);
    }
    return;
  }

  const results: XbowResult[] = [];

  for (const challenge of challenges) {
    let result = await runChallenge(challenge);

    // Retry on failure if --retries > 1 (non-deterministic model may succeed on retry)
    for (let attempt = 2; attempt <= retries && !result.flagFound && !result.error; attempt++) {
      if (!jsonOutput) {
        process.stdout.write(`  ... retry ${attempt}/${retries}\n`);
      }
      result = await runChallenge(challenge);
    }

    results.push(result);

    if (!jsonOutput) {
      const icon = result.flagFound ? "\x1b[32mFLAG\x1b[0m" : result.passed ? "\x1b[33mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
      const levelLabel = ["", "easy", "med", "hard"][challenge.level] ?? "?";
      const time = `${(result.durationMs / 1000).toFixed(0)}s`;
      console.log(`  ${icon} [${levelLabel}] ${challenge.name.slice(0, 50).padEnd(50)} ${result.findingsCount} findings  ${time}${result.error ? `  err: ${result.error.slice(0, 40)}` : ""}`);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const flags = results.filter((r) => r.flagFound).length;

  if (jsonOutput) {
    console.log(JSON.stringify({ challenges: challenges.length, passed, flags, results }, null, 2));
  } else {
    console.log("\n  ──────────────────────────────────────");
    console.log(`  Detection:       \x1b[1m${passed}/${challenges.length}\x1b[0m  (${(passed / challenges.length * 100).toFixed(1)}%)`);
    console.log(`  Flag extraction: \x1b[1m${flags}/${challenges.length}\x1b[0m  (${(flags / challenges.length * 100).toFixed(1)}%)`);
    console.log(`  Total time:      ${(results.reduce((a, r) => a + r.durationMs, 0) / 1000).toFixed(0)}s`);

    // By tag
    const tagMap = new Map<string, { total: number; passed: number }>();
    for (const r of results) {
      for (const tag of r.tags) {
        const t = tagMap.get(tag) ?? { total: 0, passed: 0 };
        t.total++;
        if (r.passed) t.passed++;
        tagMap.set(tag, t);
      }
    }
    console.log("\n  By tag:");
    for (const [tag, data] of [...tagMap.entries()].sort((a, b) => b[1].total - a[1].total)) {
      console.log(`    ${tag.padEnd(25)} ${data.passed}/${data.total}`);
    }
    console.log("");
  }

  // Save results
  const resultsDir = join(__dirname, "..", "results");
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(join(resultsDir, "xbow-latest.json"), JSON.stringify({ timestamp: new Date().toISOString(), challenges: challenges.length, passed, flags, results }, null, 2));
}

main().catch((err) => {
  console.error("XBOW benchmark failed:", err);
  process.exit(1);
});
