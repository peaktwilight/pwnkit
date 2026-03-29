import { randomUUID } from "node:crypto";
import type {
  NativeRuntime,
  NativeMessage,
  NativeContentBlock,
  NativeToolDef,
  NativeRuntimeResult,
} from "../runtime/types.js";
import type { ToolDefinition, ToolCall, ToolResult, ToolContext, AgentRole } from "./types.js";
import { ToolExecutor, getToolsForRole } from "./tools.js";
import type { pwnkitDB } from "@pwnkit/db";
import type { Finding, AttackResult, TargetInfo } from "@pwnkit/shared";

// ── Native Agent Loop Config ──

export interface NativeAgentConfig {
  role: AgentRole;
  systemPrompt: string;
  tools: ToolDefinition[];
  maxTurns: number;
  target: string;
  scanId: string;
  scopePath?: string;
  sessionId?: string; // Resume from existing session
}

export interface NativeAgentLoopOptions {
  config: NativeAgentConfig;
  runtime: NativeRuntime;
  db: pwnkitDB | null;
  onTurn?: (turn: number, toolCalls: ToolCall[], results: ToolResult[]) => void;
  onEvent?: (eventType: string, payload: Record<string, unknown>) => void;
}

export interface NativeAgentState {
  sessionId: string;
  messages: NativeMessage[];
  turnCount: number;
  findings: Finding[];
  attackResults: AttackResult[];
  targetInfo: Partial<TargetInfo>;
  done: boolean;
  summary: string;
  totalUsage: { inputTokens: number; outputTokens: number };
}

/**
 * Run a multi-turn agent loop using Claude's native Messages API with tool_use.
 *
 * Unlike the legacy loop that serializes conversation to text and parses
 * TOOL_CALL: patterns, this loop:
 * - Uses structured NativeMessage objects with typed content blocks
 * - Leverages Claude's native tool_use stop reason and tool_result flow
 * - Persists session state to SQLite for resumability
 * - Logs pipeline events for audit trail
 * - Tracks token usage
 */
export async function runNativeAgentLoop(
  opts: NativeAgentLoopOptions,
): Promise<NativeAgentState> {
  const { config, runtime, db, onTurn, onEvent } = opts;

  const toolCtx: ToolContext = {
    target: config.target,
    scanId: config.scanId,
    findings: [],
    attackResults: [],
    targetInfo: {},
    scopePath: config.scopePath,
  };

  const executor = new ToolExecutor(toolCtx, db);
  const tools = config.tools.length > 0 ? config.tools : getToolsForRole(config.role);

  // Convert ToolDefinitions to native API format
  const nativeTools: NativeToolDef[] = tools.map(toNativeToolDef);

  // Initialize or restore state
  const sessionId = config.sessionId ?? randomUUID();
  let messages: NativeMessage[] = [];
  let turnCount = 0;

  // Try to restore from existing session
  if (config.sessionId && db) {
    const existing = db.getSessionById(config.sessionId);
    if (existing && existing.status === "paused") {
      messages = JSON.parse(existing.messages) as NativeMessage[];
      turnCount = existing.turnCount;
      const ctx = JSON.parse(existing.toolContext) as ToolContext;
      toolCtx.findings = ctx.findings ?? [];
      toolCtx.attackResults = ctx.attackResults ?? [];
      toolCtx.targetInfo = ctx.targetInfo ?? {};

      onEvent?.("session_resumed", { sessionId, turnCount, messageCount: messages.length });
    }
  }

  // If fresh start, add the initial user message
  if (messages.length === 0) {
    messages.push({
      role: "user",
      content: [{ type: "text", text: buildInitialPrompt(config) }],
    });
  }

  const state: NativeAgentState = {
    sessionId,
    messages,
    turnCount,
    findings: toolCtx.findings,
    attackResults: toolCtx.attackResults,
    targetInfo: toolCtx.targetInfo,
    done: false,
    summary: "",
    totalUsage: { inputTokens: 0, outputTokens: 0 },
  };

  // Log session start
  if (db) {
    db.logEvent({
      scanId: config.scanId,
      stage: config.role,
      eventType: "agent_start",
      agentRole: config.role,
      payload: { sessionId, maxTurns: config.maxTurns, toolCount: nativeTools.length },
      timestamp: Date.now(),
    });
  }

  // ── Main loop ──

  while (!state.done && state.turnCount < config.maxTurns) {
    state.turnCount++;

    // Call Claude API with native messages + tools
    const result = await runtime.executeNative(
      config.systemPrompt,
      state.messages,
      nativeTools,
    );

    // Track usage
    if (result.usage) {
      state.totalUsage.inputTokens += result.usage.inputTokens;
      state.totalUsage.outputTokens += result.usage.outputTokens;
    }

    // Handle error or empty response
    if (result.error || (result.content.length === 0 && (!result.usage || result.usage.outputTokens === 0))) {
      const errorMsg = result.error || "API returned empty response (0 tokens) — model may be rate-limited or unavailable";
      onEvent?.("agent_error", { turn: state.turnCount, error: errorMsg });
      state.summary = `Error: ${errorMsg}`;
      if (db) {
        db.logEvent({
          scanId: config.scanId,
          stage: config.role,
          eventType: "agent_error",
          agentRole: config.role,
          payload: { turn: state.turnCount, error: errorMsg },
          timestamp: Date.now(),
        });
      }
      break;
    }

    // Append assistant response
    state.messages.push({ role: "assistant", content: result.content });

    // Extract tool_use blocks
    const toolUseBlocks = result.content.filter(
      (b): b is Extract<NativeContentBlock, { type: "tool_use" }> =>
        b.type === "tool_use",
    );

    // If no tool calls, the model responded with text only
    if (toolUseBlocks.length === 0) {
      const textBlocks = result.content.filter(
        (b): b is Extract<NativeContentBlock, { type: "text" }> => b.type === "text",
      );
      const textContent = textBlocks.map((b) => b.text).join("\n");

      // Only allow early exit if the agent has done meaningful work:
      // - At least 4 turns (read files, ran commands, analyzed code)
      // - OR explicitly called the done tool (handled below in tool execution)
      const minTurns = Math.min(4, config.maxTurns);
      if (state.turnCount >= minTurns && result.stopReason === "end_turn") {
        state.summary = textContent;
        state.done = true;
        break;
      }

      // Push the agent to keep working
      state.messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: buildContinuePrompt(config, state.turnCount),
          },
        ],
      });
      continue;
    }

    // Execute each tool call and collect results
    const toolCalls: ToolCall[] = [];
    const toolResults: ToolResult[] = [];
    const toolResultBlocks: NativeContentBlock[] = [];

    for (const block of toolUseBlocks) {
      const call: ToolCall = { name: block.name, arguments: block.input };
      toolCalls.push(call);

      const toolResult = await executor.execute(call);
      toolResults.push(toolResult);

      // Check if agent called done
      if (block.name === "done" && toolResult.success) {
        state.done = true;
        state.summary = (toolResult.output as { summary: string }).summary;
      }

      // Build tool_result block
      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: toolResult.success
          ? JSON.stringify(toolResult.output)
          : `Error: ${toolResult.error}`,
        is_error: !toolResult.success,
      });
    }

    // Append tool results as user message
    state.messages.push({ role: "user", content: toolResultBlocks });

    // Notify callback
    onTurn?.(state.turnCount, toolCalls, toolResults);

    // Log tool calls
    if (db) {
      db.logEvent({
        scanId: config.scanId,
        stage: config.role,
        eventType: "tool_calls",
        agentRole: config.role,
        payload: {
          turn: state.turnCount,
          tools: toolCalls.map((c) => c.name),
          results: toolResults.map((r) => ({ success: r.success, error: r.error })),
        },
        timestamp: Date.now(),
      });
    }

    // Persist session state periodically
    if (db && state.turnCount % 2 === 0) {
      persistSession(db, state, config, "running");
    }
  }

  // Sync final state
  state.findings = toolCtx.findings;
  state.attackResults = toolCtx.attackResults;
  state.targetInfo = toolCtx.targetInfo;

  if (!state.done) {
    state.summary = `Agent reached max turns (${config.maxTurns}) without completing.`;
  }

  // Final session save
  if (db) {
    persistSession(db, state, config, state.done ? "completed" : "paused");
    db.logEvent({
      scanId: config.scanId,
      stage: config.role,
      eventType: "agent_complete",
      agentRole: config.role,
      payload: {
        sessionId: state.sessionId,
        turnCount: state.turnCount,
        findingCount: state.findings.length,
        done: state.done,
        usage: state.totalUsage,
        summary: state.summary.slice(0, 500),
      },
      timestamp: Date.now(),
    });
  }

  return state;
}

// ── Helpers ──

function buildInitialPrompt(config: NativeAgentConfig): string {
  return [
    `You are a ${config.role} agent for pwnkit, an AI red-teaming toolkit.`,
    `Target: ${config.target}`,
    `Scan ID: ${config.scanId}`,
    "",
    "Use your tools to accomplish your task. When done, call the done tool with a summary.",
  ].join("\n");
}

function buildContinuePrompt(config: NativeAgentConfig, turnCount: number): string {
  switch (config.role) {
    case "discovery":
    case "attack":
    case "verify":
      return turnCount < 2
        ? "You must use your target interaction tools. Start by sending prompts or HTTP requests to the configured target. Do not just describe what you would do."
        : "Continue testing the configured target. Use send_prompt or http_request, record confirmed findings with save_finding, and call done only when the target has been thoroughly assessed.";
    case "audit":
    case "review":
    default:
      return turnCount < 2
        ? "You must use your tools to analyze the target. Start by reading files and running commands. Do not just describe what you would do — actually do it."
        : "Continue your analysis. Use read_file to examine source code, run_command to search for patterns, and save_finding for any vulnerabilities. Call the done tool only when you have thoroughly analyzed the code.";
  }
}

function toNativeToolDef(tool: ToolDefinition): NativeToolDef {
  const properties: Record<string, unknown> = {};
  for (const [key, param] of Object.entries(tool.parameters)) {
    const prop: Record<string, unknown> = {
      type: param.type,
      description: param.description,
    };
    if (param.enum) prop.enum = param.enum;
    properties[key] = prop;
  }

  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object",
      properties,
      required: tool.required ?? [],
    },
  };
}

function persistSession(
  db: pwnkitDB,
  state: NativeAgentState,
  config: NativeAgentConfig,
  status: string,
): void {
  // Trim messages for storage — keep last N to stay under size limits
  const maxStoredMessages = 40;
  const messagesToStore =
    state.messages.length > maxStoredMessages
      ? state.messages.slice(-maxStoredMessages)
      : state.messages;

  db.saveSession({
    id: state.sessionId,
    scanId: config.scanId,
    agentRole: config.role,
    turnCount: state.turnCount,
    messages: messagesToStore,
    toolContext: {
      findings: state.findings,
      attackResults: state.attackResults,
      targetInfo: state.targetInfo,
    },
    status,
  });
}
