import React, { useState, useCallback } from "react";
import { Box, Text, Static, Newline } from "ink";
import Spinner from "ink-spinner";

// ── Types ──

export type StageName =
  | "install"
  | "npm-audit"
  | "semgrep"
  | "ai-agent"
  | "verify"
  | "report";

export type StageStatusKind = "pending" | "running" | "done" | "error";

export interface StageFinding {
  severity: string;
  title: string;
}

export interface StageState {
  name: StageName;
  label: string;
  status: StageStatusKind;
  detail?: string;
  duration?: number;
  actions?: string[];
  findings?: StageFinding[];
  error?: string;
}

export interface ScanEvent {
  type:
    | "stage:start"
    | "stage:end"
    | "stage:error"
    | "action"
    | "finding"
    | "summary";
  stage?: StageName;
  message?: string;
  data?: Record<string, unknown>;
}

export interface ScanSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info?: number;
  duration?: number;
  shareUrl?: string;
}

interface ScanUIProps {
  version: string;
  stages: StageState[];
  summary: ScanSummary | null;
}

// ── Helpers ──

const CRIMSON = "#DC2626";
const GREEN = "#22C55E";
const GRAY = "#6B7280";
const YELLOW = "#EAB308";
const CYAN = "#06B6D4";
const WHITE = "#F9FAFB";
const DIM_WHITE = "#9CA3AF";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function severityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return CRIMSON;
    case "high":
      return CRIMSON;
    case "medium":
      return YELLOW;
    case "low":
      return CYAN;
    default:
      return GRAY;
  }
}

// ── Stage Row ──

function StageRow({ stage }: { stage: StageState }) {
  const icon =
    stage.status === "done" ? (
      <Text color={GREEN}>{"✓"}</Text>
    ) : stage.status === "running" ? (
      <Text color={CRIMSON}>
        <Spinner type="dots" />
      </Text>
    ) : stage.status === "error" ? (
      <Text color={CRIMSON}>{"✗"}</Text>
    ) : (
      <Text color={GRAY}>{"◌"}</Text>
    );

  const nameColor =
    stage.status === "pending"
      ? GRAY
      : stage.status === "error"
        ? CRIMSON
        : WHITE;

  const detailColor =
    stage.status === "done" ? DIM_WHITE : stage.status === "error" ? CRIMSON : GRAY;

  return (
    <Box flexDirection="column">
      <Box>
        <Text>{"  "}</Text>
        {icon}
        <Text> </Text>
        <Text color={nameColor} bold={stage.status === "running"}>
          {stage.label.padEnd(16)}
        </Text>
        {stage.detail && (
          <Text color={detailColor}>
            {stage.detail.padEnd(34)}
          </Text>
        )}
        {stage.duration !== undefined && (
          <Text color={GRAY}>{formatDuration(stage.duration).padStart(8)}</Text>
        )}
      </Box>

      {/* Live actions for running stage */}
      {stage.status === "running" &&
        stage.actions &&
        stage.actions.length > 0 && (
          <Box flexDirection="column" marginLeft={4}>
            {stage.actions.map((action, i) => (
              <Text key={i} color={CYAN}>
                {"  \u2192 "}
                {action}
              </Text>
            ))}
          </Box>
        )}

      {/* Inline findings */}
      {stage.findings &&
        stage.findings.length > 0 && (
          <Box flexDirection="column" marginLeft={4}>
            {stage.findings.map((f, i) => (
              <Text key={i} color={severityColor(f.severity)}>
                {"  \u26A1 "}
                <Text bold>[{f.severity}]</Text>
                {" "}
                {f.title}
              </Text>
            ))}
          </Box>
        )}
    </Box>
  );
}

// ── Summary Bar ──

function SummaryBar({ summary }: { summary: ScanSummary }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={GRAY}>{"  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"}</Text>
      <Box marginLeft={2} gap={2}>
        <Text color={summary.critical > 0 ? CRIMSON : GRAY} bold={summary.critical > 0}>
          {summary.critical} critical
        </Text>
        <Text color={summary.high > 0 ? CRIMSON : GRAY} bold={summary.high > 0}>
          {summary.high} high
        </Text>
        <Text color={summary.medium > 0 ? YELLOW : GRAY} bold={summary.medium > 0}>
          {summary.medium} medium
        </Text>
        <Text color={summary.low > 0 ? CYAN : GRAY} bold={summary.low > 0}>
          {summary.low} low
        </Text>
      </Box>
      {summary.shareUrl && (
        <Box marginTop={1} marginLeft={2}>
          <Text color={GRAY}>Share: </Text>
          <Text color={CYAN}>{summary.shareUrl}</Text>
        </Box>
      )}
      <Text>{""}</Text>
    </Box>
  );
}

// ── Main Component ──

export function ScanUI({ version, stages, summary }: ScanUIProps) {
  return (
    <Box flexDirection="column">
      {/* All stages in order */}
      {stages.map((stage) => (
        <StageRow key={stage.name} stage={stage} />
      ))}

      {/* Summary bar */}
      {summary && <SummaryBar summary={summary} />}
    </Box>
  );
}

// ── Stateful wrapper with event dispatch ──

const DEFAULT_STAGES: Array<{ name: StageName; label: string }> = [
  { name: "install", label: "Install" },
  { name: "npm-audit", label: "npm audit" },
  { name: "semgrep", label: "Semgrep" },
  { name: "ai-agent", label: "AI Agent" },
  { name: "verify", label: "Verify" },
  { name: "report", label: "Report" },
];

export function ScanUIApp({ version }: { version: string }) {
  const [stages, setStages] = useState<StageState[]>(
    DEFAULT_STAGES.map((s) => ({
      ...s,
      status: "pending" as StageStatusKind,
    }))
  );
  const [summary, setSummary] = useState<ScanSummary | null>(null);

  const handleEvent = useCallback((event: ScanEvent) => {
    switch (event.type) {
      case "stage:start":
        setStages((prev) =>
          prev.map((s) =>
            s.name === event.stage
              ? {
                  ...s,
                  status: "running" as StageStatusKind,
                  detail: event.message,
                  actions: [],
                  findings: [],
                }
              : s
          )
        );
        break;

      case "stage:end":
        setStages((prev) =>
          prev.map((s) =>
            s.name === event.stage
              ? {
                  ...s,
                  status: "done" as StageStatusKind,
                  detail: event.message ?? s.detail,
                  duration:
                    (event.data?.durationMs as number | undefined) ?? s.duration,
                }
              : s
          )
        );
        break;

      case "stage:error":
        setStages((prev) =>
          prev.map((s) =>
            s.name === event.stage
              ? {
                  ...s,
                  status: "error" as StageStatusKind,
                  detail: event.message ?? s.detail,
                  error: event.message,
                }
              : s
          )
        );
        break;

      case "action":
        setStages((prev) =>
          prev.map((s) =>
            s.name === event.stage && s.status === "running"
              ? {
                  ...s,
                  actions: [...(s.actions ?? []), event.message ?? ""].slice(-5),
                }
              : s
          )
        );
        break;

      case "finding":
        setStages((prev) =>
          prev.map((s) =>
            s.name === event.stage
              ? {
                  ...s,
                  findings: [
                    ...(s.findings ?? []),
                    {
                      severity: (event.data?.severity as string) ?? "medium",
                      title: event.message ?? "Unknown finding",
                    },
                  ],
                }
              : s
          )
        );
        break;

      case "summary":
        setSummary(event.data as unknown as ScanSummary);
        break;
    }
  }, []);

  // Expose the handler via a ref-like pattern (accessed through renderScan)
  (ScanUIApp as unknown as Record<string, unknown>).__handler = handleEvent;
  (ScanUIApp as unknown as Record<string, unknown>).__setSummary = setSummary;

  return <ScanUI version={version} stages={stages} summary={summary} />;
}
