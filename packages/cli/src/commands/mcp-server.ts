import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { sendPrompt, extractResponseText } from "@pwnkit/core";
import { pwnkitDB } from "@pwnkit/db";
import type { Finding, TargetInfo } from "@pwnkit/shared";
import { z } from "zod";

type McpServerOptions = {
  target: string;
  scanId: string;
  dbPath?: string;
  timeout?: string;
};

function parseJsonArray(value: string | undefined): string[] | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : undefined;
  } catch {
    return undefined;
  }
}

function toTextResult(text: string, structuredContent?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

async function sendPromptWithOptionalSystemContext(
  target: string,
  prompt: string,
  systemContext: string | undefined,
  timeoutMs: number,
) {
  if (!systemContext?.trim()) {
    return sendPrompt(target, prompt, { timeout: timeoutMs });
  }

  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemContext },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    const body = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      status: response.status,
      body,
      headers,
      latencyMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function registerMcpServerCommand(program: Command): void {
  program
    .command("mcp-server")
    .description("Run pwnkit's MCP stdio server for live target interaction tools")
    .requiredOption("--target <target>", "Target URL for this MCP session")
    .requiredOption("--scan-id <scanId>", "Scan ID to associate persisted findings and target updates with")
    .option("--db-path <path>", "Path to SQLite database")
    .option("--timeout <ms>", "Default tool timeout in milliseconds", "30000")
    .action(async (opts: McpServerOptions) => {
      const timeoutMs = Math.max(1_000, parseInt(opts.timeout ?? "30000", 10));
      const target = opts.target.trim();
      const scanId = opts.scanId.trim();
      const db = new pwnkitDB(opts.dbPath);

      const server = new McpServer(
        { name: "pwnkit-mcp", version: "0.1.0" },
        { capabilities: { logging: {} } },
      );

      server.registerTool(
        "send_prompt",
        {
          title: "Send Prompt",
          description: "Send a prompt to the configured target endpoint and return the parsed response.",
          inputSchema: z.object({
            prompt: z.string().min(1).describe("Prompt to send to the target"),
            system_context: z.string().optional().describe("Optional system context to include ahead of the user prompt"),
          }),
        },
        async ({ prompt, system_context }) => {
          const result = await sendPromptWithOptionalSystemContext(target, prompt, system_context, timeoutMs);
          const responseText = extractResponseText(result.body);
          return toTextResult(responseText, {
            status: result.status,
            body: result.body,
            responseText,
            headers: result.headers,
            latencyMs: result.latencyMs,
            target,
          });
        },
      );

      server.registerTool(
        "http_request",
        {
          title: "HTTP Request",
          description: "Send an HTTP request to a URL and return the response.",
          inputSchema: z.object({
            url: z.string().url().describe("Target URL"),
            method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional().describe("HTTP method"),
            body: z.string().optional().describe("Request body"),
            headers: z.record(z.string()).optional().describe("Additional headers"),
          }),
        },
        async ({ url, method, body, headers }) => {
          const start = Date.now();
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);

          try {
            const response = await fetch(url, {
              method: method ?? "GET",
              headers,
              body: body ?? undefined,
              signal: controller.signal,
            });
            const responseBody = await response.text();
            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((value, key) => {
              responseHeaders[key] = value;
            });

            return toTextResult(responseBody, {
              url,
              method: method ?? "GET",
              status: response.status,
              headers: responseHeaders,
              body: responseBody,
              latencyMs: Date.now() - start,
            });
          } finally {
            clearTimeout(timer);
          }
        },
      );

      server.registerTool(
        "update_target",
        {
          title: "Update Target",
          description: "Persist discovered target metadata into the pwnkit database.",
          inputSchema: z.object({
            type: z.enum(["api", "chatbot", "agent", "mcp", "web-app", "unknown"]).optional(),
            model: z.string().optional(),
            system_prompt: z.string().optional(),
            endpoints: z.string().optional().describe("JSON array of discovered endpoints"),
            features: z.string().optional().describe("JSON array of detected features"),
          }),
        },
        async ({ type, model, system_prompt, endpoints, features }) => {
          const targetInfo: TargetInfo = {
            url: target,
            type: type ?? "unknown",
            model: model?.trim() || undefined,
            systemPrompt: system_prompt?.trim() || undefined,
            endpoints: parseJsonArray(endpoints),
            detectedFeatures: parseJsonArray(features),
          };

          db.upsertTarget(targetInfo);

          return toTextResult(`Updated target profile for ${target}.`, {
            target,
            targetInfo,
          });
        },
      );

      server.registerTool(
        "save_finding",
        {
          title: "Save Finding",
          description: "Persist a security finding for the configured scan.",
          inputSchema: z.object({
            title: z.string(),
            description: z.string().optional(),
            severity: z.enum(["critical", "high", "medium", "low", "info"]),
            category: z.string(),
            template_id: z.string().optional(),
            evidence_request: z.string(),
            evidence_response: z.string(),
            evidence_analysis: z.string().optional(),
          }),
        },
        async ({ title, description, severity, category, template_id, evidence_request, evidence_response, evidence_analysis }) => {
          const finding: Finding = {
            id: randomUUID(),
            templateId: template_id?.trim() || "mcp-server",
            title,
            description: description ?? "",
            severity,
            category: category as Finding["category"],
            status: "discovered",
            evidence: {
              request: evidence_request,
              response: evidence_response,
              analysis: evidence_analysis,
            },
            timestamp: Date.now(),
          };

          db.saveFinding(scanId, finding);

          return toTextResult(`Saved finding ${finding.title}.`, {
            findingId: finding.id,
            title: finding.title,
            severity: finding.severity,
            category: finding.category,
            scanId,
          });
        },
      );

      server.registerTool(
        "query_findings",
        {
          title: "Query Findings",
          description: "Query findings from the pwnkit database.",
          inputSchema: z.object({
            severity: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
            category: z.string().optional(),
            status: z.string().optional(),
            limit: z.number().int().positive().max(100).optional(),
          }),
        },
        async ({ severity, category, status, limit }) => {
          const findings = db.queryFindings({
            severity,
            category,
            status,
            limit: limit ?? 20,
          });

          return toTextResult(`Returned ${findings.length} findings.`, {
            findings,
            count: findings.length,
          });
        },
      );

      server.registerTool(
        "update_finding",
        {
          title: "Update Finding",
          description: "Update the status of an existing finding.",
          inputSchema: z.object({
            finding_id: z.string(),
            status: z.enum(["discovered", "confirmed", "false-positive"]),
          }),
        },
        async ({ finding_id, status }) => {
          db.updateFindingStatus(finding_id, status);
          return toTextResult(`Updated finding ${finding_id} to ${status}.`, {
            findingId: finding_id,
            status,
          });
        },
      );

      const transport = new StdioServerTransport();

      process.on("SIGINT", async () => {
        await server.close();
        db.close();
        process.exit(0);
      });

      process.on("SIGTERM", async () => {
        await server.close();
        db.close();
        process.exit(0);
      });

      try {
        await server.connect(transport);
        console.error(`pwnkit MCP server running for ${target} (scan ${scanId})`);
      } catch (error) {
        console.error("Fatal error in pwnkit MCP server:", error);
        db.close();
        process.exit(1);
      }
    });
}
