#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { VERSION } from "@pwnkit/shared";
import {
  registerScanCommand,
  registerReplayCommand,
  registerHistoryCommand,
  registerFindingsCommand,
  registerReviewCommand,
  registerAuditCommand,
} from "./commands/index.js";

const program = new Command();

program
  .name("pwnkit")
  .description("AI-powered agentic security scanner")
  .version(VERSION);

// ── Register all commands ──
registerScanCommand(program);
registerReplayCommand(program);
registerHistoryCommand(program);
registerFindingsCommand(program);
registerReviewCommand(program);
registerAuditCommand(program);

// ── "Holy Shit" First-Run Interactive Menu ──
async function showInteractiveMenu(): Promise<void> {
  const { select, text, isCancel, outro } = await import("@clack/prompts");

  console.log("");
  console.log(
    chalk.red.bold("  pwnkit") +
    chalk.gray(` v${VERSION}`) +
    chalk.gray(" \u2014 AI-Powered Agentic Security Scanner")
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
    const url = "https://pwnkit.com";
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

// ── Smart target detection: pwnkit <target> auto-routes ──
function detectAndRoute(target: string): string[] | null {
  // Local directory → review
  if (target.startsWith("./") || target.startsWith("/") || target === ".") {
    return ["review", target];
  }
  // GitHub URL → review
  if (target.startsWith("https://github.com/") || target.startsWith("git@")) {
    return ["review", target];
  }
  // HTTP URL → scan (user can add --mode web for web pentest)
  if (target.startsWith("http://") || target.startsWith("https://")) {
    return ["scan", "--target", target];
  }
  // Looks like npm package (letters, hyphens, scoped) → audit
  if (/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*(@.*)?$/.test(target)) {
    return ["audit", target];
  }
  return null;
}

// ── Entry point ──
const userArgs = process.argv.slice(2);
const knownCommands = ["scan", "replay", "history", "findings", "review", "audit", "help"];

if (userArgs.length === 0) {
  showInteractiveMenu().catch((err) => {
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(2);
  });
} else if (userArgs.length >= 1 && !knownCommands.includes(userArgs[0]) && !userArgs[0].startsWith("-")) {
  // Smart routing: pwnkit <target> → auto-detect command
  const route = detectAndRoute(userArgs[0]);
  if (route) {
    const extraArgs = userArgs.slice(1); // pass through any flags
    process.argv = [process.argv[0], process.argv[1], ...route, ...extraArgs];
    program.parse();
  } else {
    program.parse(); // let commander handle unknown commands
  }
} else {
  program.parse();
}
