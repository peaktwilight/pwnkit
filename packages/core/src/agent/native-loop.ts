import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import type {
  NativeRuntime,
  NativeMessage,
  NativeContentBlock,
  NativeToolDef,
  NativeRuntimeResult,
} from "../runtime/types.js";
import type { ToolDefinition, ToolCall, ToolResult, ToolContext, AgentRole } from "./types.js";
import { ToolExecutor, getToolsForRole } from "./tools.js";
import { features } from "./features.js";
import { detectPlaybooks, buildPlaybookInjection } from "./playbooks.js";
import { estimateCost } from "./cost.js";
import type { pwnkitDB } from "@pwnkit/db";
import type { Finding, AttackResult, TargetInfo } from "@pwnkit/shared";

// ── External Memory ──
// The agent can persist working state (creds, endpoints, attack plans) to this
// file via bash. At reflection checkpoints the contents are injected back into
// the conversation so the agent doesn't lose track of discoveries.
const EXTERNAL_MEMORY_PATH = "/tmp/pwnkit-state.json";
const EXTERNAL_MEMORY_MAX_CHARS = 2000;

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
  /** Which retry attempt this is (0 = first attempt). Used by early-stop logic. */
  retryCount?: number;
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
  /** Set to true when the loop stopped early because no save_finding was called by the halfway point. */
  earlyStopNoProgress: boolean;
  /** Brief description of tools/approaches used before the early stop (for retry context). */
  attemptSummary: string;
  /** Approximate USD cost based on token usage and model pricing. */
  estimatedCostUsd: number;
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
    persistFindings: db !== null,
  };

  const executor = new ToolExecutor(toolCtx, db);
  const tools = config.tools.length > 0 ? config.tools : getToolsForRole(config.role, { hasScope: !!config.scopePath });

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

    // Clean up external memory file at the start of a new scan (not between retries)
    if (features.externalMemory && (config.retryCount ?? 0) === 0) {
      try { fs.unlinkSync(EXTERNAL_MEMORY_PATH); } catch { /* file may not exist */ }
    }
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
    earlyStopNoProgress: false,
    attemptSummary: "",
    estimatedCostUsd: 0,
  };

  // Early-stop tracking: has the agent called save_finding at least once?
  let saveFindingCalled = false;
  // Collect tool names used for the attempt summary (deduped)
  const toolsUsedSet = new Set<string>();

  // Context window compaction — allow re-compaction as context regrows
  let compactionCount = 0;
  let tokensAtLastCompaction = 0;

  // Dynamic playbook injection — only inject once per session
  let playbookInjected = false;
  const recentToolResultTexts: string[] = [];

  // Loop / oscillation detection (BoxPwnr-inspired)
  const loopDetector = new LoopDetector();

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

    // ── Context window compaction (BoxPwnr-inspired) ──
    // Trigger at 60% of context window (~77k tokens for 128k models).
    // Allow multiple compactions as context regrows — don't re-compact until
    // tokens have grown by at least 30k since last compaction.
    const COMPACTION_THRESHOLD = 77_000;
    const COMPACTION_REGROW = 30_000;
    if (
      features.contextCompaction
      && state.totalUsage.inputTokens > COMPACTION_THRESHOLD
      && state.totalUsage.inputTokens - tokensAtLastCompaction > COMPACTION_REGROW
      && state.messages.length > 15
    ) {
      const beforeCount = state.messages.length;

      // Use LLM-based compaction if we have the runtime, otherwise regex
      state.messages = await compactMessagesWithLLM(state.messages, runtime, config.systemPrompt);

      compactionCount++;
      tokensAtLastCompaction = state.totalUsage.inputTokens;

      const afterCount = state.messages.length;
      onEvent?.("context_compacted", {
        turn: state.turnCount,
        inputTokens: state.totalUsage.inputTokens,
        messagesBefore: beforeCount,
        messagesAfter: afterCount,
        compactionNumber: compactionCount,
      });
      if (db) {
        db.logEvent({
          scanId: config.scanId,
          stage: config.role,
          eventType: "context_compacted",
          agentRole: config.role,
          payload: {
            turn: state.turnCount,
            inputTokens: state.totalUsage.inputTokens,
            messagesBefore: beforeCount,
            messagesAfter: afterCount,
            compactionNumber: compactionCount,
          },
          timestamp: Date.now(),
        });
      }
    }

    // Handle error or empty response
    if (result.error || (result.content.length === 0 && (!result.usage || result.usage.outputTokens === 0))) {
      const errorMsg = result.error || "API returned empty response (0 tokens) — model may be rate-limited or unavailable";
      process.stderr.write(`[pwnkit] Agent loop error on turn ${state.turnCount}: ${errorMsg}\n`);
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

      // Push the agent to keep working — but only if the last message
      // in the conversation is from the user (avoid invalid sequences
      // where two user messages follow each other on the Responses API)
      const lastMsg = state.messages[state.messages.length - 1];
      if (lastMsg?.role !== "user") {
        state.messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: buildContinuePrompt(config, state.turnCount),
            },
          ],
        });
      }
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

    // ── Collect tool result text for playbook detection ──
    if (features.dynamicPlaybooks && !playbookInjected) {
      for (const block of toolResultBlocks) {
        if (block.type === "tool_result") {
          recentToolResultTexts.push(block.content);
        }
      }
    }

    // ── Dynamic playbook injection at ~30% budget ──
    // After initial reconnaissance, pattern-match tool results to detect
    // vulnerability types and inject targeted methodology playbooks.
    const playbookPct = state.turnCount / config.maxTurns;
    if (
      features.dynamicPlaybooks
      && !playbookInjected
      && playbookPct >= 0.3
      && recentToolResultTexts.length > 0
    ) {
      const detectedTypes = detectPlaybooks(recentToolResultTexts);
      if (detectedTypes.length > 0) {
        const playbookText = buildPlaybookInjection(detectedTypes);
        if (playbookText) {
          state.messages.push({
            role: "user",
            content: [{ type: "text", text: playbookText }],
          });
          playbookInjected = true;
          onEvent?.("playbook_injected", {
            turn: state.turnCount,
            types: detectedTypes,
          });
          if (db) {
            db.logEvent({
              scanId: config.scanId,
              stage: config.role,
              eventType: "playbook_injected",
              agentRole: config.role,
              payload: { turn: state.turnCount, types: detectedTypes },
              timestamp: Date.now(),
            });
          }
        }
      }
    }

    // ── Loop / oscillation detection ──
    if (features.loopDetection) loopDetector.record(toolCalls);
    const loopWarning = features.loopDetection ? loopDetector.detect() : null;
    if (loopWarning) {
      // Inject warning into the conversation so the model sees it next turn
      state.messages.push({
        role: "user",
        content: [{ type: "text", text: loopWarning }],
      });
      onEvent?.("loop_detected", { turn: state.turnCount });
    }

    // Track tool usage for early-stop logic
    for (const call of toolCalls) {
      toolsUsedSet.add(call.name);
      if (call.name === "save_finding") {
        saveFindingCalled = true;
      }
    }

    // ── Early-stop check at 50% budget ──
    // If the agent is at the halfway point, hasn't found anything, and this
    // is the first attempt (retryCount === 0), bail out so the caller can
    // retry with a different strategy. Only applies to attack role with a
    // meaningful budget (>= 10 turns — below that, early-stop overhead isn't
    // worth it).
    const retryCount = config.retryCount ?? 0;
    const halfwayTurn = Math.floor(config.maxTurns / 2);
    if (
      features.earlyStopRetry
      && config.role === "attack"
      && retryCount === 0
      && config.maxTurns >= 10
      && state.turnCount >= halfwayTurn
      && !saveFindingCalled
      && !state.done
    ) {
      state.earlyStopNoProgress = true;
      state.attemptSummary = `Used tools: ${[...toolsUsedSet].join(", ")}. Ran ${state.turnCount} turns without calling save_finding.`;
      state.summary = `Early stop at turn ${state.turnCount}/${config.maxTurns}: no findings — retry recommended.`;
      onEvent?.("early_stop_no_progress", {
        turn: state.turnCount,
        maxTurns: config.maxTurns,
        toolsUsed: [...toolsUsedSet],
      });
      break;
    }

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

  // Compute estimated cost
  state.estimatedCostUsd = estimateCost(state.totalUsage);

  if (!state.done && !state.earlyStopNoProgress) {
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
        estimatedCostUsd: state.estimatedCostUsd,
        summary: state.summary.slice(0, 500),
      },
      timestamp: Date.now(),
    });
  }

  return state;
}

// ── Context Window Compaction (BoxPwnr-style) ──
// When the conversation grows too large, replace middle messages with a summary
// while preserving critical ones (credentials, flags, findings) and the tail.

/** Patterns that indicate a message contains critical information worth preserving verbatim. */
const CRITICAL_PATTERNS = [
  /flag/i, /password/i, /credentials?/i, /cookie/i, /token/i,
  /session/i, /admin/i, /root/i, /\/etc\/passwd/i, /save_finding/i,
  /secret/i, /api[_-]?key/i, /bearer/i, /jwt/i,
];

/** Patterns for extracting noteworthy lines from tool results for the summary. */
const SUMMARY_EXTRACT_PATTERNS = [
  /flag\{[^}]*\}/i, /password[\s:="]+\S+/i, /token[\s:="]+\S+/i,
  /cookie[\s:="]+\S+/i, /secret[\s:="]+\S+/i, /api[_-]?key[\s:="]+\S+/i,
  /HTTP\/\d\.\d\s+\d{3}/i, /status[\s:]+\d{3}/i,
  /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?/,
  /\/[\w/.-]{3,}/, // file paths / URL paths
  /error|denied|forbidden|unauthorized|success|found|vulnerable/i,
  /save_finding/i,
  /admin|root|sudo/i,
];

function serializeMessageToText(msg: NativeMessage): string {
  const parts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text") parts.push(block.text);
    else if (block.type === "tool_use") parts.push(`${block.name}(${JSON.stringify(block.input)})`);
    else if (block.type === "tool_result") parts.push(block.content);
  }
  return parts.join("\n");
}

function isCriticalMessage(msg: NativeMessage): boolean {
  const text = serializeMessageToText(msg);
  return CRITICAL_PATTERNS.some((p) => p.test(text));
}

function extractKeyFindings(messages: NativeMessage[]): string {
  const findings: string[] = [];
  const seen = new Set<string>();

  for (const msg of messages) {
    for (const block of msg.content) {
      // Extract from tool results (where most useful info lives)
      const text = block.type === "tool_result"
        ? block.content
        : block.type === "text"
          ? block.text
          : block.type === "tool_use"
            ? `${block.name}: ${JSON.stringify(block.input)}`
            : "";

      if (!text) continue;

      // For save_finding calls, capture the whole thing
      if (block.type === "tool_use" && block.name === "save_finding") {
        const entry = `FINDING: ${JSON.stringify(block.input)}`;
        if (!seen.has(entry)) {
          seen.add(entry);
          findings.push(entry);
        }
        continue;
      }

      // Extract matching lines from tool output
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length > 500) continue;
        if (SUMMARY_EXTRACT_PATTERNS.some((p) => p.test(trimmed))) {
          if (!seen.has(trimmed)) {
            seen.add(trimmed);
            findings.push(trimmed);
          }
        }
      }
    }
  }

  // Cap the summary so it doesn't bloat the context
  return findings.slice(0, 80).join("\n");
}

/**
 * Compact the conversation using LLM-based summarization.
 *
 * Approach (BoxPwnr-inspired):
 * 1. Serialize all middle messages (between first prompt and last 10 turns) to text
 * 2. Ask the LLM to produce a concise technical summary (preserving creds, endpoints, findings)
 * 3. Rebuild conversation: [system + initial prompt] → [assistant ack] → [user: summary] → [tail]
 *
 * Falls back to regex-based extraction if LLM summarization fails.
 */
async function compactMessagesWithLLM(
  messages: NativeMessage[],
  runtime: NativeRuntime,
  systemPrompt: string,
): Promise<NativeMessage[]> {
  const preserveTailCount = 10;

  if (messages.length <= preserveTailCount + 2) {
    return messages; // not enough messages to compact
  }

  const firstMessage = messages[0]!;
  const tailStart = messages.length - preserveTailCount;
  const tail = messages.slice(tailStart);
  const middle = messages.slice(1, tailStart);

  // Serialize middle messages for summarization
  const conversationText = middle
    .map((m) => {
      const prefix = m.role === "assistant" ? "[Assistant]" : "[Tool Output]";
      return `${prefix}\n${serializeMessageToText(m)}`;
    })
    .join("\n\n")
    .slice(0, 50_000); // Cap to avoid overwhelming the summary call

  // Also extract regex findings as fallback / supplement
  const regexFindings = extractKeyFindings(middle);

  // Try LLM summarization
  let summaryText: string;
  try {
    const summaryResult = await runtime.executeNative(
      "You are a concise technical summarizer for a security testing conversation.",
      [
        {
          role: "user",
          content: [{
            type: "text",
            text: `Summarize this security testing conversation. Preserve ALL:\n- URLs and endpoints discovered\n- Credentials, tokens, cookies, API keys found\n- Technologies and frameworks identified\n- Vulnerabilities found or suspected\n- Attack attempts and their results (success/failure)\n- Any flags or partial flags seen\n\nBe concise but complete. Use bullet points.\n\nCONVERSATION:\n${conversationText}`,
          }],
        },
      ],
      [], // no tools for summary
    );

    // Extract text from result
    const textBlocks = summaryResult.content.filter(
      (b): b is NativeContentBlock & { type: "text" } => b.type === "text",
    );
    summaryText = textBlocks.map((b) => b.text).join("\n");

    if (!summaryText || summaryText.length < 50) {
      throw new Error("LLM summary too short or empty");
    }
  } catch {
    // Fallback to regex extraction
    summaryText = [
      "## Scan Progress Summary (compacted)",
      "",
      `Compacted ${middle.length} messages.`,
      "",
      "### Key findings, credentials, endpoints:",
      regexFindings || "(no findings extracted)",
    ].join("\n");
  }

  // Append regex findings that may have been missed by LLM
  if (regexFindings) {
    summaryText += `\n\n### Additional extracted context:\n${regexFindings}`;
  }

  // Rebuild with correct role alternation
  const compacted: NativeMessage[] = [firstMessage];

  compacted.push({
    role: "assistant",
    content: [{ type: "text", text: "I have been working on this scan. Here is my progress so far." }],
  });

  compacted.push({
    role: "user",
    content: [{ type: "text", text: `[COMPACTED CONVERSATION SUMMARY]\n\n${summaryText}\n\nPlease continue from where we left off. What should we try next?` }],
  });

  // Append the tail, ensuring correct role alternation
  let tailIdx = 0;
  while (tailIdx < tail.length && tail[tailIdx]!.role !== "assistant") {
    tailIdx++;
  }

  let lastRole: "user" | "assistant" = "user";
  for (let i = tailIdx; i < tail.length; i++) {
    const msg = tail[i]!;
    if (msg.role === lastRole) continue;
    compacted.push(msg);
    lastRole = msg.role;
  }

  return compacted;
}

// ── Loop / Oscillation Detection ──
// Inspired by BoxPwnr (97.1% on XBOW): when the agent gets stuck repeating the
// same commands, inject a warning to break the cycle.

interface ToolCallFingerprint {
  name: string;
  argPrefix: string; // first 100 chars of JSON-stringified arguments
}

class LoopDetector {
  private history: ToolCallFingerprint[] = [];
  private readonly windowSize = 6;
  /** Track which pattern signatures already fired so we don't spam. */
  private firedPatterns = new Set<string>();

  /** Record one or more tool calls from a single turn. */
  record(calls: Array<{ name: string; arguments: unknown }>): void {
    for (const c of calls) {
      const argStr = typeof c.arguments === "string"
        ? c.arguments
        : JSON.stringify(c.arguments ?? "");
      this.history.push({
        name: c.name,
        argPrefix: argStr.slice(0, 100),
      });
    }
    // Keep bounded
    if (this.history.length > this.windowSize * 2) {
      this.history = this.history.slice(-this.windowSize * 2);
    }
  }

  /** Returns a warning string if a loop is detected, or null otherwise. */
  detect(): string | null {
    const h = this.history;
    if (h.length < 3) return null;

    const fp = (e: ToolCallFingerprint) => `${e.name}:${e.argPrefix}`;

    // Pattern 1: Same exact command repeated 3+ times in a row
    if (h.length >= 3) {
      const last = fp(h[h.length - 1]!);
      const prev1 = fp(h[h.length - 2]!);
      const prev2 = fp(h[h.length - 3]!);
      if (last === prev1 && last === prev2) {
        const sig = `repeat:${last}`;
        if (!this.firedPatterns.has(sig)) {
          this.firedPatterns.add(sig);
          return LOOP_WARNING;
        }
      }
    }

    // Pattern 2: A-B-A-B alternating pattern (2+ full cycles = 4 entries)
    if (h.length >= 4) {
      const a1 = fp(h[h.length - 4]!);
      const b1 = fp(h[h.length - 3]!);
      const a2 = fp(h[h.length - 2]!);
      const b2 = fp(h[h.length - 1]!);
      if (a1 !== b1 && a1 === a2 && b1 === b2) {
        const sig = `alt:${a1}|${b1}`;
        if (!this.firedPatterns.has(sig)) {
          this.firedPatterns.add(sig);
          return LOOP_WARNING;
        }
      }
    }

    return null;
  }
}

const LOOP_WARNING =
  "⚠ You appear stuck in a loop repeating the same commands. " +
  "Try a COMPLETELY DIFFERENT approach — different tool, different endpoint, different payload.";

// ── Helpers ──

/**
 * Read the agent's external working memory file. Returns a formatted suffix
 * to append to the reflection checkpoint prompt, or an empty string if the
 * file doesn't exist or the feature is off.
 */
function readExternalMemory(): string {
  try {
    const raw = fs.readFileSync(EXTERNAL_MEMORY_PATH, "utf-8");
    if (!raw.trim()) return "";
    const capped = raw.length > EXTERNAL_MEMORY_MAX_CHARS
      ? raw.slice(0, EXTERNAL_MEMORY_MAX_CHARS) + "\n...(truncated)"
      : raw;
    return `\n\n## Your Saved State\n\`\`\`json\n${capped}\n\`\`\`\nUpdate this file as you discover new information.`;
  } catch {
    return "";
  }
}

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
  const pct = turnCount / config.maxTurns;
  const remaining = config.maxTurns - turnCount;

  // Read external memory at reflection checkpoints (30%/50%/70%/85%)
  const memorySuffix = (pct >= 0.3 && features.externalMemory)
    ? readExternalMemory()
    : "";

  // Multi-checkpoint budget awareness (inspired by Cyber-AutoAgent)
  if (pct >= 0.85) {
    return `FINAL PUSH: ${remaining} turns left. Go for the highest-confidence exploit path ONLY. No more exploration — exploit what you found. Use your tools.${memorySuffix}`;
  }
  if (pct >= 0.7) {
    return `URGENCY: ${remaining} turns left. If current approach is not working, SWITCH NOW to a completely different technique. Use your tools.${memorySuffix}`;
  }
  if (pct >= 0.5) {
    return `HALFWAY: ${remaining} turns left. List every approach tried and its result. What is the MOST PROMISING untested vector? Focus there. Use your tools.${memorySuffix}`;
  }
  if (pct >= 0.3) {
    return `STATUS: ${remaining} turns left. Summarize what you have learned. What is your top hypothesis? Use your tools to test it.${memorySuffix}`;
  }

  switch (config.role) {
    case "discovery":
    case "attack":
    case "verify":
      return turnCount < 2
        ? "You must use your target interaction tools. Start by sending prompts or HTTP requests to the configured target. Do not just describe what you would do."
        : "Continue testing. Use your tools — do not just describe what you would do.";
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
