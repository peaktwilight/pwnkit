#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { VERSION } from "@nightfang/shared";
import { createNightfangSpinner } from "./spinner.js";
import type {
  ScanDepth,
  OutputFormat,
  RuntimeMode,
  ScanMode,
} from "@nightfang/shared";
import { scan, agenticScan, createRuntime, packageAudit, sourceReview } from "@nightfang/core";
import { formatReport, formatAuditReport, formatReviewReport } from "./formatters/index.js";
import { renderProgressBar } from "./formatters/terminal.js";
import { renderReplay, replayDataFromReport, createReplayCollector } from "./formatters/replay.js";
import type { ScanReport, AuditReport, ReviewReport } from "@nightfang/shared";
import { gzipSync } from "zlib";

/**
 * Encode a report as a base64url-encoded gzipped JSON string for use in a share URL.
 */
function buildShareUrl(report: ScanReport | AuditReport | ReviewReport): string {
  const json = JSON.stringify(report);
  const compressed = gzipSync(Buffer.from(json, "utf-8"));
  const b64 = compressed.toString("base64url");
  return `https://nightfang.dev/r#${b64}`;
}

// ── "Holy Shit" First-Run Interactive Menu ──
async function showInteractiveMenu(): Promise<void> {
  const { select, text, isCancel, outro } = await import("@clack/prompts");

  console.log("");
  console.log(
    chalk.red.bold("  nightfang") +
    chalk.gray(` v${VERSION}`) +
    chalk.gray(" — AI-Powered Agentic Security Scanner")
  );
  console.log("");

  const action = await select({
    message: "What would you like to do?",
    options: [
      { value: "scan",    label: "Scan an endpoint" },
      { value: "audit",   label: "Audit an npm package" },
      { value: "review",  label: "Review a codebase" },
      { value: "history", label: "View past results" },
      { value: "docs",    label: "Read the docs" },
    ],
  });

  if (isCancel(action)) {
    outro(chalk.gray("Goodbye."));
    process.exit(0);
  }

  if (action === "docs") {
    const { exec } = await import("child_process");
    const url = "https://nightfang.dev";
    const openCmd =
      process.platform === "darwin" ? `open ${url}` :
      process.platform === "win32"  ? `start ${url}` :
      `xdg-open ${url}`;
    exec(openCmd);
    outro(chalk.gray(`Opening ${url} in your browser...`));
    return;
  }

  if (action === "scan") {
    const target = await text({
      message: "Target URL:",
      placeholder: "http://localhost:4100/v1/chat/completions",
      validate: (v) => {
        if (!v || v.trim().length === 0) return "URL is required";
        try { new URL(v.trim()); } catch { return "Invalid URL"; }
      },
    });

    if (isCancel(target)) {
      outro(chalk.gray("Goodbye."));
      process.exit(0);
    }

    process.argv = [process.argv[0], process.argv[1], "scan", "--target", (target as string).trim(), "--depth", "quick"];
    await program.parseAsync();
    return;
  }

  if (action === "audit") {
    const pkg = await text({
      message: "npm package name:",
      placeholder: "express",
      validate: (v) => {
        if (!v || v.trim().length === 0) return "Package name is required";
      },
    });

    if (isCancel(pkg)) {
      outro(chalk.gray("Goodbye."));
      process.exit(0);
    }

    process.argv = [process.argv[0], process.argv[1], "audit", (pkg as string).trim()];
    await program.parseAsync();
    return;
  }

  if (action === "review") {
    const repo = await text({
      message: "Repository path or GitHub URL:",
      placeholder: "./my-project  or  https://github.com/owner/repo",
      validate: (v) => {
        if (!v || v.trim().length === 0) return "Repository path is required";
      },
    });

    if (isCancel(repo)) {
      outro(chalk.gray("Goodbye."));
      process.exit(0);
    }

    process.argv = [process.argv[0], process.argv[1], "review", (repo as string).trim()];
    await program.parseAsync();
    return;
  }

  if (action === "history") {
    process.argv = [process.argv[0], process.argv[1], "history"];
    await program.parseAsync();
    return;
  }
}

const program = new Command();

program
  .name("nightfang")
  .description("AI-powered agentic security scanner")
  .version(VERSION);

program
  .command("scan")
  .description("Run security scan against an LLM endpoint")
  .requiredOption("--target <url>", "Target API endpoint URL")
  .option("--depth <depth>", "Scan depth: quick, default, deep", "default")
  .option("--format <format>", "Output format: terminal, json, md", "terminal")
  .option("--runtime <runtime>", "Runtime: api, claude, codex, gemini, opencode, auto", "api")
  .option("--mode <mode>", "Scan mode: probe, deep, mcp", "probe")
  .option("--repo <path>", "Path to target repo for deep scan source analysis")
  .option("--timeout <ms>", "Request timeout in milliseconds", "30000")
  .option("--agentic", "Use multi-turn agentic scan with tool use and SQLite persistence", false)
  .option("--db-path <path>", "Path to SQLite database (default: ~/.nightfang/nightfang.db)")
  .option("--api-key <key>", "API key for LLM provider (or set OPENROUTER_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY)")
  .option("--model <model>", "LLM model to use (or set NIGHTFANG_MODEL)")
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
        const { NightfangDB } = await import("@nightfang/db");
        const db = new NightfangDB(opts.dbPath);
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
          severity: f.severity as import("@nightfang/shared").Severity,
          category: f.category as import("@nightfang/shared").AttackCategory,
          status: f.status as import("@nightfang/shared").FindingStatus,
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

    // Deep and MCP modes require a process runtime
    if (mode !== "probe" && runtime === "api") {
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
        chalk.red.bold("  ◆ nightfang") + chalk.gray(` v${VERSION}`)
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

    const spinner = format === "terminal" ? createNightfangSpinner("Initializing...") : null;
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

    const eventHandler = (event: { type: string; stage?: string; message: string; data?: unknown }) => {
          // Feed events to replay collector for --verbose post-scan replay
          if (replayCollector) {
            replayCollector.onEvent(event);
          }

          if (format !== "terminal") return;

          switch (event.type) {
            case "stage:start":
              if (verbose) {
                // In verbose mode, show each agent action as a visible log line
                const msg = event.message;
                if (msg.startsWith("Reading ")) {
                  spinner?.stop();
                  console.log(`    ${chalk.cyan("→")} ${chalk.cyan("read")} ${chalk.gray(msg.replace("Reading ", ""))}`);
                  spinner?.start();
                } else if (msg.startsWith("Running: ")) {
                  spinner?.stop();
                  console.log(`    ${chalk.magenta("→")} ${chalk.magenta("exec")} ${chalk.gray(msg.replace("Running: ", ""))}`);
                  spinner?.start();
                } else {
                  spinner?.update(msg);
                }
              } else if (event.stage === "attack") {
                const match = event.message.match(/(\d+)/);
                if (match) attackTotal = parseInt(match[1], 10);
                attacksDone = 0;
                spinner?.update(`Running attacks ${renderProgressBar(0, attackTotal || 1)}`);
                spinner?.start();
              } else {
                spinner?.update(event.message);
                spinner?.start();
              }
              break;

            case "attack:end":
              attacksDone++;
              if (spinner && attackTotal > 0) {
                spinner.update(`Running attacks ${renderProgressBar(attacksDone, attackTotal)}`);
              }
              break;

            case "stage:end":
              if (event.stage === "attack") {
                spinner?.succeed(
                  `${chalk.gray("Attacks complete")} ${renderProgressBar(attackTotal, attackTotal)}`
                );
              } else if (
                event.stage === "discovery" &&
                typeof event.data === "object" &&
                event.data !== null &&
                "success" in event.data &&
                event.data.success === false
              ) {
                spinner?.warn(event.message);
              } else if (
                event.stage === "discovery" ||
                event.stage === "verify"
              ) {
                spinner?.succeed(event.message);
              } else {
                spinner?.succeed(event.message);
              }
              break;

            case "finding":
              if (verbose) {
                console.log(
                  `    ${chalk.yellow("⚡")} ${chalk.yellow(event.message)}`
                );
              }
              break;

            case "error":
              spinner?.fail(event.message);
              break;
          }
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

// ── Replay command ──
program
  .command("replay")
  .description("Replay the last scan's attack chain as an animated terminal sequence")
  .option("--db-path <path>", "Path to SQLite database")
  .option("--scan <scanId>", "Replay a specific scan by ID (default: last scan)")
  .action(async (opts) => {
    try {
      const { NightfangDB } = await import("@nightfang/db");
      const db = new NightfangDB(opts.dbPath);

      let scanRecord;
      if (opts.scan) {
        scanRecord = db.getScan(opts.scan);
        if (!scanRecord) {
          // Try prefix match
          const all = db.listScans(100);
          scanRecord = all.find((s) => s.id.startsWith(opts.scan));
        }
        if (!scanRecord) {
          console.error(chalk.red(`Scan '${opts.scan}' not found.`));
          db.close();
          process.exit(2);
        }
      } else {
        const scans = db.listScans(1);
        if (scans.length === 0) {
          console.error(chalk.red("No scan history found. Run a scan first."));
          db.close();
          process.exit(2);
        }
        scanRecord = scans[0];
      }

      const dbFindings = db.getFindings(scanRecord.id);
      const target = db.getTarget(scanRecord.target);
      db.close();

      const summary = scanRecord.summary ? JSON.parse(scanRecord.summary) : {
        totalAttacks: 0, totalFindings: 0,
        critical: 0, high: 0, medium: 0, low: 0, info: 0,
      };

      const findings = dbFindings.map((f) => ({
        id: f.id,
        templateId: f.templateId,
        title: f.title,
        description: f.description,
        severity: f.severity as import("@nightfang/shared").Severity,
        category: f.category as import("@nightfang/shared").AttackCategory,
        status: f.status as import("@nightfang/shared").FindingStatus,
        evidence: {
          request: f.evidenceRequest,
          response: f.evidenceResponse,
          analysis: f.evidenceAnalysis ?? undefined,
        },
        timestamp: f.timestamp,
      }));

      const targetInfo = target
        ? {
            url: target.url,
            type: target.type as import("@nightfang/shared").TargetInfo["type"],
            systemPrompt: target.systemPrompt ?? undefined,
            detectedFeatures: target.detectedFeatures
              ? JSON.parse(target.detectedFeatures)
              : undefined,
            endpoints: target.endpoints ? JSON.parse(target.endpoints) : undefined,
          }
        : undefined;

      await renderReplay({
        target: scanRecord.target,
        targetInfo,
        findings,
        summary,
        durationMs: scanRecord.durationMs ?? 0,
      });
    } catch (err) {
      console.error(
        chalk.red("Failed to replay: " + (err instanceof Error ? err.message : String(err)))
      );
      process.exit(2);
    }
  });

// ── History command ──
program
  .command("history")
  .description("Show past scan history from the SQLite database")
  .option("--db-path <path>", "Path to SQLite database")
  .option("--limit <n>", "Number of scans to show", "10")
  .action(async (opts) => {
    const { NightfangDB } = await import("@nightfang/db");
    const db = new NightfangDB(opts.dbPath);
    const scans = db.listScans(parseInt(opts.limit, 10));
    db.close();

    if (scans.length === 0) {
      console.log(chalk.gray("No scan history found."));
      return;
    }

    console.log("");
    console.log(chalk.red.bold("  ◆ nightfang") + chalk.gray(" scan history"));
    console.log("");

    for (const scan of scans) {
      const status =
        scan.status === "completed"
          ? chalk.green("done")
          : scan.status === "failed"
            ? chalk.red("fail")
            : chalk.yellow("run");
      const summary = scan.summary ? JSON.parse(scan.summary) : null;
      const findings = summary?.totalFindings ?? "?";
      const duration = scan.durationMs ? `${(scan.durationMs / 1000).toFixed(1)}s` : "-";

      console.log(
        `  ${status} ${chalk.white(scan.target)} ${chalk.gray(`[${scan.depth}]`)} ${chalk.gray(duration)} ${chalk.yellow(`${findings} findings`)} ${chalk.gray(scan.startedAt)}`
      );
    }
    console.log("");
  });

// ── Findings commands ──
type FindingsListOptions = {
  dbPath?: string;
  scan?: string;
  severity?: string;
  category?: string;
  status?: string;
  limit?: string;
};

function withFindingsListOptions(command: Command): Command {
  return command
  .option("--db-path <path>", "Path to SQLite database")
  .option("--scan <scanId>", "Filter by scan ID")
  .option("--severity <severity>", "Filter by severity: critical, high, medium, low, info")
  .option("--category <category>", "Filter by attack category")
  .option("--status <status>", "Filter by status: discovered, verified, confirmed, scored, reported, false-positive")
  .option("--limit <n>", "Max findings to show", "50");
}

async function renderFindingsList(opts: FindingsListOptions): Promise<void> {
  const { NightfangDB } = await import("@nightfang/db");
  const db = new NightfangDB(opts.dbPath);
  const rows = db.listFindings({
    scanId: opts.scan,
    severity: opts.severity,
    category: opts.category,
    status: opts.status,
    limit: parseInt(opts.limit ?? "50", 10),
  });
  db.close();

  if (rows.length === 0) {
    console.log(chalk.gray("No findings found."));
    return;
  }

  console.log("");
  console.log(chalk.red.bold("  ◆ nightfang") + chalk.gray(` findings (${rows.length})`));
  console.log("");

  for (const f of rows) {
    const sevColor =
      f.severity === "critical" ? chalk.red.bold :
      f.severity === "high" ? chalk.redBright :
      f.severity === "medium" ? chalk.yellow :
      f.severity === "low" ? chalk.blue :
      chalk.gray;

    const statusColor =
      f.status === "reported" ? chalk.green :
      f.status === "scored" ? chalk.cyan :
      f.status === "verified" ? chalk.yellow :
      f.status === "false-positive" ? chalk.strikethrough.gray :
      chalk.white;

    console.log(
      `  ${sevColor(f.severity.padEnd(8))} ${statusColor(f.status.padEnd(14))} ${chalk.white(f.title)}`
    );
    console.log(
      `  ${chalk.gray(f.id.slice(0, 8))}  ${chalk.gray(f.category)}  ${chalk.gray(`scan:${f.scanId.slice(0, 8)}`)}`
    );
    console.log("");
  }
}

const findingsCmd = withFindingsListOptions(
  program
    .command("findings")
    .description("Browse and manage persisted findings")
).action(async (opts: FindingsListOptions) => {
  await renderFindingsList(opts);
});

withFindingsListOptions(
  findingsCmd
    .command("list")
    .description("List findings from the database")
).action(async (opts: FindingsListOptions) => {
  await renderFindingsList(opts);
});

findingsCmd
  .command("show")
  .description("Show detailed information about a finding")
  .argument("<id>", "Finding ID (full or prefix)")
  .option("--db-path <path>", "Path to SQLite database")
  .action(async (id: string, opts) => {
    const { NightfangDB } = await import("@nightfang/db");
    const db = new NightfangDB(opts.dbPath);

    // Support prefix matching
    let finding = db.getFinding(id);
    if (!finding) {
      const all = db.listFindings({ limit: 1000 });
      finding = all.find((f) => f.id.startsWith(id));
    }
    db.close();

    if (!finding) {
      console.error(chalk.red(`Finding '${id}' not found.`));
      process.exit(1);
    }

    console.log("");
    console.log(chalk.red.bold("  ◆ nightfang") + chalk.gray(" finding detail"));
    console.log("");

    const sevColor =
      finding.severity === "critical" ? chalk.red.bold :
      finding.severity === "high" ? chalk.redBright :
      finding.severity === "medium" ? chalk.yellow :
      finding.severity === "low" ? chalk.blue :
      chalk.gray;

    console.log(`  ${chalk.white.bold(finding.title)}`);
    console.log(`  ${sevColor(finding.severity.toUpperCase())} ${chalk.gray("│")} ${chalk.white(finding.status)} ${chalk.gray("│")} ${chalk.gray(finding.category)}`);
    if (finding.score != null) {
      console.log(`  ${chalk.gray("Score:")} ${chalk.cyan(String(finding.score) + "/100")}`);
    }
    console.log("");
    console.log(`  ${chalk.gray("ID:")}       ${finding.id}`);
    console.log(`  ${chalk.gray("Scan:")}     ${finding.scanId}`);
    console.log(`  ${chalk.gray("Template:")} ${finding.templateId}`);
    console.log(`  ${chalk.gray("Time:")}     ${new Date(finding.timestamp).toISOString()}`);
    console.log("");
    console.log(`  ${chalk.gray("Description:")}`);
    console.log(`  ${finding.description}`);
    console.log("");
    console.log(`  ${chalk.gray("Evidence — Request:")}`);
    console.log(`  ${chalk.dim(finding.evidenceRequest)}`);
    console.log("");
    console.log(`  ${chalk.gray("Evidence — Response:")}`);
    console.log(`  ${chalk.dim(finding.evidenceResponse)}`);
    if (finding.evidenceAnalysis) {
      console.log("");
      console.log(`  ${chalk.gray("Evidence — Analysis:")}`);
      console.log(`  ${chalk.dim(finding.evidenceAnalysis)}`);
    }
    console.log("");
  });

// ── Review command ──
program
  .command("review")
  .description("Deep source code security review of a repository")
  .argument("<repo>", "Local path or git URL to review")
  .option("--depth <depth>", "Review depth: quick, default, deep", "default")
  .option("--format <format>", "Output format: terminal, json, md", "terminal")
  .option("--runtime <runtime>", "Runtime: auto, claude, codex, gemini, opencode, api", "auto")
  .option("--db-path <path>", "Path to SQLite database")
  .option("--api-key <key>", "API key for LLM provider (or set OPENROUTER_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY)")
  .option("--model <model>", "LLM model to use (or set NIGHTFANG_MODEL)")
  .option("--verbose", "Show detailed output", false)
  .option("--timeout <ms>", "AI agent timeout in milliseconds", "600000")
  .action(async (repo: string, opts: Record<string, string | boolean>) => {
    const depth = (opts.depth as ScanDepth) ?? "default";
    const format = (opts.format === "md" ? "markdown" : opts.format) as OutputFormat;
    const runtime = opts.runtime as RuntimeMode;
    const verbose = opts.verbose as boolean;

    // ── Banner ──
    if (format === "terminal") {
      console.log("");
      console.log(
        chalk.red.bold("  ◆ nightfang review") + chalk.gray(` v${VERSION}`)
      );
      console.log("");
      console.log(
        `  ${chalk.gray("Repo:")}    ${chalk.white.bold(repo)}`
      );
      console.log(
        `  ${chalk.gray("Depth:")}   ${chalk.white(depth)}`
      );
      if (runtime !== "api") {
        console.log(
          `  ${chalk.gray("Runtime:")} ${chalk.white(runtime)}`
        );
      }
      console.log("");
    }

    const spinner = format === "terminal" ? createNightfangSpinner("Initializing review...") : null;

    const eventHandler = (event: { type: string; stage?: string; message: string; data?: unknown }) => {
      if (format !== "terminal") return;

      switch (event.type) {
        case "stage:start": {
          const msg = event.message;
          if (verbose && msg.startsWith("Reading ")) {
            spinner?.stop();
            console.log(`    ${chalk.cyan("→")} ${chalk.cyan("read")} ${chalk.gray(msg.replace("Reading ", ""))}`);
            spinner?.start();
          } else if (verbose && msg.startsWith("Running: ")) {
            spinner?.stop();
            console.log(`    ${chalk.magenta("→")} ${chalk.magenta("exec")} ${chalk.gray(msg.replace("Running: ", ""))}`);
            spinner?.start();
          } else {
            spinner?.update(msg);
            spinner?.start();
          }
          break;
        }
        case "stage:end":
          spinner?.succeed(event.message);
          break;
        case "finding":
          if (verbose) {
            console.log(
              `    ${chalk.yellow("⚡")} ${chalk.yellow(event.message)}`
            );
          }
          break;
        case "error":
          spinner?.fail(event.message);
          break;
      }
    };

    try {
      const report = await sourceReview({
        config: {
          repo,
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

      const output = formatReviewReport(report, format);
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
    } catch (err) {
      spinner?.fail("Review failed");
      console.error(
        chalk.red(err instanceof Error ? err.message : String(err))
      );
      process.exit(2);
    }
  });

// ── Audit command ──
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
  .option("--model <model>", "LLM model to use (or set NIGHTFANG_MODEL)")
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

    // ── Banner ──
    if (format === "terminal") {
      console.log("");
      console.log(
        chalk.red.bold("  ◆ nightfang audit") + chalk.gray(` v${VERSION}`)
      );
      console.log("");
      console.log(
        `  ${chalk.gray("Package:")} ${chalk.white.bold(packageName)}${opts.version ? chalk.gray(`@${opts.version}`) : ""}`
      );
      console.log(
        `  ${chalk.gray("Depth:")}   ${chalk.white(depth)}`
      );
      if (runtime !== "api") {
        console.log(
          `  ${chalk.gray("Runtime:")} ${chalk.white(runtime)}`
        );
      }
      console.log("");
    }

    const spinner = format === "terminal" ? createNightfangSpinner("Initializing audit...") : null;

    const eventHandler = (event: { type: string; stage?: string; message: string; data?: unknown }) => {
      if (format !== "terminal") return;

      switch (event.type) {
        case "stage:start": {
          const msg = event.message;
          if (verbose && msg.startsWith("Reading ")) {
            spinner?.stop();
            console.log(`    ${chalk.cyan("→")} ${chalk.cyan("read")} ${chalk.gray(msg.replace("Reading ", ""))}`);
            spinner?.start();
          } else if (verbose && msg.startsWith("Running: ")) {
            spinner?.stop();
            console.log(`    ${chalk.magenta("→")} ${chalk.magenta("exec")} ${chalk.gray(msg.replace("Running: ", ""))}`);
            spinner?.start();
          } else {
            spinner?.update(msg);
            spinner?.start();
          }
          break;
        }
        case "stage:end":
          spinner?.succeed(event.message);
          break;
        case "finding":
          if (verbose) {
            console.log(
              `    ${chalk.yellow("⚡")} ${chalk.yellow(event.message)}`
            );
          }
          break;
        case "error":
          spinner?.fail(event.message);
          break;
      }
    };

    try {
      const report = await packageAudit({
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

      const output = formatAuditReport(report, format);
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
    } catch (err) {
      spinner?.fail("Audit failed");
      console.error(
        chalk.red(err instanceof Error ? err.message : String(err))
      );
      process.exit(2);
    }
  });

function depthLabel(depth: ScanDepth): string {
  switch (depth) {
    case "quick":
      return "~5 probes";
    case "default":
      return "~50 probes";
    case "deep":
      return "full coverage";
  }
}

// ── Entry point: interactive menu or standard CLI ──
const userArgs = process.argv.slice(2);

if (userArgs.length === 0) {
  showInteractiveMenu().catch((err) => {
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(2);
  });
} else {
  program.parse();
}
