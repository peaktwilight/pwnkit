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
export { LlmApiRuntime } from "./llm-api.js";
export { ProcessRuntime } from "./process.js";
export { OpenRouterRuntime, DEFAULT_ENSEMBLE_MODELS } from "./openrouter.js";
export type { OpenRouterConfig } from "./openrouter.js";
export {
  RUNTIME_REGISTRY,
  pickRuntimeForStage,
  detectAvailableRuntimes,
  getRuntimeInfo,
} from "./registry.js";

import type { RuntimeConfig, Runtime } from "./types.js";
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
      return new ProcessRuntime(config);
  }
}
