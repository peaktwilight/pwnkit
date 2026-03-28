import type { Command } from "commander";
import chalk from "chalk";
import { VERSION } from "@pwnkit/shared";
import type { ScanDepth, OutputFormat, RuntimeMode, ScanMode } from "@pwnkit/shared";
import { scan, agenticScan, createRuntime } from "@pwnkit/core";
import { formatReport } from "../formatters/index.js";
import { renderReplay, replayDataFromReport, createReplayCollector } from "../formatters/replay.js";
import { createpwnkitSpinner } from "../spinner.js";
import { createEventHandler } from "../event-handler.js";
import { buildShareUrl, depthLabel } from "../utils.js";

export function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description("Run security scan against an LLM endpoint")
    .requiredOption("--target <url>", "Target API endpoint URL")
    .option("--depth <depth>", "Scan depth: quick, default, deep", "default")
    .option("--format <format>", "Output format: terminal, json, md", "terminal")
    .option("--runtime <runtime>", "Runtime: api, claude, codex, gemini, opencode, auto", "api")
    .option("--mode <mode>", "Scan mode: probe, deep, mcp, web", "probe")
    .option("--repo <path>", "Path to target repo for deep scan source analysis")
    .option("--timeout <ms>", "Request timeout in milliseconds", "30000")
    .option("--agentic", "Use multi-turn agentic scan with tool use and SQLite persistence", false)
    .option("--db-path <path>", "Path to SQLite database (default: ~/.pwnkit/pwnkit.db)")
    .option("--api-key <key>", "API key for LLM provider (or set OPENROUTER_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY)")
    .option("--model <model>", "LLM model to use (or set PWNKIT_MODEL)")
    .option("--verbose", "Show detailed output with live attack replay", false)
    .option("--replay", "Replay the last scan's results as an animated attack chain", false)
    .action(async (opts) => {
      const depth = opts.depth as ScanDepth;
      const format = (opts.format === "md" ? "markdown" : opts.format) as OutputFormat;
      const runtime = opts.runtime as RuntimeMode;
      const mode = opts.mode as ScanMode;
      const verbose = opts.verbose as boolean;
      const replayMode = opts.replay as boolean;

      // ── Replay last scan (--replay flag) ──
      if (replayMode) {
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

          const findings = dbFindings.map((f) => ({
            id: f.id,
            templateId: f.templateId,
            title: f.title,
            description: f.description,
            severity: f.severity as import("@pwnkit/shared").Severity,
            category: f.category as import("@pwnkit/shared").AttackCategory,
            status: f.status as import("@pwnkit/shared").FindingStatus,
            evidence: {
              request: f.evidenceRequest,
              response: f.evidenceResponse,
              analysis: f.evidenceAnalysis ?? undefined,
            },
            timestamp: f.timestamp,
          }));

          await renderReplay({
            target: lastScan.target,
            findings,
            summary,
            durationMs: lastScan.durationMs ?? 0,
          });
          return;
        } catch (err) {
          console.error(
            chalk.red("Failed to replay: " + (err instanceof Error ? err.message : String(err)))
          );
          process.exit(2);
        }
      }

      // Validate runtime value
      const validRuntimes = ["api", "claude", "codex", "gemini", "opencode", "auto"];
      if (!validRuntimes.includes(runtime)) {
        console.error(
          chalk.red(`Unknown runtime '${runtime}'. Valid: ${validRuntimes.join(", ")}`)
        );
        process.exit(2);
      }

      // Deep and MCP modes require a process runtime (web mode works with api runtime)
      if (mode !== "probe" && mode !== "web" && runtime === "api") {
        console.error(
          chalk.red(`Mode '${mode}' requires a process runtime (claude, codex, gemini, opencode, or auto)`)
        );
        process.exit(2);
      }

      // Check runtime availability (auto mode checks at scan time)
      if (runtime !== "api" && runtime !== "auto") {
        const rt = createRuntime({
          type: runtime,
          timeout: parseInt(opts.timeout, 10),
        });
        const available = await rt.isAvailable();
        if (!available) {
          console.error(
            chalk.red(
              `Runtime '${runtime}' not available. Is ${runtime} installed?`
            )
          );
          process.exit(2);
        }
      }

      // ── Banner ──
      if (format === "terminal") {
        console.log("");
        console.log(
          chalk.red.bold("  \u25C6 pwnkit") + chalk.gray(` v${VERSION}`)
        );
        console.log("");
        console.log(
          `  ${chalk.gray("Target:")}  ${chalk.white.bold(opts.target)}`
        );
        console.log(
          `  ${chalk.gray("Depth:")}   ${chalk.white(depth)} ${chalk.gray(`(${depthLabel(depth)})`)}`
        );
        if (runtime !== "api") {
          console.log(
            `  ${chalk.gray("Runtime:")} ${chalk.white(runtime)}`
          );
        }
        if (mode !== "probe") {
          console.log(
            `  ${chalk.gray("Mode:")}    ${chalk.white(mode)}`
          );
        }
        console.log("");
      }

      const spinner = format === "terminal" ? createpwnkitSpinner("Initializing...") : null;
      let attackTotal = 0;
      let attacksDone = 0;

      // Set up replay collector for --verbose mode
      const replayCollector = verbose ? createReplayCollector(opts.target) : null;

      const scanConfig = {
        target: opts.target,
        depth,
        format,
        runtime,
        mode,
        repoPath: opts.repo,
        timeout: parseInt(opts.timeout, 10),
        verbose,
        apiKey: opts.apiKey as string | undefined,
        model: opts.model as string | undefined,
      };

      const baseHandler = createEventHandler({
        format,
        spinner,
        trackAttacks: {
          getTotal: () => attackTotal,
          getDone: () => attacksDone,
          incrementDone: () => { attacksDone++; },
        },
      });

      const eventHandler = (event: { type: string; stage?: string; message: string; data?: unknown }) => {
        // Feed events to replay collector for --verbose post-scan replay
        if (replayCollector) {
          replayCollector.onEvent(event);
        }
        baseHandler(event);
      };

      try {
        const report = opts.agentic
          ? await agenticScan({
              config: scanConfig,
              dbPath: opts.dbPath,
              onEvent: eventHandler,
            })
          : await scan(scanConfig, eventHandler, opts.dbPath);

        // In verbose mode, show the animated attack replay before the report
        if (verbose && format === "terminal") {
          await renderReplay(replayDataFromReport(report));
        }

        const output = formatReport(report, format);
        console.log(output);

        // Print shareable report URL
        if (format === "terminal") {
          console.log(
            `\n  ${chalk.gray("Share this report:")} ${chalk.cyan(buildShareUrl(report))}\n`
          );
        }

        // Exit with non-zero if critical/high findings
        if (report.summary.critical > 0 || report.summary.high > 0) {
          process.exit(1);
        }
        if (report.warnings.length > 0) {
          process.exit(2);
        }
      } catch (err) {
        spinner?.fail("Scan failed");
        console.error(
          chalk.red(err instanceof Error ? err.message : String(err))
        );
        process.exit(2);
      }
    });
}
