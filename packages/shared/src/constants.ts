export const VERSION = "0.2.1";

export const DEFAULT_MODEL = "claude-sonnet-4-20250514";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_CONCURRENCY = 5;

export const DEPTH_CONFIG = {
  quick: { maxTemplates: 5, maxPayloadsPerTemplate: 1, multiTurn: false },
  default: { maxTemplates: 20, maxPayloadsPerTemplate: 3, multiTurn: false },
  deep: { maxTemplates: Infinity, maxPayloadsPerTemplate: Infinity, multiTurn: true },
} as const;

export const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};
