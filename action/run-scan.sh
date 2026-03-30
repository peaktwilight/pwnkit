#!/usr/bin/env bash
set -euo pipefail

TARGET="${INPUT_TARGET:-}"
DEPTH="${INPUT_DEPTH:-default}"
RUNTIME="${INPUT_RUNTIME:-api}"
MODE="${INPUT_MODE:-probe}"
REPO_PATH="${INPUT_REPO_PATH:-}"
TIMEOUT="${INPUT_TIMEOUT:-30000}"
FAIL_ON="${INPUT_FAIL_ON_SEVERITY:-high}"
REPORT_DIR="${INPUT_REPORT_DIR:-pwnkit-report}"

if [[ -z "$TARGET" ]]; then
  echo "::error::Missing required input: target"
  exit 1
fi

case "$DEPTH" in
  quick|default|deep) ;;
  *)
    echo "::error::Invalid depth '$DEPTH'. Expected one of: quick, default, deep"
    exit 1
    ;;
esac

case "$RUNTIME" in
  api|claude|codex|gemini|opencode|auto) ;;
  *)
    echo "::error::Invalid runtime '$RUNTIME'. Expected one of: api, claude, codex, gemini, opencode, auto"
    exit 1
    ;;
esac

case "$MODE" in
  probe|deep|mcp|web) ;;
  *)
    echo "::error::Invalid mode '$MODE'. Expected one of: probe, deep, mcp, web"
    exit 1
    ;;
esac

if [[ ! "$TIMEOUT" =~ ^[0-9]+$ ]]; then
  echo "::error::Invalid timeout '$TIMEOUT'. Expected an integer number of milliseconds"
  exit 1
fi

if [[ -n "$REPO_PATH" && ! -d "$REPO_PATH" ]]; then
  echo "::error::Invalid repo-path '$REPO_PATH'. Directory does not exist"
  exit 1
fi

case "$FAIL_ON" in
  critical|high|medium|low|info|none) ;;
  *)
    echo "::error::Invalid fail-on-severity '$FAIL_ON'. Expected one of: critical, high, medium, low, info, none"
    exit 1
    ;;
esac

mkdir -p "$REPORT_DIR"
JSON_REPORT="$REPORT_DIR/report.json"
SARIF_REPORT="$REPORT_DIR/report.sarif"

SCAN_ARGS=(
  scan
  --target "$TARGET"
  --depth "$DEPTH"
  --format json
  --runtime "$RUNTIME"
  --mode "$MODE"
  --timeout "$TIMEOUT"
)

if [[ -n "$REPO_PATH" ]]; then
  SCAN_ARGS+=(--repo "$REPO_PATH")
fi

set +e
pwnkit-cli "${SCAN_ARGS[@]}" > "$JSON_REPORT"
SCAN_EXIT=$?
set -e

if [[ $SCAN_EXIT -eq 2 ]]; then
  echo "::error::pwnkit-cli scan failed to execute."
  exit 2
fi

if [[ ! -s "$JSON_REPORT" ]]; then
  echo "::error::pwnkit-cli scan did not produce a JSON report."
  exit 1
fi

node - "$JSON_REPORT" "$SARIF_REPORT" "$FAIL_ON" <<'NODE'
const fs = require("fs");
const path = require("path");

const [jsonReportPath, sarifReportPath, failOn] = process.argv.slice(2);

function severityToSarifLevel(severity) {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
    case "info":
    default:
      return "note";
  }
}

const severityOrder = ["info", "low", "medium", "high", "critical"];
const threshold = severityOrder.indexOf(failOn);

const report = JSON.parse(fs.readFileSync(jsonReportPath, "utf8"));
const findings = Array.isArray(report.findings) ? report.findings : [];

const rulesById = new Map();
for (const finding of findings) {
  const ruleId = finding.templateId || finding.id || "pwnkit-finding";
  if (!rulesById.has(ruleId)) {
    rulesById.set(ruleId, {
      id: ruleId,
      name: finding.title || ruleId,
      shortDescription: {
        text: finding.title || "pwnkit finding",
      },
      fullDescription: {
        text: finding.description || "pwnkit detected a potential security issue.",
      },
      properties: {
        category: finding.category || "unknown",
        severity: finding.severity || "info",
      },
    });
  }
}

const results = findings.map((finding) => {
  const ruleId = finding.templateId || finding.id || "pwnkit-finding";
  const level = severityToSarifLevel(finding.severity);
  const parts = [finding.description, finding.evidence?.analysis].filter(Boolean);

  return {
    ruleId,
    level,
    message: {
      text: parts.length > 0 ? parts.join("\n\n") : (finding.title || "pwnkit finding"),
    },
    properties: {
      severity: finding.severity || "info",
      category: finding.category || "unknown",
      templateId: finding.templateId || null,
      findingId: finding.id || null,
      target: report.target || null,
    },
  };
});

const sarif = {
  $schema: "https://json.schemastore.org/sarif-2.1.0.json",
  version: "2.1.0",
  runs: [
    {
      tool: {
        driver: {
          name: "pwnkit",
          informationUri: "https://github.com/peaktwilight/pwnkit",
          rules: Array.from(rulesById.values()),
        },
      },
      automationDetails: {
        id: `pwnkit/${report.scanDepth || "default"}`,
      },
      properties: {
        target: report.target || null,
        startedAt: report.startedAt || null,
        completedAt: report.completedAt || null,
      },
      results,
    },
  ],
};

fs.writeFileSync(sarifReportPath, JSON.stringify(sarif, null, 2));

const summary = report.summary || {};
const counts = {
  critical: Number(summary.critical || 0),
  high: Number(summary.high || 0),
  medium: Number(summary.medium || 0),
  low: Number(summary.low || 0),
  info: Number(summary.info || 0),
};

let shouldFail = false;
if (failOn !== "none") {
  for (const [severity, count] of Object.entries(counts)) {
    if (count > 0 && severityOrder.indexOf(severity) >= threshold) {
      shouldFail = true;
      break;
    }
  }
}

const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput) {
  fs.appendFileSync(githubOutput, `json-report-file=${path.resolve(jsonReportPath)}\n`);
  fs.appendFileSync(githubOutput, `sarif-report-file=${path.resolve(sarifReportPath)}\n`);
  fs.appendFileSync(githubOutput, `total-findings=${Number(summary.totalFindings || findings.length)}\n`);
}

if (shouldFail) {
  console.error(
    `pwnkit-cli findings met fail-on-severity='${failOn}'. Summary: ` +
      JSON.stringify(counts)
  );
  process.exit(3);
}
NODE
