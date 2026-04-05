import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import chalk from "chalk";
import { VERSION } from "@pwnkit/shared";
import type { ScanDepth, OutputFormat, RuntimeMode, ScanMode, AuthConfig } from "@pwnkit/shared";
import { agenticScan, runPipeline, createRuntime } from "@pwnkit/core";
import { formatAuditReport, formatReviewReport, formatReport } from "../formatters/index.js";
import { buildShareUrl, checkRuntimeAvailability } from "../utils.js";

export interface RunOptions {
  target: string;
  targetType?: "npm-package" | "source-code" | "url" | "web-app";
  resumeScanId?: string;
  diffBase?: string;
  changedOnly?: boolean;
  depth: ScanDepth;
  format: OutputFormat;
  runtime: RuntimeMode;
  mode?: ScanMode;
  timeout: number;
  verbose: boolean;
  dbPath?: string;
  apiKey?: string;
  model?: string;
  packageVersion?: string;
  reportPath?: string;
  repoPath?: string;
  auth?: AuthConfig;
  exportTarget?: string;
}

export async function runUnified(opts: RunOptions): Promise<void> {
  const { target, depth, format, runtime, timeout } = opts;

  const validRuntimes = ["api", "claude", "codex", "gemini", "auto"];
  if (!validRuntimes.includes(runtime)) {
    console.error(chalk.red(`Unknown runtime '${runtime}'. Valid: ${validRuntimes.join(", ")}`));
    process.exit(2);
  }

  // Check non-auto runtime availability
  if (runtime !== "api" && runtime !== "auto") {
    const rt = createRuntime({ type: runtime, timeout });
    const available = await rt.isAvailable();
    if (!available) {
      console.error(chalk.red(`Runtime '${runtime}' not available. Is ${runtime} installed?`));
      process.exit(2);
    }
  }

  if (format === "terminal") await checkRuntimeAvailability(runtime);

  // Ink TUI for terminal, silent for json/md
  let inkUI: { onEvent: (event: any) => void; setReport: (report: any) => void; waitForExit: () => Promise<void> } | null = null;
  let eventHandler: (event: any) => void = () => {};

  if (format === "terminal" && process.stdout.isTTY && process.stdin.isTTY) {
    const { renderScanUI } = await import("../ui/renderScan.js");
    const mode = opts.targetType === "npm-package" ? "audit"
      : opts.targetType === "source-code" ? "review"
      : "scan";
    inkUI = renderScanUI({ version: VERSION, target, depth, mode });
    eventHandler = inkUI.onEvent;
  }

  try {
    const report = opts.targetType === "url" || opts.targetType === "web-app"
      ? await agenticScan({
          config: {
            target,
            depth,
            format,
            runtime,
            mode: opts.mode ?? "deep",
            timeout,
            verbose: opts.verbose,
            apiKey: opts.apiKey,
            model: opts.model,
            repoPath: opts.repoPath,
            auth: opts.auth,
          },
          dbPath: opts.dbPath,
          onEvent: eventHandler,
          resumeScanId: opts.resumeScanId,
        })
      : await runPipeline({
          target,
          targetType: opts.targetType,
          resumeScanId: opts.resumeScanId,
          diffBase: opts.diffBase,
          changedOnly: opts.changedOnly,
          depth,
          format,
          runtime,
          onEvent: eventHandler,
          dbPath: opts.dbPath,
          apiKey: opts.apiKey,
          model: opts.model,
          timeout,
          packageVersion: opts.packageVersion,
        } as any);

    if (inkUI) {
      inkUI.setReport(report as any);
      await inkUI.waitForExit();
    } else {
      const reportAny = report as any;
      const output = reportAny.targetType === "npm-package"
        ? formatAuditReport(reportAny, format)
        : reportAny.targetType === "source-code"
          ? formatReviewReport(reportAny, format)
          : formatReport(reportAny, format);

      if (format === "html") {
        const filePath = opts.reportPath
          ? resolve(opts.reportPath)
          : join(tmpdir(), `pwnkit-report-${Date.now()}.html`);
        await writeFile(filePath, output, "utf-8");
        console.log(chalk.green(`Report saved to: ${filePath}`));
        const openCmd = process.platform === "darwin" ? "open" : "xdg-open";
        execFile(openCmd, [filePath], () => {});
      } else {
        console.log(output);
      }
    }

    // ── Export findings to issue tracker if requested ──
    if (opts.exportTarget) {
      const match = opts.exportTarget.match(/^github:(.+\/.+)$/);
      if (!match) {
        console.error(
          chalk.red(`Invalid --export format: '${opts.exportTarget}'. Expected: github:owner/repo`),
        );
        process.exit(2);
      }
      const repo = match[1];
      const reportAny = report as any;
      const findings = reportAny.findings ?? [];
      if (findings.length === 0) {
        console.log(chalk.yellow("No findings to export."));
      } else {
        const { exportToGitHubIssues } = await import("../exporters/github-issues.js");
        console.log(chalk.blue(`Exporting ${findings.length} finding(s) to GitHub Issues on ${repo}...`));
        const result = await exportToGitHubIssues(findings, repo);
        console.log(
          chalk.green(`Export complete: ${result.created} created, ${result.skipped} skipped (duplicates).`),
        );
      }
    }

    if (report.summary.critical > 0 || report.summary.high > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(2);
  }
}
