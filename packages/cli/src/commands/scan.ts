import type { Command } from "commander";
import chalk from "chalk";
import type { ScanDepth, OutputFormat, RuntimeMode } from "@pwnkit/shared";
import { VERSION } from "@pwnkit/shared";
import { scan } from "@pwnkit/core";
import { renderReplay } from "../formatters/replay.js";
import { formatReport } from "../formatters/index.js";
import { checkRuntimeAvailability } from "../utils.js";

export function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description("Run security scan against a URL or API endpoint")
    .requiredOption("--target <url>", "Target URL")
    .option("--depth <depth>", "Scan depth: quick, default, deep", "default")
    .option("--format <format>", "Output format: terminal, json, md", "terminal")
    .option("--runtime <runtime>", "Runtime: api, claude, codex, gemini, auto", "auto")
    .option("--timeout <ms>", "Request timeout in milliseconds", "30000")
    .option("--db-path <path>", "Path to SQLite database")
    .option("--api-key <key>", "API key for LLM provider")
    .option("--model <model>", "LLM model to use")
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

      const format = (opts.format === "md" ? "markdown" : opts.format) as OutputFormat;
      const runtime = (opts.runtime as RuntimeMode) ?? "auto";

      if (format === "terminal") checkRuntimeAvailability();

      // URL targets use the original scanner pipeline (discovery → attack → verify → report)
      // instead of the unified pipeline which only supports npm-package and source-code targets.
      let inkUI: { onEvent: (event: any) => void; setReport: (report: any) => void; waitForExit: () => Promise<void> } | null = null;
      let eventHandler: (event: any) => void = () => {};

      if (format === "terminal") {
        const { renderScanUI } = await import("../ui/renderScan.js");
        inkUI = renderScanUI({ version: VERSION, target: opts.target, depth: opts.depth, mode: "scan" });
        eventHandler = inkUI.onEvent;
      }

      try {
        const report = await scan(
          {
            target: opts.target,
            depth: opts.depth as ScanDepth,
            format,
            runtime,
            timeout: parseInt(opts.timeout, 10),
            verbose: opts.verbose as boolean,
            apiKey: opts.apiKey as string | undefined,
            model: opts.model as string | undefined,
          },
          eventHandler,
          opts.dbPath as string | undefined,
        );

        if (inkUI) {
          inkUI.setReport(report as any);
          await inkUI.waitForExit();
        } else {
          console.log(formatReport(report, format));
        }

        if (report.summary.critical > 0 || report.summary.high > 0) {
          process.exit(1);
        }
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(2);
      }
    });
}
