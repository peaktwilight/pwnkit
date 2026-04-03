import React, { useState, useEffect } from "react";
import { render, useInput } from "ink";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { VERSION } from "@pwnkit/shared";
import { printBanner } from "./banner.js";
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

// 4 stages — clean pipeline view for the user
function getStages(): StageState[] {
  return [
    { id: "discover", label: "Discover",  status: "pending", actions: [], findings: [] },
    { id: "attack",   label: "Attack",    status: "pending", actions: [], findings: [] },
    { id: "verify",   label: "Verify",    status: "pending", actions: [], findings: [] },
    { id: "report",   label: "Report",    status: "pending", actions: [], findings: [] },
  ];
}

export function renderScanUI(opts: RenderScanOptions): RenderScanResult {
  let stages = getStages();
  let summary: ScanSummary | null = null;
  let thinking: string | null = null;
  let rerender: (() => void) | null = null;
  let resolveExit: (() => void) | null = null;


  // Static banner — printed once before Ink takes over
  const modeLabel = opts.mode === "audit" ? `auditing npm package \x1b[1m${opts.target}\x1b[0m`
    : opts.mode === "review" ? `reviewing source code \x1b[1m${opts.target}\x1b[0m`
    : `scanning target \x1b[1m${opts.target}\x1b[0m`;
  printBanner(modeLabel);

  function App() {
    const [tick, setTick] = useState(0);
    useEffect(() => {
      rerender = () => setTick((t) => t + 1);
      return () => { rerender = null; };
    }, []);
    useInput((input, key) => {
      if (!summary) return;
      if (key.return || key.escape || input.toLowerCase() === "q") {
        resolveExit?.();
      }
    });
    return React.createElement(ScanUI, {
      stages,
      summary,
      thinking,
      exitHint: summary ? "Press Enter, Esc, or q to close." : null,
    });
  }

  const instance = render(React.createElement(App));

  function updateStage(id: string, updater: (s: StageState) => StageState) {
    stages = stages.map((s) => (s.id === id ? updater(s) : s));
    rerender?.();
  }

  // Map core scanner stage names to TUI stage IDs
  function mapStageId(coreStage: string | undefined): string | undefined {
    switch (coreStage) {
      case "discovery":
      case "discover":
      case "source-analysis":
      case "prepare":
      case "analyze":
        return "discover";
      case "attack":
      case "research":
      case "agent":
        return "attack";
      case "verify":
        return "verify";
      case "report":
        return "report";
      default:
        return undefined;
    }
  }

  function onEvent(event: { type: string; stage?: string; message: string; data?: unknown }): void {
    const msg = event.message ?? "";
    const stageId = mapStageId(event.stage);

    if (event.type === "stage:start") {
      if (!stageId) return;
      const current = stages.find((s) => s.id === stageId);

      if (current?.status === "running") {
        // Already running — this is a sub-action (tool call, turn update)
        // Clean the message for display
        let action = msg
          .replace(/^(Discovery|Attack|Verify)\s*turn\s*\d+:\s*/i, "")
          .replace(/^Warning:\s*/i, "")
          .trim();
        if (action.length > 60) action = action.slice(0, 60) + "...";
        if (!action) return;
        updateStage(stageId, (s) => ({
          ...s,
          actions: [...s.actions, action].slice(-3),
        }));
      } else {
        // New stage start — show a clean label
        let detail = msg;
        const lower = msg.toLowerCase();
        if (lower.includes("claude")) detail = "using Claude";
        else if (lower.includes("codex")) detail = "using Codex";
        else if (lower.includes("gemini")) detail = "using Gemini";
        else if (lower.includes("api") || lower.includes("agentic")) detail = "using API";
        else if (detail.length > 50) detail = detail.slice(0, 50) + "...";
        updateStage(stageId, (s) => ({ ...s, status: "running", detail }));
      }
      return;
    }

    if (event.type === "stage:end") {
      if (!stageId) return;
      // Clean up detail text — remove noisy prefixes, truncate
      let detail = msg
        .replace(/^(Discovery|Attack|Verification|Report)\s*(complete|done|finished):?\s*/i, "")
        .replace(/^Agent reached max turns.*$/, "done")
        .trim();
      if (detail.length > 55) detail = detail.slice(0, 55) + "...";
      if (!detail) detail = "done";
      updateStage(stageId, (s) => ({
        ...s,
        status: "done",
        detail,
        actions: stageId === "verify" ? s.actions : s.actions.slice(0, 3),
        duration: (event.data as any)?.durationMs ?? s.duration,
      }));
      return;
    }

    if (event.type === "finding") {
      const running = stages.find((s) => s.status === "running") ?? stages.find((s) => s.id === "attack");
      if (running) {
        const severity = (event.data as any)?.severity ?? "info";
        // Clean up title — remove [severity] prefix if present, truncate
        let title = msg.replace(/^\[[\w]+\]\s*/g, "").trim();
        if (title.length > 60) title = title.slice(0, 60) + "...";
        if (!title || title === "Untitled finding") title = "Finding from AI analysis";
        updateStage(running.id, (s) => ({
          ...s,
          findings: [...s.findings, { severity, title }],
        }));
      }
      return;
    }

    if (event.type === "verify:result") {
      const data = event.data as any;
      const confirmed = data?.confirmed;
      const title = data?.title ?? event.message;
      const reason = data?.reason;
      const label = confirmed ? `\u2713 ${title}` : `\u2717 ${title}${reason ? ` \u2014 ${reason}` : ""}`;
      updateStage("verify", (s) => ({
        ...s,
        actions: [...s.actions, label],
      }));
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
    await new Promise<void>((resolve) => {
      resolveExit = () => {
        resolveExit = null;
        instance.unmount();
        resolve();
      };

      if (!process.stdin.isTTY) {
        setTimeout(() => resolveExit?.(), 1500);
      }
    });
    await instance.waitUntilExit();
  }

  return { onEvent, waitForExit, setReport };
}
