import type { Command } from "commander";
import chalk from "chalk";
import { VERSION } from "@pwnkit/shared";
import type { ScanDepth, OutputFormat, RuntimeMode } from "@pwnkit/shared";
import { createRuntime, packageAudit, runPipeline } from "@pwnkit/core";
import { formatAuditReport } from "../formatters/index.js";
import { createpwnkitSpinner } from "../spinner.js";
import { createEventHandler } from "../event-handler.js";
import { buildShareUrl, checkRuntimeAvailability } from "../utils.js";

export function registerAuditCommand(program: Command): void {
  program
    .command("audit")
    .description("Audit an npm package for security vulnerabilities")
    .argument("<package>", "npm package name (e.g. lodash, express)")
    .option("--version <version>", "Specific version to audit (default: latest)")
    .option("--depth <depth>", "Audit depth: quick, default, deep", "default")
    .option("--format <format>", "Output format: terminal, json, md", "terminal")
    .option("--runtime <runtime>", "Runtime: auto, claude, codex, gemini, opencode, api", "auto")
    .option("--db-path <path>", "Path to SQLite database")
    .option("--api-key <key>", "API key for LLM provider (or set OPENROUTER_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY)")
    .option("--model <model>", "LLM model to use (or set PWNKIT_MODEL)")
    .option("--verbose", "Show detailed output", false)
    .option("--timeout <ms>", "AI agent timeout in milliseconds", "600000")
    .action(async (packageName: string, opts: Record<string, string | boolean>) => {
      const depth = (opts.depth as ScanDepth) ?? "default";
      const format = (opts.format === "md" ? "markdown" : opts.format) as OutputFormat;
      const runtime = opts.runtime as RuntimeMode;
      const verbose = opts.verbose as boolean;

      const validRuntimes = ["api", "claude", "codex", "gemini", "opencode", "auto"];
      if (!validRuntimes.includes(runtime)) {
        console.error(
          chalk.red(`Unknown runtime '${runtime}'. Valid: ${validRuntimes.join(", ")}`)
        );
        process.exit(2);
      }

      if (runtime !== "api" && runtime !== "auto") {
        const rt = createRuntime({
          type: runtime,
          timeout: parseInt(opts.timeout as string, 10),
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

      // Banner only for non-Ink output (json/md)
      if (format !== "terminal") {
        // no banner for json/md
      }

      if (format === "terminal") checkRuntimeAvailability();

      // Use Ink TUI for terminal output, fallback to spinner for json/md
      const useInkUI = format === "terminal";
      let inkUI: ReturnType<typeof import("../ui/renderScan.js").renderScanUI> | null = null;
      let spinner: ReturnType<typeof createpwnkitSpinner> | null = null;
      let eventHandler: (event: any) => void;

      if (useInkUI) {
        const { renderScanUI } = await import("../ui/renderScan.js");
        inkUI = renderScanUI({ version: VERSION, target: packageName, depth, mode: "audit" });
        eventHandler = inkUI.onEvent;
      } else {
        spinner = createpwnkitSpinner("Initializing audit...");
        eventHandler = createEventHandler({ format, spinner });
      }

      try {
        // Use unified pipeline for Ink TUI, legacy packageAudit for json/md
        const report = useInkUI
          ? await runPipeline({
              target: packageName,
              targetType: "npm-package",
              depth,
              format,
              runtime,
              onEvent: eventHandler,
              dbPath: opts.dbPath as string | undefined,
              apiKey: opts.apiKey as string | undefined,
              model: opts.model as string | undefined,
              timeout: parseInt(opts.timeout as string, 10),
              packageVersion: opts.version as string | undefined,
            })
          : await packageAudit({
              config: {
                package: packageName,
                version: opts.version as string | undefined,
                depth,
                format,
                runtime,
                timeout: parseInt(opts.timeout as string, 10),
                verbose,
                dbPath: opts.dbPath as string | undefined,
                apiKey: opts.apiKey as string | undefined,
                model: opts.model as string | undefined,
              },
              onEvent: eventHandler,
            });

        if (inkUI) {
          inkUI.setReport(report as any);
          await inkUI.waitForExit();
        } else {
          const output = formatAuditReport(report as any, format);
          console.log(output);

          if (format === "terminal") {
            console.log(
              `\n  ${chalk.gray("Share this report:")} ${chalk.cyan(buildShareUrl(report as any))}\n`
            );
          }
        }

        // Exit with non-zero if critical/high findings
        if (report.summary.critical > 0 || report.summary.high > 0) {
          process.exit(1);
        }
      } catch (err) {
        spinner?.fail("Audit failed");
        console.error(
          chalk.red(err instanceof Error ? err.message : String(err))
        );
        process.exit(2);
      }
    });
}
