export { scan } from "./scanner.js";
export type { ScanEvent, ScanListener, ScanEventType } from "./scanner.js";
export { agenticScan } from "./agentic-scanner.js";
export type { AgenticScanOptions } from "./agentic-scanner.js";
export { createScanContext, addFinding, addAttackResult, finalize } from "./context.js";
export { sendPrompt, extractResponseText } from "./http.js";
export { createRuntime, ApiRuntime, ProcessRuntime, LlmApiRuntime, RUNTIME_REGISTRY, pickRuntimeForStage, detectAvailableRuntimes, getRuntimeInfo } from "./runtime/index.js";
export type { Runtime, RuntimeConfig, RuntimeContext, RuntimeResult, RuntimeType, NativeRuntime, NativeMessage, NativeContentBlock, NativeToolDef, NativeRuntimeResult } from "./runtime/index.js";
export { buildDeepScanPrompt, buildMcpAuditPrompt, buildSourceAnalysisPrompt } from "./prompts.js";

// Package audit
export { packageAudit } from "./audit.js";
export type { PackageAuditOptions } from "./audit.js";
export { auditAgentPrompt } from "./audit-prompt.js";

// Source code review
export { sourceReview } from "./review.js";
export type { SourceReviewOptions } from "./review.js";
export { reviewAgentPrompt } from "./review-prompt.js";

// Agent system
export { runAgentLoop, runNativeAgentLoop, ToolExecutor, getToolsForRole, TOOL_DEFINITIONS } from "./agent/index.js";
export { discoveryPrompt, attackPrompt, verifyPrompt, reportPrompt } from "./agent/prompts.js";
export type {
  AgentRole,
  AgentConfig,
  AgentState,
  AgentMessage,
  ToolDefinition,
  ToolCall,
  ToolResult,
  ToolContext,
  AgentLoopOptions,
  NativeAgentConfig,
  NativeAgentLoopOptions,
  NativeAgentState,
} from "./agent/index.js";

export type { DBScan, DBFinding, DBTarget, DBAttackResult } from "./db/schema.js";
