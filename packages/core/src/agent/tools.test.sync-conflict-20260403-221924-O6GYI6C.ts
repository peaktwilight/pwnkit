import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ToolExecutor, getToolsForRole, TOOL_DEFINITIONS } from "./tools.js";
import type { ToolContext, ToolCall } from "./types.js";

// ── Tool Registry ──

describe("TOOL_DEFINITIONS", () => {
  it("defines all expected tools", () => {
    const expected = [
      "http_request", "send_prompt", "save_finding", "query_findings",
      "update_finding", "read_file", "run_command", "update_target", "done",
    ];
    for (const name of expected) {
      expect(TOOL_DEFINITIONS[name]).toBeDefined();
      expect(TOOL_DEFINITIONS[name].name).toBe(name);
      expect(TOOL_DEFINITIONS[name].description).toBeTruthy();
    }
  });
});

// ── Role-based Tool Selection ──

describe("getToolsForRole", () => {
  it("gives discovery agent network tools but not file tools", () => {
    const tools = getToolsForRole("discovery");
    const names = tools.map((t) => t.name);
    expect(names).toContain("http_request");
    expect(names).toContain("send_prompt");
    expect(names).toContain("save_finding");
    expect(names).toContain("done");
    expect(names).not.toContain("read_file");
    expect(names).not.toContain("run_command");
  });

  it("gives attack agent network tools", () => {
    const tools = getToolsForRole("attack");
    const names = tools.map((t) => t.name);
    expect(names).toContain("http_request");
    expect(names).toContain("send_prompt");
    expect(names).toContain("save_finding");
  });

  it("gives verify agent file tools when hasScope is true", () => {
    const tools = getToolsForRole("verify", { hasScope: true });
    const names = tools.map((t) => t.name);
    expect(names).toContain("read_file");
    expect(names).toContain("run_command");
    expect(names).toContain("http_request");
  });

  it("verify agent has no file tools without scope", () => {
    const tools = getToolsForRole("verify");
    const names = tools.map((t) => t.name);
    expect(names).not.toContain("read_file");
    expect(names).not.toContain("run_command");
  });

  it("audit role gets all tools", () => {
    const tools = getToolsForRole("audit");
    expect(tools.length).toBe(Object.keys(TOOL_DEFINITIONS).length);
  });
});

// ── ToolExecutor ──

describe("ToolExecutor", () => {
  let ctx: ToolContext;
  let executor: ToolExecutor;

  beforeEach(() => {
    ctx = {
      target: "https://example.com",
      scanId: "test-scan-123",
      findings: [],
      attackResults: [],
      targetInfo: {},
    };
    executor = new ToolExecutor(ctx, null);
  });

  // ── save_finding ──

  it("save_finding adds to context findings", async () => {
    const result = await executor.execute({
      name: "save_finding",
      arguments: {
        title: "Test XSS",
        severity: "high",
        category: "xss",
        evidence_request: "GET /test",
        evidence_response: "<script>alert(1)</script>",
        evidence_analysis: "Reflected XSS in response",
      },
    });

    expect(result.success).toBe(true);
    expect(ctx.findings).toHaveLength(1);
    expect(ctx.findings[0].title).toBe("Test XSS");
    expect(ctx.findings[0].severity).toBe("high");
    expect(ctx.findings[0].status).toBe("discovered");
    expect(ctx.findings[0].id).toBeTruthy();
  });

  // ── query_findings ──

  it("query_findings returns in-memory findings", async () => {
    await executor.execute({
      name: "save_finding",
      arguments: {
        title: "Finding A",
        severity: "high",
        category: "xss",
        evidence_request: "r1",
        evidence_response: "resp1",
      },
    });
    await executor.execute({
      name: "save_finding",
      arguments: {
        title: "Finding B",
        severity: "low",
        category: "info",
        evidence_request: "r2",
        evidence_response: "resp2",
      },
    });

    const result = await executor.execute({
      name: "query_findings",
      arguments: { severity: "high" },
    });

    expect(result.success).toBe(true);
    const findings = result.output as any[];
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("Finding A");
  });

  // ── update_finding ──

  it("update_finding changes finding status", async () => {
    await executor.execute({
      name: "save_finding",
      arguments: {
        title: "Test Finding",
        severity: "medium",
        category: "xss",
        evidence_request: "r",
        evidence_response: "r",
      },
    });

    const findingId = ctx.findings[0].id;
    const result = await executor.execute({
      name: "update_finding",
      arguments: { finding_id: findingId, status: "confirmed" },
    });

    expect(result.success).toBe(true);
    expect(ctx.findings[0].status).toBe("confirmed");
  });

  // ── update_target ──

  it("update_target modifies target info", async () => {
    const result = await executor.execute({
      name: "update_target",
      arguments: {
        type: "chatbot",
        model: "gpt-4o",
        endpoints: '["https://example.com/v1/chat"]',
      },
    });

    expect(result.success).toBe(true);
    expect(ctx.targetInfo.type).toBe("chatbot");
    expect(ctx.targetInfo.model).toBe("gpt-4o");
    expect(ctx.targetInfo.endpoints).toEqual(["https://example.com/v1/chat"]);
  });

  // ── done ──

  it("done returns success with summary", async () => {
    const result = await executor.execute({
      name: "done",
      arguments: { summary: "Completed all tests" },
    });

    expect(result.success).toBe(true);
    expect((result.output as any).done).toBe(true);
    expect((result.output as any).summary).toBe("Completed all tests");
  });

  // ── unknown tool ──

  it("rejects unknown tools", async () => {
    const result = await executor.execute({
      name: "rm_rf_everything",
      arguments: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown tool");
  });

  // ── read_file / run_command without scope ──

  it("read_file fails without scopePath", async () => {
    const result = await executor.execute({
      name: "read_file",
      arguments: { path: "/etc/passwd" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("scoped local directory");
  });

  it("run_command fails without scopePath", async () => {
    const result = await executor.execute({
      name: "run_command",
      arguments: { command: "ls" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("scoped local directory");
  });

  // ── run_command safety ──

  describe("run_command safety", () => {
    let scopedExecutor: ToolExecutor;

    beforeEach(() => {
      const scopedCtx: ToolContext = {
        ...ctx,
        scopePath: "/tmp/pwnkit-test-scope",
      };
      scopedExecutor = new ToolExecutor(scopedCtx, null);
    });

    it("rejects shell operators", async () => {
      const dangerous = [
        "ls; rm -rf /",
        "cat foo && echo bar",
        "echo $HOME",
        "ls `whoami`",
        "cat < /etc/passwd",
        "echo > /tmp/evil",
      ];

      for (const cmd of dangerous) {
        const result = await scopedExecutor.execute({
          name: "run_command",
          arguments: { command: cmd },
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain("Shell operators");
      }
    });

    it("rejects disallowed commands", async () => {
      const result = await scopedExecutor.execute({
        name: "run_command",
        arguments: { command: "curl https://evil.com" },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("not allowed");
    });

    it("rejects absolute paths in scoped commands", async () => {
      const result = await scopedExecutor.execute({
        name: "run_command",
        arguments: { command: "cat /etc/passwd" },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Absolute paths");
    });

    it("rejects parent-path traversal", async () => {
      const result = await scopedExecutor.execute({
        name: "run_command",
        arguments: { command: "cat ../../etc/passwd" },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("traversal");
    });

    it("rejects npm with disallowed subcommands", async () => {
      const result = await scopedExecutor.execute({
        name: "run_command",
        arguments: { command: "npm install evil-package" },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("not allowed");
    });

    it("rejects find -exec", async () => {
      const result = await scopedExecutor.execute({
        name: "run_command",
        arguments: { command: "find . -exec rm {} +" },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("not allowed");
    });
  });

  // ── http_request URL validation ──

  it("http_request blocks cross-origin requests", async () => {
    const result = await executor.execute({
      name: "http_request",
      arguments: { url: "https://evil.com/steal" },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Cross-origin");
  });

  it("http_request blocks local/internal URLs from external target", async () => {
    const result = await executor.execute({
      name: "http_request",
      arguments: { url: "http://169.254.169.254/latest/meta-data/" },
    });
    expect(result.success).toBe(false);
    // Either cross-origin or local blocked
    expect(result.error).toBeTruthy();
  });
});
