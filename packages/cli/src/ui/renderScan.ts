import React from "react";
import { render } from "ink";
import { ScanUI } from "./ScanUI.js";
import { buildShareUrl } from "../utils.js";
import type { ScanEvent, ScanSummary, StageName, StageStatusKind, StageState, StageFinding } from "./ScanUI.js";

// Re-export types for consumers
export type { ScanEvent, ScanSummary, StageName };

interface RenderScanOptions {
  version: string;
  target: string;
  depth: string;
  mode?: string;
}

interface RenderScanResult {
  /** Push a scan event to update the TUI. */
  onEvent: (event: ScanEvent) => void;
  /** Resolves when the Ink instance is unmounted. */
  waitForExit: () => Promise<void>;
  /** Set the final report summary (renders the bottom bar). */
  setReport: (report: {
    summary: { critical: number; high: number; medium: number; low: number; info?: number };
    shareUrl?: string;
  }) => void;
}

const DEFAULT_STAGES: Array<{ name: StageName; label: string }> = [
  { name: "install", label: "Install" },
  { name: "npm-audit", label: "npm audit" },
  { name: "semgrep", label: "Semgrep" },
  { name: "ai-agent", label: "AI Agent" },
  { name: "verify", label: "Verify" },
  { name: "report", label: "Report" },
];

/**
 * Create and render the Ink-based scan TUI.
 *
 * Returns an event-driven interface: the caller pushes ScanEvents and the
 * UI updates automatically.  Call `setReport` once the scan finishes to
 * render the summary bar, then `waitForExit` to block until Ink unmounts.
 */
export function renderScanUI(opts: RenderScanOptions): RenderScanResult {
  // ── Mutable state managed outside React ──
  // We drive React updates by calling a setter captured via a wrapper component.

  let stages: StageState[] = DEFAULT_STAGES.map((s) => ({
    ...s,
    status: "pending" as StageStatusKind,
  }));
  let summary: ScanSummary | null = null;
  let rerender: (() => void) | null = null;

  // Thin wrapper component that reads from the mutable state above.
  // `rerender` triggers a React re-render by bumping a counter.
  function App() {
    const [, setTick] = React.useState(0);

    // Capture the re-render trigger on first mount.
    React.useEffect(() => {
      rerender = () => setTick((t) => t + 1);
      return () => {
        rerender = null;
      };
    }, []);

    return React.createElement(ScanUI, {
      version: opts.version,
      stages,
      summary,
    });
  }

  const instance = render(React.createElement(App));

  // ── Helpers ──

  function updateStage(name: StageName, updater: (s: StageState) => StageState) {
    stages = stages.map((s) => (s.name === name ? updater(s) : s));
    rerender?.();
  }

  // ── Public API ──

  // Map events to UI stages — use message content as primary signal
  // because the audit pipeline reuses "discovery" for both install and npm audit
  function detectStage(event: { type: string; stage?: string; message?: string }): StageName | undefined {
    const msg = (event.message ?? "").toLowerCase();

    // Message-based detection (most reliable)
    if (msg.includes("install")) return "install";
    if (msg.includes("npm audit")) return "npm-audit";
    if (msg.includes("semgrep")) return "semgrep";
    if (msg.includes("agent") || msg.includes("claude") || msg.includes("codex") || msg.includes("agentic") || msg.includes("ai ")) return "ai-agent";
    if (msg.includes("audit complete") || msg.includes("review complete")) return "report";

    // Stage-name fallback
    const stageMap: Record<string, StageName> = {
      "source-analysis": "semgrep",
      "attack": "ai-agent",
      "verify": "verify",
      "report": "report",
    };
    if (event.stage && stageMap[event.stage]) return stageMap[event.stage];

    return undefined;
  }

  function onEvent(event: ScanEvent): void {
    const stageName = detectStage(event);

    switch (event.type) {
      case "stage:start": {
        if (!stageName) break;

        // Check if this is a tool call action on an already-running stage
        const currentStage = stages.find((s) => s.name === stageName);
        const msg = event.message ?? "";
        const isToolCall = currentStage?.status === "running" && (
          msg.includes(":") && (
            msg.startsWith("Read") || msg.startsWith("shell") || msg.startsWith("Bash") ||
            msg.startsWith("Write") || msg.startsWith("Grep") || msg.startsWith("Glob") ||
            msg.startsWith("tool") || /^[A-Z][a-z]+:/.test(msg)
          )
        );

        if (isToolCall) {
          // Add as action to running stage
          updateStage(stageName, (s) => ({
            ...s,
            actions: [...(s.actions ?? []), msg].slice(-6),
          }));
        } else {
          // New stage start
          updateStage(stageName, (s) => ({
            ...s,
            status: "running",
            detail: msg,
            actions: [],
            findings: [],
          }));
        }
        break;
      }

      case "stage:end":
        if (stageName) {
          updateStage(stageName, (s) => ({
            ...s,
            status: "done",
            detail: event.message ?? s.detail,
            duration: (event.data?.durationMs as number | undefined) ?? s.duration,
          }));
        }
        break;

      case "stage:error":
        if (stageName) {
          updateStage(stageName, (s) => ({
            ...s,
            status: "error",
            detail: event.message ?? s.detail,
            error: event.message,
          }));
        }
        break;

      case "action":
        if (stageName) {
          updateStage(stageName, (s) =>
            s.status === "running"
              ? {
                  ...s,
                  actions: [...(s.actions ?? []), event.message ?? ""].slice(-5),
                }
              : s
          );
        }
        break;

      case "finding":
        if (stageName) {
          updateStage(stageName, (s) => ({
            ...s,
            findings: [
              ...(s.findings ?? []),
              {
                severity: (event.data?.severity as string) ?? "medium",
                title: event.message ?? "Unknown finding",
              },
            ],
          }));
        }
        break;

      case "summary":
        summary = event.data as unknown as ScanSummary;
        rerender?.();
        break;
    }
  }

  function setReport(report: {
    summary: { critical: number; high: number; medium: number; low: number; info?: number };
    durationMs?: number;
  } & Record<string, unknown>): void {
    // Auto-complete any still-pending or running stages
    stages = stages.map((s) =>
      s.status === "pending" ? { ...s, status: "done" as StageStatusKind, detail: "skipped" } :
      s.status === "running" ? { ...s, status: "done" as StageStatusKind } : s
    );

    const shareUrl = buildShareUrl(report as any);

    summary = {
      critical: report.summary.critical,
      high: report.summary.high,
      medium: report.summary.medium,
      low: report.summary.low,
      info: report.summary.info,
      duration: report.durationMs,
      shareUrl,
    };
    rerender?.();
  }

  async function waitForExit(): Promise<void> {
    instance.unmount();
    await instance.waitUntilExit();
  }

  return { onEvent, waitForExit, setReport };
}
