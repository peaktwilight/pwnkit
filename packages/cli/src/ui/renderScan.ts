import React, { useState, useEffect } from "react";
import { render } from "ink";
import { ScanUI } from "./ScanUI.js";
import { buildShareUrl } from "../utils.js";
import type { ScanEvent, ScanSummary, StageState, StageStatusKind } from "./ScanUI.js";

export type { ScanEvent, ScanSummary };
export type CommandMode = "audit" | "review" | "scan";

interface RenderScanOptions {
  version: string;
  target: string;
  depth: string;
  mode: CommandMode;
}

interface RenderScanResult {
  onEvent: (event: { type: string; stage?: string; message: string; data?: unknown }) => void;
  waitForExit: () => Promise<void>;
  setReport: (report: Record<string, unknown>) => void;
}

function getStages(mode: CommandMode): StageState[] {
  if (mode === "audit") {
    return [
      { id: "install", label: "Install", status: "pending", actions: [], findings: [] },
      { id: "npm-audit", label: "npm audit", status: "pending", actions: [], findings: [] },
      { id: "semgrep", label: "Semgrep", status: "pending", actions: [], findings: [] },
      { id: "ai-agent", label: "AI Agent", status: "pending", actions: [], findings: [] },
    ];
  }
  if (mode === "review") {
    return [
      { id: "semgrep", label: "Semgrep", status: "pending", actions: [], findings: [] },
      { id: "ai-agent", label: "AI Agent", status: "pending", actions: [], findings: [] },
    ];
  }
  // scan
  return [
    { id: "discovery", label: "Discovery", status: "pending", actions: [], findings: [] },
    { id: "attack", label: "Attack", status: "pending", actions: [], findings: [] },
    { id: "verify", label: "Verify", status: "pending", actions: [], findings: [] },
    { id: "report", label: "Report", status: "pending", actions: [], findings: [] },
  ];
}

export function renderScanUI(opts: RenderScanOptions): RenderScanResult {
  let stages = getStages(opts.mode);
  let summary: ScanSummary | null = null;
  let thinking: string | null = null;
  let rerender: (() => void) | null = null;

  // Track which discovery sub-step we're on (install vs npm-audit)
  let discoveryStep = 0; // 0 = install, 1 = npm-audit

  function App() {
    const [tick, setTick] = useState(0);
    useEffect(() => {
      rerender = () => setTick((t) => t + 1);
      return () => { rerender = null; };
    }, []);
    return React.createElement(ScanUI, { stages, summary, thinking });
  }

  const instance = render(React.createElement(App));

  function updateStage(id: string, updater: (s: StageState) => StageState) {
    stages = stages.map((s) => (s.id === id ? updater(s) : s));
    rerender?.();
  }

  function onEvent(event: { type: string; stage?: string; message: string; data?: unknown }): void {
    const msg = event.message ?? "";
    const coreStage = event.stage;

    // === ROUTE EVENTS TO UI STAGES ===

    if (event.type === "stage:start") {
      // Discovery stage is reused for install + npm-audit
      if (coreStage === "discovery") {
        if (discoveryStep === 0) {
          updateStage("install", (s) => ({ ...s, status: "running", detail: msg }));
        } else {
          updateStage("npm-audit", (s) => ({ ...s, status: "running", detail: msg }));
        }
        return;
      }

      if (coreStage === "source-analysis") {
        updateStage("semgrep", (s) => ({ ...s, status: "running", detail: msg }));
        return;
      }

      if (coreStage === "attack") {
        // Check if AI Agent is already running — if so, this is a tool call
        const aiStage = stages.find((s) => s.id === "ai-agent" || s.id === "attack");
        if (aiStage && aiStage.status === "running") {
          // Tool call action
          updateStage(aiStage.id, (s) => ({
            ...s,
            actions: [...s.actions, msg].slice(-6),
          }));
        } else {
          // First start of AI agent
          const id = stages.find((s) => s.id === "ai-agent") ? "ai-agent" : "attack";
          const detail = msg.replace("claude", "Claude Code").replace("codex", "Codex");
          updateStage(id, (s) => ({ ...s, status: "running", detail }));
        }
        return;
      }

      // Scan mode stages
      if (coreStage === "verify" || coreStage === "report" || coreStage === "discovery") {
        const id = coreStage;
        if (stages.find((s) => s.id === id)) {
          const current = stages.find((s) => s.id === id);
          if (current?.status === "running") {
            updateStage(id, (s) => ({ ...s, actions: [...s.actions, msg].slice(-6) }));
          } else {
            updateStage(id, (s) => ({ ...s, status: "running", detail: msg }));
          }
        }
        return;
      }
    }

    if (event.type === "stage:end") {
      if (coreStage === "discovery") {
        if (discoveryStep === 0) {
          updateStage("install", (s) => ({
            ...s, status: "done", detail: msg, duration: (event.data as any)?.durationMs,
          }));
          discoveryStep = 1;
        } else {
          updateStage("npm-audit", (s) => ({
            ...s, status: "done", detail: msg, duration: (event.data as any)?.durationMs,
          }));
        }
        return;
      }

      if (coreStage === "source-analysis") {
        updateStage("semgrep", (s) => ({
          ...s, status: "done", detail: msg, duration: (event.data as any)?.durationMs,
        }));
        return;
      }

      if (coreStage === "attack") {
        const id = stages.find((s) => s.id === "ai-agent") ? "ai-agent" : "attack";
        updateStage(id, (s) => ({
          ...s, status: "done", detail: msg, duration: (event.data as any)?.durationMs,
        }));
        return;
      }

      if (coreStage === "report") {
        // "Audit complete" / "Review complete" — this is the final event
        // Don't update a stage, it'll be handled by setReport
        return;
      }

      // Generic stage end
      if (coreStage && stages.find((s) => s.id === coreStage)) {
        updateStage(coreStage, (s) => ({
          ...s, status: "done", detail: msg, duration: (event.data as any)?.durationMs,
        }));
        return;
      }
    }

    if (event.type === "finding") {
      const running = stages.find((s) => s.status === "running");
      if (running) {
        const severity = (event.data as any)?.severity ?? "info";
        const title = msg.length > 80 ? msg.slice(0, 80) + "..." : msg;
        updateStage(running.id, (s) => ({
          ...s,
          findings: [...s.findings, { severity, title }],
        }));
      }
      return;
    }

    if (event.type === "error") {
      const running = stages.find((s) => s.status === "running");
      if (running) {
        updateStage(running.id, (s) => ({ ...s, status: "error", error: msg }));
      }
      return;
    }

    // Thinking tokens
    if ((event.type as string) === "thinking") {
      thinking = msg;
      rerender?.();
    }
  }

  function setReport(report: Record<string, unknown>): void {
    stages = stages.map((s) =>
      s.status === "pending" ? { ...s, status: "done" as StageStatusKind, detail: "—" } :
      s.status === "running" ? { ...s, status: "done" as StageStatusKind } : s
    );

    const rep = report as any;
    summary = {
      critical: rep.summary?.critical ?? 0,
      high: rep.summary?.high ?? 0,
      medium: rep.summary?.medium ?? 0,
      low: rep.summary?.low ?? 0,
      info: rep.summary?.info ?? 0,
      duration: rep.durationMs,
      shareUrl: buildShareUrl(rep),
    };
    rerender?.();
  }

  async function waitForExit(): Promise<void> {
    await new Promise((r) => setTimeout(r, 150));
    instance.unmount();
    await instance.waitUntilExit();
  }

  return { onEvent, waitForExit, setReport };
}
