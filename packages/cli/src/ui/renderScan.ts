import React, { useState, useEffect } from "react";
import { render } from "ink";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import cfonts from "cfonts";
import { VERSION } from "@pwnkit/shared";
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

// Same 4 stages for everything — the pipeline adapts internally
function getStages(): StageState[] {
  return [
    { id: "prepare", label: "Prepare", status: "pending", actions: [], findings: [] },
    { id: "analyze", label: "Analyze", status: "pending", actions: [], findings: [] },
    { id: "agent",   label: "Agent",   status: "pending", actions: [], findings: [] },
    { id: "verify",  label: "Verify",  status: "pending", actions: [], findings: [] },
  ];
}

export function renderScanUI(opts: RenderScanOptions): RenderScanResult {
  let stages = getStages();
  let summary: ScanSummary | null = null;
  let thinking: string | null = null;
  let rerender: (() => void) | null = null;


  // Static banner — printed once before Ink takes over (won't re-render)
  const r = "\x1b[31m";    // red/crimson
  const d = "\x1b[2m";     // dim
  const b = "\x1b[1m";     // bold
  const x = "\x1b[0m";     // reset

  // Banner
  console.log("");
  try {
    cfonts.say(`pwnkit|v${VERSION}`, {
      font: "tiny",
      colors: ["red", "gray"],
      space: false,
    });
  } catch {
    console.log(`  ${r}${b}pwnkit${x} ${d}v${VERSION}${x}`);
  }
  const modeLabel = opts.mode === "audit" ? "auditing npm package"
    : opts.mode === "review" ? "reviewing source code"
    : "scanning target";
  console.log(`  ${d}${modeLabel} ${x}${b}${opts.target}${x}`);
  console.log("");

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

  // Map old event stage names to unified stage IDs
  function mapStageId(coreStage: string | undefined, msg: string): string | undefined {
    // New unified pipeline uses these directly
    if (coreStage === "prepare" || coreStage === "analyze" || coreStage === "agent" || coreStage === "verify") {
      return coreStage;
    }
    // Old event names → unified stages (backwards compat during migration)
    if (coreStage === "discovery" || coreStage === "source-analysis") {
      if (msg.toLowerCase().includes("install") || msg.toLowerCase().includes("clone") || msg.toLowerCase().includes("resolv")) return "prepare";
      return "analyze";
    }
    if (coreStage === "attack") return "agent";
    if (coreStage === "report") return undefined; // handled by setReport
    return coreStage;
  }

  function onEvent(event: { type: string; stage?: string; message: string; data?: unknown }): void {
    const msg = event.message ?? "";
    const stageId = mapStageId(event.stage, msg);

    if (event.type === "stage:start") {
      if (!stageId) return;
      const current = stages.find((s) => s.id === stageId);

      if (current?.status === "running") {
        // Already running — this is a tool call / sub-action
        updateStage(stageId, (s) => ({
          ...s,
          actions: [...s.actions, msg].slice(-6),
        }));
      } else {
        // New stage start
        let detail = msg;
        if (stageId === "agent") {
          // Show which runtime was picked
          const lower = msg.toLowerCase();
          if (lower.includes("claude")) detail = "Claude Code (auto-detected)";
          else if (lower.includes("codex")) detail = "Codex (auto-detected)";
          else if (lower.includes("gemini")) detail = "Gemini (auto-detected)";
          else if (lower.includes("agentic") || lower.includes("api")) detail = "API agent (OpenRouter)";
        }
        updateStage(stageId, (s) => ({ ...s, status: "running", detail }));
      }
      return;
    }

    if (event.type === "stage:end") {
      if (!stageId) return;
      // Truncate long detail text and clean up
      let detail = msg.length > 60 ? msg.slice(0, 60) + "..." : msg;
      updateStage(stageId, (s) => ({
        ...s,
        status: "done",
        detail,
        actions: s.actions.slice(0, 4), // keep max 4 actions after completion
        duration: (event.data as any)?.durationMs ?? s.duration,
      }));
      return;
    }

    if (event.type === "finding") {
      const running = stages.find((s) => s.status === "running") ?? stages.find((s) => s.id === "ai-agent" || s.id === "attack");
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
