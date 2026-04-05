import { readFileSync, existsSync } from "node:fs";
import type { Command } from "commander";
import chalk from "chalk";
import type { ScanDepth, OutputFormat, RuntimeMode, ScanMode, AuthConfig } from "@pwnkit/shared";
import { renderReplay } from "../formatters/replay.js";
import { runUnified } from "./run.js";

/**
 * Parse the --auth flag value into an AuthConfig object.
 * Accepts either a JSON string or a path to a JSON file.
 */
function parseAuthFlag(value: string): AuthConfig {
  let raw: string;
  // If the value looks like a file path (no leading '{'), try reading it
  if (!value.trimStart().startsWith("{") && existsSync(value)) {
    raw = readFileSync(value, "utf-8");
  } else {
    raw = value;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Invalid --auth value: must be a JSON string or path to a JSON file.\n` +
      `Examples:\n` +
      `  --auth '{"type":"bearer","token":"xxx"}'\n` +
      `  --auth '{"type":"cookie","value":"session=abc123"}'\n` +
      `  --auth '{"type":"basic","username":"admin","password":"pass"}'\n` +
      `  --auth '{"type":"header","name":"X-API-Key","value":"xxx"}'\n` +
      `  --auth ./auth.json`,
    );
  }

  const obj = parsed as Record<string, unknown>;
  const validTypes = new Set(["bearer", "cookie", "basic", "header"]);
  if (!obj || typeof obj !== "object" || !validTypes.has(obj.type as string)) {
    throw new Error(
      `Invalid auth config: "type" must be one of: bearer, cookie, basic, header. Got: ${JSON.stringify(obj)}`,
    );
  }

  return obj as unknown as AuthConfig;
}

export function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description("Run autonomous pentest against a URL, web app, or MCP server")
    .requiredOption("--target <target>", "Target URL or mcp:// endpoint")
    .option("--depth <depth>", "Scan depth: quick, default, deep", "default")
    .option("--format <format>", "Output format: terminal, json, md, html, sarif", "terminal")
    .option("--runtime <runtime>", "Runtime: auto (default), api, claude, codex, gemini", "auto")
    .option("--mode <mode>", "Scan mode: probe, deep, mcp, web")
    .option("--timeout <ms>", "Request timeout in milliseconds", "30000")
    .option("--db-path <path>", "Path to SQLite database")
    .option("--api-key <key>", "API key for LLM provider")
    .option("--model <model>", "LLM model to use")
    .option("--repo <path>", "Source code path for white-box scanning (read code before attacking)")
    .option("--auth <json>", "Auth credentials as JSON string or path to JSON file (types: bearer, cookie, basic, header)")
    .option("--api-spec <path>", "Path to OpenAPI 3.x / Swagger 2.0 spec file (JSON or YAML) for pre-loaded endpoint knowledge")
    .option("--export <target>", "Export findings to issue tracker (e.g. github:owner/repo)")
    .option("--race", "Enable best-of-N strategy racing: run multiple attack strategies in parallel", false)
    .option("--verbose", "Show detailed output", false)
    .option("--replay", "Replay the last scan's results", false)
    .action(async (opts) => {
      // ── Replay last scan (--replay flag) ──
      if (opts.replay) {
        try {
          const { pwnkitDB } = await import("@pwnkit/db");
          const db = new pwnkitDB(opts.dbPath);
          const scans = db.listScans(1);
          if (scans.length === 0) {
            console.error(chalk.red("No scan history found. Run a scan first."));
            db.close();
            process.exit(2);
          }
          const lastScan = scans[0];
          const dbFindings = db.getFindings(lastScan.id);
          db.close();

          const summary = lastScan.summary ? JSON.parse(lastScan.summary) : {
            totalAttacks: 0, totalFindings: 0,
            critical: 0, high: 0, medium: 0, low: 0, info: 0,
          };

          const findings = dbFindings.map((f: any) => ({
            id: f.id, templateId: f.templateId, title: f.title,
            description: f.description, severity: f.severity,
            category: f.category, status: f.status,
            evidence: { request: f.evidenceRequest, response: f.evidenceResponse, analysis: f.evidenceAnalysis ?? undefined },
            timestamp: f.timestamp,
          }));

          await renderReplay({ target: lastScan.target, findings, summary, durationMs: lastScan.durationMs ?? 0 });
          return;
        } catch (err) {
          console.error(chalk.red("Failed to replay: " + (err instanceof Error ? err.message : String(err))));
          process.exit(2);
        }
      }

      const mode = (opts.mode
        ? String(opts.mode)
        : String(opts.target).startsWith("mcp://")
          ? "mcp"
          : "deep") as ScanMode;
      const validModes = new Set<ScanMode>(["probe", "deep", "mcp", "web"]);
      if (!validModes.has(mode)) {
        console.error(chalk.red(`Unknown mode '${mode}'. Valid: ${[...validModes].join(", ")}`));
        process.exit(2);
      }

      // Parse --auth flag if provided
      let authConfig: AuthConfig | undefined;
      if (opts.auth) {
        try {
          authConfig = parseAuthFlag(opts.auth as string);
        } catch (err) {
          console.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exit(2);
        }
      }

      await runUnified({
        target: opts.target,
        targetType: "url",
        mode,
        depth: opts.depth as ScanDepth,
        format: (opts.format === "md" ? "markdown" : opts.format) as OutputFormat,
        runtime: (opts.runtime as RuntimeMode) ?? "auto",
        timeout: parseInt(opts.timeout, 10),
        verbose: opts.verbose as boolean,
        dbPath: opts.dbPath as string | undefined,
        apiKey: opts.apiKey as string | undefined,
        model: opts.model as string | undefined,
        repoPath: opts.repo as string | undefined,
        auth: authConfig,
        apiSpecPath: opts.apiSpec as string | undefined,
        exportTarget: opts.export as string | undefined,
        race: opts.race as boolean | undefined,
      });
    });
}
