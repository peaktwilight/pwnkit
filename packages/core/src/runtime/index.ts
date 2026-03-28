export type {
  Runtime,
  RuntimeConfig,
  RuntimeContext,
  RuntimeResult,
  RuntimeType,
  NativeRuntime,
  NativeMessage,
  NativeContentBlock,
  NativeToolDef,
  NativeRuntimeResult,
} from "./types.js";
export { ApiRuntime } from "./api.js";
export { LlmApiRuntime } from "./llm-api.js";
export { ProcessRuntime } from "./process.js";
export {
  RUNTIME_REGISTRY,
  pickRuntimeForStage,
  detectAvailableRuntimes,
  getRuntimeInfo,
} from "./registry.js";

import type { RuntimeConfig, Runtime } from "./types.js";
import { ApiRuntime } from "./api.js";
import { LlmApiRuntime } from "./llm-api.js";
import { ProcessRuntime } from "./process.js";

export function createRuntime(config: RuntimeConfig): Runtime {
  switch (config.type) {
    case "api":
      // LlmApiRuntime implements both Runtime (legacy) and NativeRuntime (agentic)
      // Use it for API mode so we get native tool_use support in agent loops
      return new LlmApiRuntime(config);
    case "claude":
    case "codex":
    case "gemini":
    case "opencode":
      return new ProcessRuntime(config);
  }
}

/**
 * Create a runtime specifically for sending payloads to a target endpoint
 * (not for LLM reasoning). Used by the attack stage to deliver payloads.
 */
export function createTargetRuntime(config: RuntimeConfig): ApiRuntime {
  return new ApiRuntime(config);
}
