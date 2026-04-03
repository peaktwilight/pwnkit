import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import type { Runtime, RuntimeConfig, RuntimeContext, RuntimeResult, RuntimeType } from "./types.js";

// Dim the subprocess output so it's visually distinct from pwnkit's own output
const dim = (text: string) => `\x1b[2m${text}\x1b[0m`;

function formatToolDetail(input: unknown): string {
  const inp = input as Record<string, unknown> | undefined;
  if (inp?.file_path) return String(inp.file_path).split("/").slice(-2).join("/");
  if (inp?.command) return String(inp.command).slice(0, 60);
  if (inp?.pattern) return String(inp.pattern).slice(0, 40);
  if (inp?.path) return String(inp.path).slice(0, 60);
  if (inp?.content) return "(writing file)";
  return "";
}

function showToolCall(
  onToolCall: ((name: string, detail: string) => void) | undefined,
  name: string | undefined,
  input: unknown,
): void {
  const toolName = name || "tool";
  const detail = formatToolDetail(input);

  // Callback for structured consumers (Ink UI)
  if (onToolCall) {
    onToolCall(toolName, detail);
  }

  // Fallback: write to stderr for raw terminal display
  if (process.stderr.isTTY && !onToolCall) {
    process.stderr.write(dim(`    ${toolName}${detail ? ": " + detail : ""}\n`));
  }
}

const RUNTIME_COMMANDS: Record<string, string> = {
  claude: "claude",
  codex: "codex",
  gemini: "gemini",
};

function resolveCliEntrypoint(): string {
  return resolve(process.argv[1] ?? join(process.cwd(), "dist", "index.js"));
}

function buildPwnkitMcpCommandArgs(context: RuntimeContext): string[] {
  const cliEntrypoint = resolveCliEntrypoint();
  const args = [
    cliEntrypoint,
    "mcp-server",
    "--target",
    context.target ?? "",
    "--scan-id",
    context.scanId ?? "no-scan-id",
  ];

  if (context.mcp?.dbPath) {
    args.push("--db-path", context.mcp.dbPath);
  }

  return args;
}

function buildClaudeMcpConfig(context: RuntimeContext): string {
  return JSON.stringify({
    mcpServers: {
      pwnkit: {
        command: process.execPath,
        args: buildPwnkitMcpCommandArgs(context),
      },
    },
  });
}

export class ProcessRuntime implements Runtime {
  readonly type: RuntimeType;
  private config: RuntimeConfig;
  private command: string;

  constructor(config: RuntimeConfig) {
    this.type = config.type as RuntimeType;
    this.config = config;
    this.command = RUNTIME_COMMANDS[config.type] ?? config.type;
  }

  async execute(prompt: string, context?: RuntimeContext): Promise<RuntimeResult> {
    const start = Date.now();
    const args = this.buildArgs(prompt, context);
    const env = this.buildEnv(context);

    const onToolCall = this.config.onToolCall;

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let resultText = "";
      let timedOut = false;
      const isJsonStream = args.includes("stream-json") || args.includes("--json");

      const proc = spawn(this.command, args, {
        cwd: this.config.cwd ?? process.cwd(),
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      proc.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;

        if (isJsonStream) {
          for (const line of text.split("\n")) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);

              // Claude stream-json format
              if (event.type === "assistant" && event.message?.content) {
                for (const block of event.message.content) {
                  if (block.type === "text") {
                    resultText += block.text;
                    this.config.onThinking?.(block.text);
                  } else if (block.type === "tool_use") {
                    showToolCall(onToolCall, block.name, block.input);
                  }
                }
              } else if (event.type === "result") {
                resultText = event.result || resultText;
              }

              // Codex JSONL format
              if (event.type === "item.started" && event.item?.type === "command_execution") {
                showToolCall(onToolCall, "shell", { command: event.item.command });
              }
              if (event.type === "item.completed" && event.item) {
                if (event.item.type === "agent_message" && event.item.text) {
                  resultText += event.item.text;
                  this.config.onThinking?.(event.item.text);
                } else if (event.item.type === "command_execution" && event.item.command) {
                  // Already shown on item.started
                }
              }
            } catch {
              // Not valid JSON line, skip
            }
          }
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
      });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
        setTimeout(() => proc.kill("SIGKILL"), 5_000);
      }, this.config.timeout);

      proc.on("close", (code) => {
        clearTimeout(timer);
        // For stream-json, use the parsed result text; otherwise raw stdout
        const output = isJsonStream ? (resultText || stdout).trim() : stdout.trim();
        resolve({
          output,
          exitCode: code,
          timedOut,
          durationMs: Date.now() - start,
          error: code !== 0 ? stderr.trim() || undefined : undefined,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          output: "",
          exitCode: 1,
          timedOut: false,
          durationMs: Date.now() - start,
          error: err.message,
        });
      });
    });
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(this.command, ["--version"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      proc.on("close", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 5_000);
    });
  }

  private buildArgs(prompt: string, context?: RuntimeContext): string[] {
    switch (this.type) {
      case "claude": {
        const args = ["-p", prompt, "--verbose", "--output-format", "stream-json"];
        if (context?.mcp?.enableTargetTools && context.target && context.scanId) {
          args.push("--mcp-config", buildClaudeMcpConfig(context), "--strict-mcp-config");
        }
        if (context?.systemPrompt) {
          args.push("--system-prompt", context.systemPrompt);
        }
        // Structured output schema for findings
        if (this.config.outputSchema) {
          args.push("--json-schema", JSON.stringify(this.config.outputSchema));
        }
        return args;
      }
      case "codex": {
        const args = [
          "exec",
          "--full-auto",
          "--skip-git-repo-check",
          "--json",
        ];
        if (context?.mcp?.enableTargetTools && context.target && context.scanId) {
          args.push(
            "-c", "mcp_servers.pwnkit.enabled=true",
            "-c", `mcp_servers.pwnkit.command=${JSON.stringify(process.execPath)}`,
            "-c", `mcp_servers.pwnkit.args=${JSON.stringify(buildPwnkitMcpCommandArgs(context))}`,
          );
        }
        if (this.config.outputSchema) {
          // Codex needs schema as a file — write to temp
          const schemaPath = join(tmpdir(), `pwnkit-schema-${Date.now()}.json`);
          writeFileSync(schemaPath, JSON.stringify(this.config.outputSchema));
          args.push("--output-schema", schemaPath);
        }
        args.push(prompt);
        return args;
      }
      case "gemini": {
        const args = ["-p", prompt, "--output-format", "stream-json"];
        return args;
      }
      default:
        return ["-p", prompt];
    }
  }

  private buildEnv(context?: RuntimeContext): Record<string, string> {
    const env: Record<string, string> = {
      ...this.config.env,
    };

    if (context?.target) {
      env.PWNKIT_TARGET = context.target;
    }
    if (context?.findings) {
      env.PWNKIT_FINDINGS = context.findings;
    }
    if (context?.templateId) {
      env.PWNKIT_TEMPLATE_ID = context.templateId;
    }

    return env;
  }
}
