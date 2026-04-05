export { scan } from "./scanner.js";
export type { ScanEvent, ScanListener, ScanEventType } from "./scanner.js";
export { agenticScan } from "./agentic-scanner.js";
export type { AgenticScanOptions } from "./agentic-scanner.js";
export { createScanContext, addFinding, addAttackResult, finalize } from "./context.js";
export { sendPrompt, extractResponseText, isMcpTarget } from "./http.js";
export { createRuntime, ProcessRuntime, LlmApiRuntime, RUNTIME_REGISTRY, pickRuntimeForStage, detectAvailableRuntimes, getRuntimeInfo } from "./runtime/index.js";
export type { Runtime, RuntimeConfig, RuntimeContext, RuntimeResult, RuntimeType, NativeRuntime, NativeMessage, NativeContentBlock, NativeToolDef, NativeRuntimeResult } from "./runtime/index.js";
export { buildDeepScanPrompt, buildMcpAuditPrompt, buildSourceAnalysisPrompt } from "./prompts.js";
export { resolveMcpEndpoint, listMcpTools, callMcpTool, discoverMcpTarget, runMcpSecurityChecks } from "./mcp.js";

// Analysis prompts
export { auditAgentPrompt, reviewAgentPrompt } from "./analysis-prompts.js";

// Agent runner
export { runAnalysisAgent } from "./agent-runner.js";
export type { AnalysisAgentOptions } from "./agent-runner.js";

// Package audit
export { packageAudit } from "./audit.js";
export type { PackageAuditOptions } from "./audit.js";

// Source code review
export { sourceReview } from "./review.js";
export type { SourceReviewOptions } from "./review.js";

// Unified pipeline: prepare + static analysis
export { prepare, detectTargetType } from "./prepare.js";
export type { TargetType, PrepareResult, PrepareOptions } from "./prepare.js";
export { runStaticAnalysis } from "./static-analysis.js";
export type { StaticAnalysisResult } from "./static-analysis.js";

// Unified pipeline
export { runPipeline } from "./unified-pipeline.js";
export type { PipelineOptions, PipelineReport } from "./unified-pipeline.js";

// Agent system
export { runAgentLoop, runNativeAgentLoop, ToolExecutor, getToolsForRole, TOOL_DEFINITIONS, features, estimateCost } from "./agent/index.js";
export { discoveryPrompt, attackPrompt, verifyPrompt, reportPrompt, sourceVerifyPrompt, researchPrompt, blindVerifyPrompt } from "./agent/prompts.js";
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
