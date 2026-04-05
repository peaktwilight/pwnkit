import type { Finding, AttackResult, TargetInfo, AuthConfig } from "@pwnkit/shared";

// ── Agent Roles ──

export type AgentRole = "discovery" | "attack" | "verify" | "report" | "audit" | "review";

// ── Tool Definitions ──

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParam>;
  required?: string[];
}

export interface ToolParam {
  type: "string" | "number" | "boolean" | "object";
  description: string;
  enum?: string[];
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
}

// ── Agent Messages (multi-turn) ──

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface AgentMessage {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: Array<{ name: string; result: ToolResult }>;
}

// ── Agent Configuration ──

export interface AgentConfig {
  role: AgentRole;
  systemPrompt: string;
  tools: ToolDefinition[];
  maxTurns: number;
  target: string;
  scanId: string;
  scopePath?: string;
  sessionId?: string;
  attachTargetToolsMcp?: boolean;
  dbPath?: string;
  authConfig?: AuthConfig;
}

// ── Agent State ──

export interface AgentState {
  messages: AgentMessage[];
  turnCount: number;
  findings: Finding[];
  attackResults: AttackResult[];
  targetInfo: Partial<TargetInfo>;
  done: boolean;
  summary: string;
}

// ── Tool Execution Context ──

export interface ToolContext {
  target: string;
  scanId: string;
  findings: Finding[];
  attackResults: AttackResult[];
  targetInfo: Partial<TargetInfo>;
  scopePath?: string;
  persistFindings?: boolean;
  authConfig?: AuthConfig;
}
