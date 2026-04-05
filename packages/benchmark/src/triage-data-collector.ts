#!/usr/bin/env node

/**
 * Triage Training Data Collector
 *
 * Extracts (finding, ground_truth) pairs from XBOW benchmark results.
 * Ground truth comes from flag extraction: if the challenge flag was found,
 * findings from that scan are "true positive" (the vulnerability was real
 * and exploitable). If no flag was found, findings are "false positive"
 * (the agent thought it found something but couldn't prove it).
 *
 * Output: JSONL file suitable for fine-tuning a classifier.
 *
 * Usage:
 *   tsx src/triage-data-collector.ts --db <path-to-pwnkit.db>
 *   tsx src/triage-data-collector.ts --results <xbow-latest.json>
 *   tsx src/triage-data-collector.ts --scan-dir <dir-of-scan-dbs>
 *   tsx src/triage-data-collector.ts --results <xbow-latest.json> --output <dataset.jsonl>
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);

interface TriageSample {
  /** Unique ID for dedup */
  id: string;
  /** The finding title */
  title: string;
  /** Finding description / analysis */
  description: string;
  /** Severity: critical, high, medium, low, informational */
  severity: string;
  /** Attack category: sqli, xss, idor, ssti, etc. */
  category: string;
  /** The PoC request (curl command, HTTP request, etc.) */
  request: string;
  /** The target's response to the PoC */
  response: string;
  /** Agent's analysis text */
  analysis: string;
  /** Agent-assigned confidence (0-1) */
  confidence: number;
  /** GROUND TRUTH: was this a real exploitable vulnerability? */
  label: "true_positive" | "false_positive";
  /** Source: which challenge / scan produced this */
  source: string;
  /** How we determined ground truth */
  label_source: "flag_extraction" | "blind_verify" | "manual";
}

function resolveInputPath(path: string): string {
  const normalized = path.startsWith("packages/benchmark/")
    ? path.slice("packages/benchmark/".length)
    : path;
  const candidates = [
    path,
    normalized,
    join(process.cwd(), path),
    join(process.cwd(), normalized),
    join(__dirname, "..", path),
    join(__dirname, "..", normalized),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return path;
}

function resolveOutputPath(path: string): string {
  if (path.startsWith("/")) return path;
  return path.startsWith("packages/benchmark/")
    ? path.slice("packages/benchmark/".length)
    : path;
}

// ── Collect from XBOW results JSON ──

function collectFromXbowResults(resultsPath: string): TriageSample[] {
  const resolved = resolveInputPath(resultsPath);
  const data = JSON.parse(readFileSync(resolved, "utf8"));
  const samples: TriageSample[] = [];

  for (const result of data.results ?? []) {
    const flagFound = result.flagFound === true;
    const challengeId = result.id ?? "unknown";

    // Each finding from this challenge gets labeled based on flag extraction
    for (const finding of result.findings ?? []) {
      samples.push({
        id: `${challengeId}-${finding.id ?? finding.templateId ?? Math.random().toString(36).slice(2)}`,
        title: finding.title ?? "",
        description: finding.description ?? "",
        severity: finding.severity ?? "medium",
        category: finding.category ?? "unknown",
        request: finding.evidence?.request ?? "",
        response: finding.evidence?.response ?? "",
        analysis: finding.evidence?.analysis ?? "",
        confidence: finding.confidence ?? 0.5,
        label: flagFound ? "true_positive" : "false_positive",
        source: challengeId,
        label_source: "flag_extraction",
      });
    }
  }

  return samples;
}

// ── Collect from pwnkit SQLite DB ──

function collectFromDb(dbPath: string): TriageSample[] {
  const resolved = resolveInputPath(dbPath);
  // Dynamic import to avoid hard dep on better-sqlite3
  let Database: any;
  try {
    Database = require("better-sqlite3");
  } catch {
    console.error("better-sqlite3 not available, skipping DB collection");
    return [];
  }

  const db = new Database(resolved, { readonly: true });
  const samples: TriageSample[] = [];

  try {
    // Get all scans with their findings
    const scans = db.prepare(`
      SELECT s.id as scan_id, s.target, s.mode,
             f.id as finding_id, f.title, f.description, f.severity,
             f.category, f.status, f.confidence,
             f.evidence_request, f.evidence_response, f.evidence_analysis
      FROM scans s
      JOIN findings f ON f.scan_id = s.id
      ORDER BY s.id
    `).all();

    for (const row of scans) {
      // Use finding status as ground truth from blind verify
      const isVerified = row.status === "verified" || row.status === "confirmed";
      const isFalsePositive = row.status === "false_positive" || row.status === "rejected";

      // Skip findings with unknown verification status
      if (!isVerified && !isFalsePositive) continue;

      samples.push({
        id: `db-${row.scan_id}-${row.finding_id}`,
        title: row.title ?? "",
        description: row.description ?? "",
        severity: row.severity ?? "medium",
        category: row.category ?? "unknown",
        request: row.evidence_request ?? "",
        response: row.evidence_response ?? "",
        analysis: row.evidence_analysis ?? "",
        confidence: row.confidence ?? 0.5,
        label: isVerified ? "true_positive" : "false_positive",
        source: `${row.target}-${row.scan_id}`,
        label_source: "blind_verify",
      });
    }
  } catch (err) {
    console.error(`Error reading DB ${resolved}:`, err);
  } finally {
    db.close();
  }

  return samples;
}

// ── Scan directory for DB files ──

function collectFromScanDir(dirPath: string): TriageSample[] {
  const samples: TriageSample[] = [];
  const resolvedDir = resolveInputPath(dirPath);
  const files = readdirSync(resolvedDir).filter((f) => f.endsWith(".db"));

  for (const file of files) {
    const dbPath = join(resolvedDir, file);
    console.error(`  Collecting from ${file}...`);
    samples.push(...collectFromDb(dbPath));
  }

  return samples;
}

// ── Format for ML training ──

function toTrainingFormat(sample: TriageSample): string {
  // Format as a text classification input
  // The model sees: [title] [description] [category] [severity] [request] [response]
  // and predicts: true_positive or false_positive
  const input = [
    `Title: ${sample.title}`,
    `Category: ${sample.category}`,
    `Severity: ${sample.severity}`,
    `Description: ${sample.description.slice(0, 500)}`,
    `Request: ${sample.request.slice(0, 1000)}`,
    `Response: ${sample.response.slice(0, 1000)}`,
    sample.analysis ? `Analysis: ${sample.analysis.slice(0, 500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return JSON.stringify({
    text: input,
    label: sample.label === "true_positive" ? 1 : 0,
    label_text: sample.label,
    source: sample.source,
    confidence: sample.confidence,
  });
}

// ── Main ──

async function main() {
  const allSamples: TriageSample[] = [];

  // Collect from XBOW results
  const resultsIdx = args.indexOf("--results");
  if (resultsIdx !== -1) {
    const path = args[resultsIdx + 1];
    console.error(`Collecting from XBOW results: ${path}`);
    allSamples.push(...collectFromXbowResults(path));
  }

  // Collect from DB
  const dbIdx = args.indexOf("--db");
  if (dbIdx !== -1) {
    const path = args[dbIdx + 1];
    console.error(`Collecting from DB: ${path}`);
    allSamples.push(...collectFromDb(path));
  }

  // Collect from scan directory
  const dirIdx = args.indexOf("--scan-dir");
  if (dirIdx !== -1) {
    const path = args[dirIdx + 1];
    console.error(`Collecting from scan directory: ${path}`);
    allSamples.push(...collectFromScanDir(path));
  }

  // Also auto-collect from any XBOW results in the results directory
  const resultsDir = join(__dirname, "..", "results");
  if (existsSync(resultsDir) && resultsIdx === -1) {
    const jsonFiles = readdirSync(resultsDir).filter((f) => f.endsWith(".json"));
    for (const file of jsonFiles) {
      console.error(`  Auto-collecting from ${file}...`);
      allSamples.push(...collectFromXbowResults(join(resultsDir, file)));
    }
  }

  // Dedup by ID
  const seen = new Set<string>();
  const unique = allSamples.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  // Stats
  const tp = unique.filter((s) => s.label === "true_positive").length;
  const fp = unique.filter((s) => s.label === "false_positive").length;
  const total = tp + fp;
  const tpPct = total > 0 ? (tp / total * 100).toFixed(1) : "0.0";
  const fpPct = total > 0 ? (fp / total * 100).toFixed(1) : "0.0";

  console.error(`\n=== Triage Training Data ===`);
  console.error(`  Total samples:    ${unique.length}`);
  console.error(`  True positives:   ${tp}`);
  console.error(`  False positives:  ${fp}`);
  console.error(`  Balance:          ${tpPct}% TP / ${fpPct}% FP`);

  // Output JSONL to stdout
  const outputPath = args.includes("--output") ? args[args.indexOf("--output") + 1] : undefined;
  const lines = unique.map(toTrainingFormat);

  if (outputPath) {
    const resolvedOutput = resolveOutputPath(outputPath);
    const dir = dirname(resolvedOutput);
    if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
    writeFileSync(resolvedOutput, lines.length > 0 ? lines.join("\n") + "\n" : "");
    console.error(`  Written to: ${resolvedOutput}`);
  } else {
    for (const line of lines) {
      console.log(line);
    }
  }
}

main().catch((err) => {
  console.error("Triage data collection failed:", err);
  process.exit(1);
});
