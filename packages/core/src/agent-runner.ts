import type {
  Finding,
} from "@pwnkit/shared";
import type { ScanListener } from "./scanner.js";
import { createRuntime } from "./runtime/index.js";
import type { RuntimeType } from "./runtime/index.js";
import { LlmApiRuntime } from "./runtime/llm-api.js";
import { detectAvailableRuntimes, pickRuntimeForStage } from "./runtime/registry.js";
import { runAgentLoop } from "./agent/loop.js";
import { runNativeAgentLoop } from "./agent/native-loop.js";
import { getToolsForRole } from "./agent/tools.js";
import type { NativeRuntime } from "./runtime/types.js";
import { CLI_RUNTIME_TYPES } from "./shared-analysis.js";
import { parseFindingsFromCliOutput } from "./findings-parser.js";

// ── Types ──

export interface AnalysisAgentOptions {
  role: "audit" | "review";
  scopePath: string;
  target: string;
  scanId: string;
  config: { runtime?: string; timeout?: number; depth?: string; apiKey?: string; model?: string };
  db: any;
  emit: ScanListener;
  /** Prompt sent to CLI runtimes (compact, includes ---FINDING--- format instructions) */
  cliPrompt: string;
  /** System prompt for the native agentic loop (full methodology prompt) */
  agentSystemPrompt: string;
  /** System prompt for CLI runtimes (short role description) */
  cliSystemPrompt: string;
  /** Optional: direct API prompt with embedded source code for single-shot fallback */
  directApiPrompt?: string;
}

// ── Depth → maxTurns mapping ──

function getMaxTurns(role: "audit" | "review", depth: string | undefined, branch: "native" | "legacy"): number {
  if (role === "audit") {
    if (branch === "native") {
      return depth === "deep" ? 30 : depth === "default" ? 20 : 10;
    }
    // legacy
    return depth === "deep" ? 50 : depth === "default" ? 50 : 15;
  }
  // review
  if (branch === "native") {
    return depth === "deep" ? 40 : depth === "default" ? 25 : 15;
  }
  // legacy
  return depth === "deep" ? 50 : depth === "default" ? 30 : 15;
}

// ── Main entry point ──

/**
 * Unified agent runner for both audit and review roles.
 *
 * Contains the 3-branch runtime selection logic:
 * 1. CLI runtime fast path (ProcessRuntime) — claude/codex/gemini/
 * 2. API runtime with native tool_use (runNativeAgentLoop)
 * 3. Legacy fallback (runAgentLoop)
 */
export async function runAnalysisAgent(opts: AnalysisAgentOptions): Promise<Finding[]> {
  const { role, scopePath, target, scanId, config, db, emit, cliPrompt, agentSystemPrompt, cliSystemPrompt, directApiPrompt } = opts;

  const templatePrefix = `cli-${role}`;
  const requestedRuntime = config.runtime as RuntimeType | "auto" | undefined;
  const allowApiFallback = requestedRuntime === undefined || requestedRuntime === "auto" || requestedRuntime === "api";

  emit({
    type: "stage:start",
    stage: "attack",
    message: role === "audit"
      ? "AI agent analyzing source code..."
      : "AI agent performing deep code review...",
  });

  // Detect available CLI runtimes
  const available = await detectAvailableRuntimes();

  // Determine runtime: prefer CLI runtimes, fall back to API agent loop
  let runtimeType: RuntimeType;
  if (config.runtime === "auto") {
    runtimeType = available.size > 0
      ? pickRuntimeForStage("source-analysis", available)
      : "api";
  } else {
    runtimeType = (config.runtime ?? "api") as RuntimeType;
  }

  if (process.env.CI || process.env.PWNKIT_DEBUG) {
    process.stderr.write(`[pwnkit] agent-runner: type=${runtimeType}, available=[${[...available].join(",")}]\n`);
  }

  // ── Branch 1: CLI runtime fast path (claude/codex/etc.) ──
  if (CLI_RUNTIME_TYPES.has(runtimeType) && available.has(runtimeType)) {
    emit({
      type: "stage:start",
      stage: "attack",
      message: `Using ${runtimeType} CLI for deep AI analysis...`,
    });

    // Schema for structured findings output
    const findingsSchema = {
      type: "object",
      properties: {
        findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Clear vulnerability title" },
              severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
              category: { type: "string" },
              file: { type: "string", description: "File path and line number" },
              description: { type: "string", description: "Detailed vulnerability description" },
              poc: { type: "string", description: "Proof-of-concept code or command" },
            },
            required: ["title", "severity", "description"],
          },
        },
        summary: { type: "string", description: "Brief summary of the audit" },
      },
      required: ["findings", "summary"],
    };

    const { ProcessRuntime } = await import("./runtime/process.js");
    const cliRuntime = new ProcessRuntime({
      type: runtimeType,
      timeout: config.timeout ?? 600_000,
      cwd: scopePath,
      outputSchema: findingsSchema,
      onToolCall: (name, detail) => {
        emit({
          type: "stage:start",
          stage: "attack",
          message: `${name}${detail ? ": " + detail : ""}`,
        });
      },
      onThinking: (text) => {
        emit({
          type: "thinking" as any,
          stage: "attack",
          message: text.slice(0, 100),
        });
      },
    });

    const result = await cliRuntime.execute(cliPrompt, {
      systemPrompt: cliSystemPrompt,
    });

    if (result.error && !result.output) {
      emit({
        type: "stage:end",
        stage: "attack",
        message: `CLI agent error: ${result.error}`,
      });
      if (!allowApiFallback) {
        emit({
          type: "error",
          stage: "attack",
          message: `Explicit runtime '${runtimeType}' failed; API fallback disabled.`,
        });
        return [];
      }
      // Fall through to API / legacy branches below only for auto/api modes.
    } else {
      const findings = parseFindingsFromCliOutput(result.output, { templatePrefix });

      for (const f of findings) {
        emit({
          type: "finding",
          message: `[${f.severity}] ${f.title}`,
          data: f,
        });
      }

      emit({
        type: "stage:end",
        stage: "attack",
        message: `CLI agent complete: ${findings.length} findings (${result.durationMs}ms)`,
      });

      return findings;
    }
  }

  // ── Branch 2: API runtime with native tool_use ──
  if (runtimeType === "api" || !available.has(runtimeType)) {
    if (!allowApiFallback && runtimeType !== "api") {
      emit({
        type: "error",
        stage: "attack",
        message: `Runtime '${runtimeType}' is unavailable and API fallback is disabled for explicit runtime selection.`,
      });
      return [];
    }

    emit({
      type: "stage:start",
      stage: "attack",
      message: `Running agentic source code ${role === "audit" ? "analysis" : "review"} via API...`,
    });

    const apiRuntime = new LlmApiRuntime({
      type: "api" as RuntimeType,
      timeout: config.timeout ?? 120_000,
      apiKey: config.apiKey,
      model: config.model,
    });

    // Check if runtime supports native tool_use (multi-turn agentic loop)
    const supportsNative = typeof (apiRuntime as NativeRuntime).executeNative === "function";
    if (process.env.CI || process.env.PWNKIT_DEBUG) {
      process.stderr.write(`[pwnkit] API runtime: native=${supportsNative}, model=${config.model ?? "default"}\n`);
    }

    if (supportsNative) {
      const maxTurns = getMaxTurns(role, config.depth, "native");

      const agentState = await runNativeAgentLoop({
        config: {
          role,
          systemPrompt: agentSystemPrompt,
          tools: getToolsForRole(role, { hasScope: !!scopePath }),
          maxTurns,
          target,
          scanId,
          scopePath,
        },
        runtime: apiRuntime as NativeRuntime,
        db,
        onTurn: (_turn, toolCalls, _results) => {
          for (const call of toolCalls) {
            if (call.name === "save_finding") {
              emit({
                type: "finding",
                message: `[${call.arguments.severity}] ${call.arguments.title}`,
                data: call.arguments,
              });
            } else if (call.name === "read_file") {
              emit({
                type: "stage:start",
                stage: "attack",
                message: `Reading ${call.arguments.path}`,
              });
            } else if (call.name === "run_command") {
              emit({
                type: "stage:start",
                stage: "attack",
                message: `Running: ${call.arguments.command}`,
              });
            }
          }
        },
      });

      // Surface agent errors
      if (agentState.summary.startsWith("Error:")) {
        emit({
          type: "error",
          stage: "attack",
          message: agentState.summary,
        });
      }

      emit({
        type: "stage:end",
        stage: "attack",
        message: `${role === "audit" ? "Agent" : "Review"} complete: ${agentState.findings.length} findings in ${agentState.turnCount} turns (${agentState.totalUsage.inputTokens + agentState.totalUsage.outputTokens} tokens)`,
      });

      return agentState.findings;
    }

    // ── Single-shot fallback for API runtimes without native tool_use ──
    if (directApiPrompt) {
      const result = await apiRuntime.execute(directApiPrompt, {
        systemPrompt: cliSystemPrompt,
      });

      if (result.error && !result.output) {
        emit({
          type: "stage:end",
          stage: "attack",
          message: `API analysis error: ${result.error}`,
        });
        return [];
      }

      const findings = parseFindingsFromCliOutput(result.output, { templatePrefix });

      for (const f of findings) {
        emit({
          type: "finding",
          message: `[${f.severity}] ${f.title}`,
          data: f,
        });
      }

      emit({
        type: "stage:end",
        stage: "attack",
        message: `API analysis complete: ${findings.length} findings (${result.durationMs}ms)`,
      });

      return findings;
    }
  }

  // ── Branch 3: Legacy fallback — text-based agent loop ──
  const maxTurns = getMaxTurns(role, config.depth, "legacy");

  const runtimeConfig = {
    type: runtimeType as RuntimeType,
    timeout: config.timeout ?? 120_000,
    apiKey: config.apiKey,
    model: config.model,
  };
  const runtime =
    runtimeType === "api" || !available.has(runtimeType)
      ? new LlmApiRuntime(runtimeConfig)
      : createRuntime(runtimeConfig);

  const agentState = await runAgentLoop({
    config: {
      role,
      systemPrompt: agentSystemPrompt,
      tools: getToolsForRole(role, { hasScope: !!scopePath }),
      maxTurns,
      target,
      scanId,
      scopePath,
    },
    runtime,
    db,
    onTurn: (_turn, msg) => {
      const calls = msg.toolCalls ?? [];
      for (const call of calls) {
        if (call.name === "save_finding") {
          emit({
            type: "finding",
            message: `[${call.arguments.severity}] ${call.arguments.title}`,
            data: call.arguments,
          });
        }
      }
    },
  });

  emit({
    type: "stage:end",
    stage: "attack",
    message: `${role === "audit" ? "Agent" : "Review"} complete: ${agentState.findings.length} findings${agentState.summary ? `, ${agentState.summary}` : ""}`,
  });

  return agentState.findings;
}
