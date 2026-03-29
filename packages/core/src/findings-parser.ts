import { randomUUID } from "node:crypto";
import type { Finding, Severity } from "@pwnkit/shared";

export interface ParseFindingsOptions {
  templatePrefix?: string;
}

const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);

/**
 * Parse findings from CLI agent output.
 *
 * Tries two strategies:
 * 1. JSON structured output (from --json-schema / --output-schema)
 * 2. Structured ---FINDING--- / ---END--- blocks
 *
 * Returns empty array if no structured findings found.
 * Never manufactures findings from unstructured prose.
 */
export function parseFindingsFromCliOutput(
  output: string,
  opts?: ParseFindingsOptions,
): Finding[] {
  const prefix = opts?.templatePrefix ?? "cli";

  // Strategy 1: JSON structured output
  const jsonFindings = parseJsonOutput(output, prefix);
  if (jsonFindings.length > 0) return jsonFindings;

  // Strategy 2: ---FINDING--- blocks
  const structured = parseStructuredBlocks(output, prefix);
  if (structured.length > 0) return structured;

  return [];
}

/** Parse JSON structured output (from --json-schema / --output-schema). */
function parseJsonOutput(output: string, prefix: string): Finding[] {
  try {
    const parsed = JSON.parse(output.trim());
    if (parsed.findings && Array.isArray(parsed.findings)) {
      return parsed.findings
        .filter((f: any) => f.title && f.severity)
        .map((f: any) => ({
          id: randomUUID(),
          templateId: `${prefix}-${Date.now()}`,
          title: f.title,
          description: f.description ?? "",
          severity: (VALID_SEVERITIES.has(f.severity) ? f.severity : "info") as Severity,
          category: (f.category ?? "other") as Finding["category"],
          status: "discovered" as const,
          evidence: {
            request: f.file ?? "",
            response: f.poc ?? "",
            analysis: f.description ?? "",
          },
          confidence: undefined,
          timestamp: Date.now(),
        }));
    }
  } catch {
    // Not valid JSON
  }
  return [];
}

/** Parse ---FINDING--- / ---END--- delimited blocks. */
function parseStructuredBlocks(output: string, prefix: string): Finding[] {
  const blocks = output.split("---FINDING---").slice(1);
  if (blocks.length === 0) return [];

  return blocks.map((block) => {
    const endIdx = block.indexOf("---END---");
    const content = endIdx >= 0 ? block.slice(0, endIdx) : block;

    const title = content.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? "Security finding";
    const severity = content.match(/^severity:\s*(.+)$/m)?.[1]?.trim()?.toLowerCase() ?? "info";
    const category = content.match(/^category:\s*(.+)$/m)?.[1]?.trim() ?? "other";
    const description = content.match(/^description:\s*([\s\S]*?)(?=^(?:file|---)|$)/m)?.[1]?.trim() ?? "";
    const file = content.match(/^file:\s*(.+)$/m)?.[1]?.trim() ?? "";

    return {
      id: randomUUID(),
      templateId: `${prefix}-${Date.now()}`,
      title,
      description,
      severity: (VALID_SEVERITIES.has(severity) ? severity : "info") as Severity,
      category: category as Finding["category"],
      status: "discovered" as const,
      evidence: {
        request: file || "Automated AI analysis",
        response: description,
        analysis: `Found by ${prefix} agent`,
      },
      confidence: undefined,
      timestamp: Date.now(),
    };
  });
}
