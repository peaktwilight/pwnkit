import { execSync } from "node:child_process";
import type { SemgrepFinding, NpmAuditFinding, Severity } from "@pwnkit/shared";
import type { ScanListener } from "./scanner.js";
import type { PrepareResult } from "./prepare.js";
import { bufferToString, runSemgrepScan } from "./shared-analysis.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StaticAnalysisResult {
  semgrepFindings: SemgrepFinding[];
  npmAuditFindings: NpmAuditFinding[];
}

// ---------------------------------------------------------------------------
// npm audit (extracted from audit.ts)
// ---------------------------------------------------------------------------

function runNpmAudit(
  projectDir: string,
  emit: ScanListener,
): NpmAuditFinding[] {
  emit({
    type: "stage:start",
    stage: "discovery",
    message: "Running npm audit...",
  });

  let rawOutput = "";

  try {
    rawOutput = execSync("npm audit --json", {
      cwd: projectDir,
      timeout: 120_000,
      stdio: "pipe",
    }).toString("utf-8");
  } catch (err) {
    const stdout =
      err && typeof err === "object" && "stdout" in err
        ? (err.stdout as Buffer | string | undefined)
        : undefined;
    const stderr =
      err && typeof err === "object" && "stderr" in err
        ? (err.stderr as Buffer | string | undefined)
        : undefined;

    rawOutput = bufferToString(stdout) || bufferToString(stderr) || "";
  }

  const findings = parseNpmAuditOutput(rawOutput);

  emit({
    type: "stage:end",
    stage: "discovery",
    message: `npm audit: ${findings.length} advisories`,
  });

  return findings;
}

function parseNpmAuditOutput(rawOutput: string): NpmAuditFinding[] {
  if (!rawOutput.trim()) {
    return [];
  }

  try {
    const raw = JSON.parse(rawOutput) as {
      vulnerabilities?: Record<
        string,
        {
          name?: string;
          severity?: string;
          via?: Array<string | Record<string, unknown>>;
          range?: string;
          fixAvailable?: boolean | { name?: string; version?: string } | string;
        }
      >;
    };

    return Object.entries(raw.vulnerabilities ?? {}).map(([pkgName, vuln]) => {
      const via = (vuln.via ?? []).map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }

        const source =
          typeof entry.source === "number" ? `GHSA:${entry.source}` : null;
        const title = typeof entry.title === "string" ? entry.title : null;
        const name = typeof entry.name === "string" ? entry.name : null;

        return (
          [name, title, source].filter(Boolean).join(" - ") ||
          "unknown advisory"
        );
      });

      const firstObjectVia = (vuln.via ?? []).find(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null,
      );

      return {
        name: vuln.name ?? pkgName,
        severity: normalizeSeverity(vuln.severity),
        title:
          (typeof firstObjectVia?.title === "string" && firstObjectVia.title) ||
          via[0] ||
          "npm audit advisory",
        range: vuln.range,
        source:
          typeof firstObjectVia?.source === "number" ||
          typeof firstObjectVia?.source === "string"
            ? (firstObjectVia.source as number | string)
            : undefined,
        url:
          typeof firstObjectVia?.url === "string"
            ? firstObjectVia.url
            : undefined,
        via,
        fixAvailable: formatFixAvailable(vuln.fixAvailable),
      };
    });
  } catch {
    return [];
  }
}

function normalizeSeverity(value: string | undefined): Severity {
  switch ((value ?? "").toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "moderate":
    case "medium":
      return "medium";
    case "low":
      return "low";
    default:
      return "info";
  }
}

function formatFixAvailable(
  fixAvailable:
    | boolean
    | { name?: string; version?: string }
    | string
    | undefined,
): boolean | string {
  if (typeof fixAvailable === "string" || typeof fixAvailable === "boolean") {
    return fixAvailable;
  }

  if (fixAvailable && typeof fixAvailable === "object") {
    const next = [fixAvailable.name, fixAvailable.version]
      .filter(Boolean)
      .join("@");
    return next || true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run static analysis tools against a prepared target.
 *
 * - npm-package: semgrep + npm audit
 * - source-code: semgrep only
 * - url / web-app: skip (return empty results)
 */
export async function runStaticAnalysis(
  prepared: PrepareResult,
  emit: ScanListener,
): Promise<StaticAnalysisResult> {
  switch (prepared.targetType) {
    case "npm-package": {
      const semgrepFindings = runSemgrepScan(prepared.resolvedTarget, emit, {
        noGitIgnore: true,
      });
      const npmAuditFindings = prepared.packageInfo
        ? runNpmAudit(prepared.packageInfo.tempDir, emit)
        : [];
      return { semgrepFindings, npmAuditFindings };
    }

    case "source-code": {
      const semgrepFindings = runSemgrepScan(prepared.resolvedTarget, emit);
      return { semgrepFindings, npmAuditFindings: [] };
    }

    case "url":
    case "web-app": {
      return { semgrepFindings: [], npmAuditFindings: [] };
    }

    default: {
      const _exhaustive: never = prepared.targetType;
      throw new Error(`Unknown target type: ${_exhaustive}`);
    }
  }
}
