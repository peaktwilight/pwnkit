import { spawn } from "node:child_process";
import type { Runtime, RuntimeConfig, RuntimeContext, RuntimeResult } from "./types.js";

// Dim the subprocess output so it's visually distinct from pwnkit's own output
const dim = (text: string) => `\x1b[2m${text}\x1b[0m`;

const RUNTIME_COMMANDS: Record<string, string> = {
  claude: "claude",
  codex: "codex",
  gemini: "gemini",
  opencode: "opencode",
};

export class ProcessRuntime implements Runtime {
  readonly type: "claude" | "codex" | "gemini" | "opencode";
  private config: RuntimeConfig;
  private command: string;

  constructor(config: RuntimeConfig) {
    this.type = config.type as "claude" | "codex" | "gemini" | "opencode";
    this.config = config;
    this.command = RUNTIME_COMMANDS[config.type] ?? config.type;
  }

  async execute(prompt: string, context?: RuntimeContext): Promise<RuntimeResult> {
    const start = Date.now();
    const args = this.buildArgs(prompt, context);
    const env = this.buildEnv(context);

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let resultText = "";
      let timedOut = false;
      const isStreamJson = args.includes("stream-json");

      const proc = spawn(this.command, args, {
        cwd: this.config.cwd ?? process.cwd(),
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      proc.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;

        if (isStreamJson) {
          // Parse stream-json lines for live progress display
          for (const line of text.split("\n")) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              // Show assistant text as it streams
              if (event.type === "assistant" && event.message?.content) {
                for (const block of event.message.content) {
                  if (block.type === "text") {
                    resultText += block.text;
                  } else if (block.type === "tool_use") {
                    // Show tool calls live with clean formatting
                    if (process.stderr.isTTY) {
                      const name = block.name || "tool";
                      const inp = block.input as Record<string, unknown> | undefined;
                      let detail = "";
                      if (inp?.file_path) detail = String(inp.file_path).split("/").slice(-2).join("/");
                      else if (inp?.command) detail = String(inp.command).slice(0, 60);
                      else if (inp?.pattern) detail = String(inp.pattern).slice(0, 40);
                      else if (inp?.content) detail = "(writing file)";
                      process.stderr.write(dim(`    ${name}${detail ? ": " + detail : ""}\n`));
                    }
                  }
                }
              } else if (event.type === "result") {
                resultText = event.result || resultText;
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
        const output = isStreamJson ? (resultText || stdout).trim() : stdout.trim();
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
        if (context?.systemPrompt) {
          args.push("--system-prompt", context.systemPrompt);
        }
        return args;
      }
      case "codex":
        return ["-q", prompt];
      case "gemini":
        return ["-p", prompt];
      case "opencode":
        return ["-p", prompt, "--output", "text"];
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
