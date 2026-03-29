import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

// ── Types ──

export type StageStatusKind = "pending" | "running" | "done" | "error";

export interface StageFinding {
  severity: string;
  title: string;
}

export interface StageState {
  id: string;
  label: string;
  status: StageStatusKind;
  detail?: string;
  duration?: number;
  actions: string[];
  findings: StageFinding[];
  error?: string;
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

export interface ScanEvent {
  type: string;
  stage?: string;
  message: string;
  data?: unknown;
}

export interface ScanUIProps {
  stages: StageState[];
  summary: ScanSummary | null;
  thinking: string | null;
}

// ── Colors ──

const CRIMSON = "#DC2626";
const GREEN = "#22C55E";
const GRAY = "#6B7280";
const YELLOW = "#EAB308";
const CYAN = "#06B6D4";

function severityColor(s: string): string {
  switch (s.toLowerCase()) {
    case "critical": case "high": return CRIMSON;
    case "medium": return YELLOW;
    case "low": return CYAN;
    default: return GRAY;
  }
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ── Stage Row ──

function StageRow({ stage }: { stage: StageState }) {
  const icon =
    stage.status === "done" ? (
      <Text color={GREEN}>{"✓"}</Text>
    ) : stage.status === "running" ? (
      <Text color={CRIMSON}><Spinner type="dots" /></Text>
    ) : stage.status === "error" ? (
      <Text color={CRIMSON}>{"✗"}</Text>
    ) : (
      <Text color={GRAY}>{"◌"}</Text>
    );

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text>{"  "}</Text>
        {icon}
        <Text bold color={stage.status === "pending" ? GRAY : undefined}>
          {stage.label.padEnd(12)}
        </Text>
        {stage.detail && (
          <Text color={stage.status === "done" ? GRAY : undefined} dimColor={stage.status === "done"}>
            {stage.detail}
          </Text>
        )}
        {stage.duration !== undefined && (
          <Text color={GRAY}> {formatDuration(stage.duration)}</Text>
        )}
      </Box>

      {/* Tool call actions — visible during and after execution */}
      {stage.actions.length > 0 && (
        <Box flexDirection="column" marginLeft={6}>
          {stage.actions.map((action, i) => (
            <Text key={i} color={stage.status === "done" ? GRAY : CYAN} dimColor={stage.status === "done"}>
              {"→ "}{action}
            </Text>
          ))}
        </Box>
      )}

      {/* Thinking text */}
      {stage.status === "running" && stage.actions.length === 0 && stage.detail && (
        <Box marginLeft={6}><Text color={GRAY} dimColor>{""}</Text></Box>
      )}

      {/* Findings */}
      {stage.findings.length > 0 && (
        <Box flexDirection="column" marginLeft={6}>
          {stage.findings.map((f, i) => (
            <Text key={i} color={severityColor(f.severity)}>
              {"⚡ "}<Text bold>[{f.severity}]</Text> {f.title}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── Summary ──

function SummaryBar({ summary }: { summary: ScanSummary }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={GRAY}>{"  ──────────────────────────────────────"}</Text>
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
        <Text color={GRAY}>{summary.low} low</Text>
      </Box>
      {summary.duration !== undefined && (
        <Box marginLeft={2}>
          <Text color={GRAY}>{formatDuration(summary.duration)}</Text>
        </Box>
      )}
      {summary.shareUrl && (
        <Box marginTop={1} marginLeft={2}>
          <Text color={GRAY}>Share: </Text>
          <Text color={CYAN}>{summary.shareUrl}</Text>
        </Box>
      )}
    </Box>
  );
}

// ── Banner with animated fang character ──

function Banner({ target, mode }: { target: string; mode: string }) {
  // Fang character in ASCII — the pwnkit mascot
  const fang = [
    "   ╱▔▔╲   ",
    "  ╱ ◉◉ ╲  ",
    " ╱ ╲▁▁╱ ╲ ",
    " ╲ ╱  ╲ ╱ ",
    "  ▔    ▔  ",
  ];

  return (
    <Box flexDirection="row" marginBottom={1}>
      <Box flexDirection="column" marginRight={2}>
        {fang.map((line, i) => (
          <Text key={i} color={CRIMSON}>{line}</Text>
        ))}
      </Box>
      <Box flexDirection="column" justifyContent="center">
        <Text color={CRIMSON} bold>pwnkit</Text>
        <Text color={GRAY}>{mode} {target}</Text>
        <Text color={GRAY} dimColor>Apache 2.0 — pwnkit.com</Text>
      </Box>
    </Box>
  );
}

// ── Main ──

export function ScanUI({ stages, summary, thinking, target, mode }: ScanUIProps & { target?: string; mode?: string }) {
  return (
    <Box flexDirection="column">
      <Banner target={target ?? ""} mode={mode ?? ""} />
      {stages.map((stage) => (
        <StageRow key={stage.id} stage={stage} />
      ))}
      {thinking && (
        <Box marginLeft={6}>
          <Text color={GRAY} dimColor wrap="truncate">{thinking.slice(-80)}</Text>
        </Box>
      )}
      {summary && <SummaryBar summary={summary} />}
    </Box>
  );
}
