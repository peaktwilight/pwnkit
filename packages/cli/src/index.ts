#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { VERSION } from "@pwnkit/shared";
import {
  registerScanCommand,
  registerResumeCommand,
  registerReplayCommand,
  registerHistoryCommand,
  registerFindingsCommand,
  registerReviewCommand,
  registerAuditCommand,
  registerDoctorCommand,
  registerDashboardCommand,
  registerOrchestrateCommand,
  registerDbCommand,
  registerMcpServerCommand,
} from "./commands/index.js";
import { detectAndRoute } from "./routing.js";

const program = new Command();

program
  .name("pwnkit")
  .description("AI-powered agentic security scanner")
  .version(VERSION);

registerScanCommand(program);
registerResumeCommand(program);
registerReplayCommand(program);
registerHistoryCommand(program);
registerFindingsCommand(program);
registerReviewCommand(program);
registerAuditCommand(program);
registerDoctorCommand(program);
registerDashboardCommand(program);
registerOrchestrateCommand(program);
registerDbCommand(program);
registerMcpServerCommand(program);

// ── Interactive menu (Ink) ──
async function showInteractiveMenu(): Promise<void> {
  const { showInkMenu } = await import("./ui/Menu.js");
  const { action, target } = await showInkMenu();

  if (action === "history") {
    process.argv = [process.argv[0], process.argv[1], "history"];
    await program.parseAsync();
    return;
  }

  if (action === "doctor") {
    process.argv = [process.argv[0], process.argv[1], "doctor"];
    await program.parseAsync();
    return;
  }

  if (action === "replay") {
    process.argv = [process.argv[0], process.argv[1], "replay"];
    await program.parseAsync();
    return;
  }

  if (action === "dashboard") {
    process.argv = [process.argv[0], process.argv[1], "dashboard"];
    await program.parseAsync();
    return;
  }

  if (!target) return;

  if (action === "scan") {
    process.argv = [process.argv[0], process.argv[1], "scan", "--target", target, "--depth", "quick"];
  } else if (action === "audit") {
    process.argv = [process.argv[0], process.argv[1], "audit", target];
  } else if (action === "review") {
    process.argv = [process.argv[0], process.argv[1], "review", target];
  }

  await program.parseAsync();
}

// ── Entry point ──
const userArgs = process.argv.slice(2);
const knownCommands = ["scan", "resume", "replay", "history", "findings", "review", "audit", "doctor", "dashboard", "orchestrate", "db", "mcp-server", "help"];

if (userArgs.length === 0) {
  showInteractiveMenu().catch((err) => {
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(2);
  });
} else if (userArgs.length >= 1 && !knownCommands.includes(userArgs[0]) && !userArgs[0].startsWith("-")) {
  const route = detectAndRoute(userArgs[0]);
  if (route) {
    const extraArgs = userArgs.slice(1);
    process.argv = [process.argv[0], process.argv[1], ...route, ...extraArgs];
    program.parse();
  } else {
    program.parse();
  }
} else {
  program.parse();
}
