import { randomUUID } from "node:crypto";
import type { Finding, Severity } from "@pwnkit/shared";

export interface ParseFindingsOptions {
  /** Prefix for templateId, e.g. "cli-audit" or "cli-review" */
  templatePrefix?: string;
}

/**
 * Parse structured ---FINDING--- blocks from CLI agent output.
 * Falls back to creating a single prose finding if no blocks are found
 * but the output looks like it contains security content.
 */
export function parseFindingsFromCliOutput(
  output: string,
  opts?: ParseFindingsOptions,
): Finding[] {
  const prefix = opts?.templatePrefix ?? "cli";
  const findings: Finding[] = [];
  const blocks = output.split("---FINDING---").slice(1);

  if (blocks.length === 0) {
    // No structured findings — check if the output mentions no vulnerabilities
    const lower = output.toLowerCase();
    if (
      lower.includes("no vulnerabilit") ||
      lower.includes("no security issue") ||
      lower.includes("no findings") ||
      lower.includes("looks secure") ||
      lower.includes("no real") ||
      output.trim().length === 0
    ) {
      return [];
    }
    // Agent wrote prose findings — extract a meaningful title
    if (output.trim().length > 50) {
      const lines = output.trim().split("\n").filter((l) => l.trim().length > 10);
      // Skip generic intro lines, find the first substantive title
      let title = "Security finding from AI analysis";
      for (const line of lines) {
        const clean = line.replace(/^#+\s*/, "").replace(/^\*+\s*/, "").replace(/\*+$/, "").trim();
        if (clean.length < 10) continue;
        if (clean.toLowerCase().startsWith("based on")) continue;
        if (clean.toLowerCase().startsWith("i've")) continue;
        if (clean.toLowerCase().startsWith("here is")) continue;
        if (clean.toLowerCase().startsWith("here's")) continue;
        if (clean.toLowerCase().startsWith("the package")) continue;
        if (clean.toLowerCase().startsWith("audit")) continue;
        title = clean.slice(0, 80);
        break;
      }
      findings.push({
        id: randomUUID(),
        templateId: `${prefix}-${Date.now()}`,
        title,
        description: output.trim().slice(0, 2000),
        severity: "info" as Severity,
        category: "other" as Finding["category"],
        status: "discovered",
        evidence: {
          request: "Automated AI source code analysis",
          response: output.trim().slice(0, 2000),
          analysis:
            "Found by CLI agent during automated analysis. Review the full output for details.",
        },
        confidence: undefined,
        timestamp: Date.now(),
      });
    }
    return findings;
  }

  for (const block of blocks) {
    const endIdx = block.indexOf("---END---");
    const content = endIdx >= 0 ? block.slice(0, endIdx) : block;

    const title = content.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? "Untitled finding";
    const severity = content.match(/^severity:\s*(.+)$/m)?.[1]?.trim()?.toLowerCase() ?? "info";
    const category = content.match(/^category:\s*(.+)$/m)?.[1]?.trim() ?? "other";
    const description =
      content.match(/^description:\s*([\s\S]*?)(?=^(?:file|---)|$)/m)?.[1]?.trim() ?? "";
    const file = content.match(/^file:\s*(.+)$/m)?.[1]?.trim() ?? "";

    const validSeverities = new Set(["critical", "high", "medium", "low", "info"]);
    const normalizedSeverity = validSeverities.has(severity) ? (severity as Severity) : "info";

    findings.push({
      id: randomUUID(),
      templateId: `${prefix}-${Date.now()}`,
      title,
      description,
      severity: normalizedSeverity,
      category: category as Finding["category"],
      status: "discovered",
      evidence: {
        request: `Analysis of source at ${file}`,
        response: description,
        analysis: `Found by CLI agent during automated analysis`,
      },
      confidence: undefined,
      timestamp: Date.now(),
    });
  }

  return findings;
}
