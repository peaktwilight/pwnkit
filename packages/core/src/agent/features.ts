/**
 * Feature flags for A/B testing agent improvements.
 * Set via environment variables: PWNKIT_FEATURE_<NAME>=0 to disable.
 * All features are ON by default.
 */
export const features = {
  /** Early-stop at 50% budget if no findings, retry with different strategy */
  earlyStopRetry: env("PWNKIT_FEATURE_EARLY_STOP", true),
  /** Detect A-A-A and A-B-A-B loop patterns, inject warning */
  loopDetection: env("PWNKIT_FEATURE_LOOP_DETECTION", true),
  /** Compress middle messages when context exceeds 30k tokens */
  contextCompaction: env("PWNKIT_FEATURE_CONTEXT_COMPACTION", true),
  /** Exploit script templates in shell prompt (blind SQLi, SSTI, auth chain) */
  scriptTemplates: env("PWNKIT_FEATURE_SCRIPT_TEMPLATES", true),
  /** Dynamic vulnerability playbooks injected after recon phase */
  dynamicPlaybooks: env("PWNKIT_FEATURE_DYNAMIC_PLAYBOOKS", false),
  /** Agent writes plan/creds to disk, injected at reflection checkpoints */
  externalMemory: env("PWNKIT_FEATURE_EXTERNAL_MEMORY", false),
  /** Inject prior attempt findings when retrying */
  progressHandoff: env("PWNKIT_FEATURE_PROGRESS_HANDOFF", false),
  /** Allow the agent to search the web for CVE details, docs, and technique references */
  webSearch: env("PWNKIT_FEATURE_WEB_SEARCH", false),
};

function env(key: string, defaultValue: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return defaultValue;
  return val !== "0" && val !== "false";
}
