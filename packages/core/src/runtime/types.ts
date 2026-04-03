export type RuntimeType = "api" | "claude" | "codex" | "gemini";

export interface RuntimeConfig {
  type: RuntimeType;
  timeout: number;
  cwd?: string;
  env?: Record<string, string>;
  model?: string;
  apiKey?: string;
  /** Called when the subprocess executes a tool (read file, run command, etc.) */
  onToolCall?: (name: string, detail: string) => void;
  /** Called when the model streams thinking/reasoning text */
  onThinking?: (text: string) => void;
  /** JSON Schema for structured output (Claude --json-schema, Codex --output-schema) */
  outputSchema?: Record<string, unknown>;
}

export interface RuntimeResult {
  output: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  error?: string;
}

export interface Runtime {
  readonly type: RuntimeType;
  execute(prompt: string, context?: RuntimeContext): Promise<RuntimeResult>;
  isAvailable(): Promise<boolean>;
}

export interface RuntimeContext {
  target?: string;
  findings?: string;
  templateId?: string;
  systemPrompt?: string;
  scanId?: string;
  mcp?: {
    enableTargetTools?: boolean;
    dbPath?: string;
  };
}

// ── Native Runtime (structured messages + tool_use) ──

export interface NativeMessage {
  role: "user" | "assistant";
  content: NativeContentBlock[];
}

export type NativeContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface NativeToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface NativeRuntimeResult {
  content: NativeContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "error";
  usage?: { inputTokens: number; outputTokens: number };
  durationMs: number;
  error?: string;
}

export interface NativeRuntime {
  readonly type: RuntimeType;
  executeNative(
    system: string,
    messages: NativeMessage[],
    tools: NativeToolDef[],
  ): Promise<NativeRuntimeResult>;
  isAvailable(): Promise<boolean>;
}
