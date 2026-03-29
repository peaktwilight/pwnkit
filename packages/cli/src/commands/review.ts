import type { Command } from "commander";
import type { ScanDepth, OutputFormat, RuntimeMode } from "@pwnkit/shared";
import { runUnified } from "./run.js";

export function registerReviewCommand(program: Command): void {
  program
    .command("review")
    .description("Deep source code security review of a repository")
    .argument("<repo>", "Local path or git URL to review")
    .option("--depth <depth>", "Review depth: quick, default, deep", "default")
    .option("--format <format>", "Output format: terminal, json, md", "terminal")
    .option("--runtime <runtime>", "Runtime: auto, claude, codex, gemini, api", "auto")
    .option("--db-path <path>", "Path to SQLite database")
    .option("--api-key <key>", "API key for LLM provider")
    .option("--model <model>", "LLM model to use")
    .option("--verbose", "Show detailed output", false)
    .option("--timeout <ms>", "AI agent timeout in milliseconds", "600000")
    .action(async (repo: string, opts: Record<string, string | boolean>) => {
      await runUnified({
        target: repo,
        targetType: "source-code",
        depth: (opts.depth as ScanDepth) ?? "default",
        format: (opts.format === "md" ? "markdown" : opts.format) as OutputFormat,
        runtime: (opts.runtime as RuntimeMode) ?? "auto",
        timeout: parseInt(opts.timeout as string, 10),
        verbose: opts.verbose as boolean,
        dbPath: opts.dbPath as string | undefined,
        apiKey: opts.apiKey as string | undefined,
        model: opts.model as string | undefined,
      });
    });
}
