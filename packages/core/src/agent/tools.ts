import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { isIP } from "node:net";
import type { Finding, AttackResult, TargetInfo } from "@pwnkit/shared";
import type { ToolDefinition, ToolCall, ToolResult, ToolContext } from "./types.js";
import { sendPrompt, extractResponseText } from "../http.js";
import { buildAuthHeaders } from "./prompts.js";
import type { pwnkitDB } from "@pwnkit/db";
import { features as featureFlags } from "./features.js";

// ── Tool Registry ──

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  http_request: {
    name: "http_request",
    description:
      "Send an HTTP request to a target URL. Use this to probe endpoints, send attack payloads, or interact with the target.",
    parameters: {
      url: { type: "string", description: "Target URL" },
      method: {
        type: "string",
        description: "HTTP method",
        enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      },
      body: { type: "string", description: "Request body (JSON string)" },
      headers: { type: "object", description: "Additional headers as key-value pairs" },
    },
    required: ["url"],
  },

  send_prompt: {
    name: "send_prompt",
    description:
      "Send a prompt to the target LLM endpoint and get the response. This is the primary way to interact with the target.",
    parameters: {
      prompt: { type: "string", description: "The prompt to send to the target" },
      system_context: {
        type: "string",
        description: "Optional system context to include with the prompt",
      },
    },
    required: ["prompt"],
  },

  save_finding: {
    name: "save_finding",
    description:
      "Save a security finding to the database. Call this when you discover a vulnerability.",
    parameters: {
      title: { type: "string", description: "Short title for the finding" },
      description: { type: "string", description: "Detailed description of the vulnerability" },
      severity: {
        type: "string",
        description: "Severity level",
        enum: ["critical", "high", "medium", "low", "info"],
      },
      category: {
        type: "string",
        description: "Attack category",
        enum: [
          "prompt-injection",
          "jailbreak",
          "system-prompt-extraction",
          "data-exfiltration",
          "tool-misuse",
          "output-manipulation",
          "encoding-bypass",
          "multi-turn",
          "prototype-pollution",
          "path-traversal",
          "command-injection",
          "code-injection",
          "regex-dos",
          "unsafe-deserialization",
          "information-disclosure",
          "ssrf",
          "sql-injection",
          "xss",
          "cors",
          "security-misconfiguration",
        ],
      },
      template_id: { type: "string", description: "ID of the attack template used" },
      evidence_request: { type: "string", description: "The request/prompt that triggered the vuln" },
      evidence_response: { type: "string", description: "The response showing the vulnerability" },
      evidence_analysis: { type: "string", description: "Your analysis of why this is a vulnerability" },
    },
    required: ["title", "severity", "category", "evidence_request", "evidence_response"],
  },

  query_findings: {
    name: "query_findings",
    description:
      "Query existing findings from the database. Use this to check what has been found so far.",
    parameters: {
      severity: {
        type: "string",
        description: "Filter by severity",
        enum: ["critical", "high", "medium", "low", "info"],
      },
      category: { type: "string", description: "Filter by attack category" },
      status: {
        type: "string",
        description: "Filter by status",
        enum: ["discovered", "confirmed", "false-positive"],
      },
      limit: { type: "number", description: "Max results to return (default 20)" },
    },
  },

  update_finding: {
    name: "update_finding",
    description:
      "Update the status of an existing finding (e.g., mark as confirmed or false-positive).",
    parameters: {
      finding_id: { type: "string", description: "ID of the finding to update" },
      status: {
        type: "string",
        description: "New status",
        enum: ["discovered", "confirmed", "false-positive"],
      },
    },
    required: ["finding_id", "status"],
  },

  read_file: {
    name: "read_file",
    description: "Read a source code file. Returns numbered lines. Path must be within the scoped directory (usually the package or repo root). Start by reading package.json to understand the project structure, then follow imports.",
    parameters: {
      path: { type: "string", description: "File path (relative to scope root or absolute)" },
      max_lines: { type: "number", description: "Max lines to read (default 500). Use for large files." },
    },
    required: ["path"],
  },

  run_command: {
    name: "run_command",
    description:
      "Run a local command for code analysis. Allowed commands: grep, rg, find, ls, cat, head, tail, wc, semgrep, codeql, jq, file, stat, npm (audit/view/ls). Supports piping with |. Examples: 'rg --files .', 'grep -rn \"eval\" .', 'find . -name \"*.js\"', 'cat package.json | jq .main', 'rg \"__proto__\" . | head -20'.",
    parameters: {
      command: { type: "string", description: "Command to execute. Use pipe (|) for chaining. No shell operators like ;, &&, <, >, $." },
      cwd: { type: "string", description: "Working directory (defaults to package/repo root)" },
      timeout: { type: "number", description: "Timeout in ms (default 30000)" },
    },
    required: ["command"],
  },

  update_target: {
    name: "update_target",
    description:
      "Update the target profile with discovered information (type, model, endpoints, system prompt).",
    parameters: {
      type: {
        type: "string",
        description: "Target type",
        enum: ["api", "chatbot", "agent", "mcp", "web-app", "unknown"],
      },
      model: { type: "string", description: "Detected model name" },
      system_prompt: { type: "string", description: "Extracted system prompt" },
      endpoints: { type: "string", description: "JSON array of discovered endpoints" },
      features: { type: "string", description: "JSON array of detected features" },
    },
  },

  crawl: {
    name: "crawl",
    description:
      "Crawl a web page: fetch HTML, extract links, forms (with inputs), script sources, and cookies. Only follows same-origin links. Use this to map the attack surface of a web application.",
    parameters: {
      url: { type: "string", description: "URL to crawl" },
      depth: {
        type: "number",
        description: "Crawl depth (default 1, max 3). Depth 1 fetches only the given URL. Depth 2 also fetches same-origin links found on that page, etc.",
      },
    },
    required: ["url"],
  },

  submit_form: {
    name: "submit_form",
    description:
      "Submit an HTML form. Sends application/x-www-form-urlencoded data (not JSON). Use this after crawl discovers forms on the target.",
    parameters: {
      url: { type: "string", description: "Form action URL" },
      method: {
        type: "string",
        description: "HTTP method (default POST)",
        enum: ["GET", "POST"],
      },
      fields: {
        type: "object",
        description: "Form field key-value pairs to submit",
      },
      headers: {
        type: "object",
        description: "Additional headers (e.g. Cookie for session persistence)",
      },
    },
    required: ["url", "fields"],
  },

  bash: {
    name: "bash",
    description:
      "Run a shell command. Use curl, python3, jq, or any installed tool. Supports pipes, redirects, and multi-line scripts.",
    parameters: {
      command: { type: "string", description: "Shell command to execute. Supports pipes, redirects, and multi-line scripts." },
      timeout: { type: "number", description: "Timeout in seconds (default 30, max 120)" },
    },
    required: ["command"],
  },

  browser: {
    name: "browser",
    description:
      "Control a headless browser. Navigate to URLs, fill forms, click elements, execute JavaScript, and read page content. Use for XSS testing and pages that need JavaScript rendering.",
    parameters: {
      action: {
        type: "string",
        description: "Browser action",
        enum: ["navigate", "click", "fill", "evaluate", "content", "screenshot"],
      },
      url: { type: "string", description: "URL to navigate to (for navigate action)" },
      selector: { type: "string", description: "CSS selector (for click/fill actions)" },
      value: { type: "string", description: "Value to fill or JavaScript to evaluate" },
    },
    required: ["action"],
  },

  spawn_agent: {
    name: "spawn_agent",
    description:
      "Spawn a focused sub-agent with fresh context for a specific exploitation task. Use when you've found a vulnerability and need deep exploitation (e.g., SQLi table enumeration, multi-step auth chain). The sub-agent gets its own turn budget and returns findings.",
    parameters: {
      task: { type: "string", description: "What the sub-agent should do. Be specific: include the target URL, the vulnerability found, and what to extract." },
      max_turns: { type: "number", description: "Turn budget for the sub-agent (default 15, max 25)" },
    },
    required: ["task"],
  },

  web_search: {
    name: "web_search",
    description:
      "Search the web for CVE details, API documentation, or security technique references. Cannot be used to find writeups or solutions.",
    parameters: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
  },

  done: {
    name: "done",
    description:
      "Signal that you have completed your task. Include a summary of what you found or did.",
    parameters: {
      summary: { type: "string", description: "Summary of completed work" },
    },
    required: ["summary"],
  },
};

// ── Allowed commands for run_command (safety) ──

const ALLOWED_COMMANDS = new Set([
  "grep",
  "rg",
  "find",
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "semgrep",
  "codeql",
  "jq",
  "file",
  "stat",
  "npm",
]);

// Block dangerous shell chars. Piping is handled manually without invoking a shell.
const DISALLOWED_SHELL_CHARS = /[;&<>`$\n\r]/;
const ALLOWED_NPM_SUBCOMMANDS = new Set(["audit", "view", "ls", "list"]);

function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (const ch of command) {
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }

    if (ch === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "'" || ch === "\"") {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (escaping || quote) {
    throw new Error("Command contains unmatched quotes or escapes");
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function isCommandAllowed(tokens: string[]): boolean {
  const executable = tokens[0];
  if (!executable || !ALLOWED_COMMANDS.has(executable)) {
    return false;
  }

  if (executable === "npm") {
    const subcommand = tokens[1];
    return !!subcommand && ALLOWED_NPM_SUBCOMMANDS.has(subcommand);
  }

  return true;
}

function validateCommandTokens(tokens: string[]): void {
  if (tokens[0] === "find") {
    const dangerousFindArgs = new Set(["-exec", "-execdir", "-ok", "-okdir"]);
    for (const token of tokens.slice(1)) {
      if (dangerousFindArgs.has(token)) {
        throw new Error(`find subcommand ${token} is not allowed`);
      }
    }
  }
}

function executePipeline(
  segments: string[][],
  cwd: string,
  timeout: number,
): ToolResult {
  let stdin: string | Buffer | undefined;

  for (const tokens of segments) {
    const result = spawnSync(tokens[0], tokens.slice(1), {
      cwd,
      timeout,
      input: stdin,
      maxBuffer: 1024 * 1024,
      encoding: "utf-8",
    });

    if (result.error) {
      throw result.error;
    }

    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (result.status !== 0) {
      return {
        success: false,
        output: null,
        error: output.slice(0, 2_000) || `Command exited with status ${result.status}`,
      };
    }

    stdin = result.stdout ?? "";
  }

  return {
    success: true,
    output: typeof stdin === "string" ? stdin.slice(0, 10_000) : "",
  };
}

function resolveScopedPath(scopePath: string, inputPath: string): string {
  const root = resolve(scopePath);
  const candidate = isAbsolute(inputPath)
    ? resolve(inputPath)
    : resolve(root, inputPath);

  if (candidate !== root && !candidate.startsWith(root + "/")) {
    throw new Error(`Path escapes the allowed scope: ${inputPath}`);
  }

  return candidate;
}

function validateScopedCommand(tokens: string[]): void {
  for (const token of tokens.slice(1)) {
    if (isAbsolute(token)) {
      throw new Error(`Absolute paths are not allowed in scoped commands: ${token}`);
    }
    if (/(^|\/)\.\.(\/|$)/.test(token)) {
      throw new Error(`Parent-path traversal is not allowed in scoped commands: ${token}`);
    }
  }
}

function normalizeLoopbackHost(hostname: string): string {
  if (hostname === "::1") return "127.0.0.1";
  return hostname.toLowerCase();
}

function isPrivateIpv4(hostname: string): boolean {
  const normalized = normalizeLoopbackHost(hostname);
  if (isIP(normalized) !== 4) return false;

  const [a, b] = normalized.split(".").map((part) => Number(part));
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

function isLocalHostname(hostname: string): boolean {
  const normalized = normalizeLoopbackHost(hostname);
  return normalized === "localhost" || normalized.endsWith(".localhost");
}

function validateTargetUrl(baseUrl: string, requestedUrl: string): string {
  const base = new URL(baseUrl);
  const candidate = new URL(requestedUrl, base);

  if (!["http:", "https:"].includes(candidate.protocol)) {
    throw new Error(`Unsupported protocol for http_request: ${candidate.protocol}`);
  }

  if (candidate.origin !== base.origin) {
    throw new Error(`Cross-origin http_request blocked: ${candidate.origin}`);
  }

  const hostname = candidate.hostname.toLowerCase();
  const baseHostname = base.hostname.toLowerCase();
  const baseIsLocal = isLocalHostname(baseHostname) || isPrivateIpv4(baseHostname) || isPrivateIpv6(baseHostname);
  const candidateIsLocal = isLocalHostname(hostname) || isPrivateIpv4(hostname) || isPrivateIpv6(hostname);

  if (candidateIsLocal && !baseIsLocal) {
    throw new Error(`Local/internal http_request blocked: ${candidate.hostname}`);
  }

  return candidate.toString();
}

// ── Tool Executor ──

export class ToolExecutor {
  private db: pwnkitDB | null;
  private ctx: ToolContext;
  private _browser: any = null;
  private _browserPage: any = null;
  private _browserDialogs: string[] = [];
  private _browserConsole: string[] = [];
  private _playwrightAvailable: boolean | null = null;

  constructor(ctx: ToolContext, db: pwnkitDB | null = null) {
    this.ctx = ctx;
    this.db = db;
  }

  /** Check if playwright is installed (cached). */
  async isPlaywrightAvailable(): Promise<boolean> {
    if (this._playwrightAvailable !== null) return this._playwrightAvailable;
    try {
      // @ts-ignore — playwright is an optional dependency
      await import("playwright");
      this._playwrightAvailable = true;
    } catch {
      this._playwrightAvailable = false;
    }
    return this._playwrightAvailable;
  }

  /**
   * Build environment variables for auth credentials, making them available
   * to shell commands (curl, python3, etc.) via $AUTH_HEADER / $AUTH_VALUE.
   */
  private buildAuthEnvVars(): Record<string, string> {
    const auth = this.ctx.authConfig;
    if (!auth) return {};

    const headers = buildAuthHeaders(auth);
    const entries = Object.entries(headers);
    if (entries.length === 0) return {};

    const [headerName, headerValue] = entries[0];
    return {
      AUTH_HEADER: headerName,
      AUTH_VALUE: headerValue,
      // Convenience: full curl-style header flag
      AUTH_CURL_FLAG: `-H '${headerName}: ${headerValue}'`,
    };
  }

  /** Clean up browser resources. Call when the agent loop ends. */
  async cleanup(): Promise<void> {
    try {
      if (this._browserPage) {
        await this._browserPage.close().catch(() => {});
        this._browserPage = null;
      }
      if (this._browser) {
        await this._browser.close().catch(() => {});
        this._browser = null;
      }
    } catch {
      // Best-effort cleanup
    }
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    try {
      switch (call.name) {
        case "http_request":
          return await this.httpRequest(call.arguments);
        case "send_prompt":
          return await this.sendPromptTool(call.arguments);
        case "save_finding":
          return this.saveFinding(call.arguments);
        case "query_findings":
          return this.queryFindings(call.arguments);
        case "update_finding":
          return this.updateFinding(call.arguments);
        case "read_file":
          return this.readFile(call.arguments);
        case "run_command":
          return this.runCommand(call.arguments);
        case "crawl":
          return await this.crawl(call.arguments);
        case "submit_form":
          return await this.submitForm(call.arguments);
        case "update_target":
          return this.updateTarget(call.arguments);
        case "bash":
          return await this.shellExec(call.arguments);
        case "browser":
          return await this.browserAction(call.arguments);
        case "web_search":
          return await this.webSearch(call.arguments);
        case "spawn_agent":
          return await this.spawnAgent(call.arguments);
        case "done":
          return this.markDone(call.arguments);
        default:
          // Tool router hook (inspired by Cyber-AutoAgent): if the model
          // hallucinates a tool name like "nmap" or "sqlmap", route it
          // to bash transparently. This lets the agent invoke any CLI
          // tool without explicit registration.
          if (call.arguments.command || call.arguments.target || call.arguments.url) {
            const cmd = (call.arguments.command as string) ?? `${call.name} ${Object.values(call.arguments).join(" ")}`;
            return await this.shellExec({ command: cmd, timeout: 30 });
          }
          return { success: false, output: null, error: `Unknown tool: ${call.name}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: null, error: msg };
    }
  }

  private async httpRequest(args: Record<string, unknown>): Promise<ToolResult> {
    const url = validateTargetUrl(this.ctx.target, args.url as string);
    const method = (args.method as string) ?? "POST";
    const body = args.body as string | undefined;
    const authHeaders = buildAuthHeaders(this.ctx.authConfig);
    const headers = { ...authHeaders, ...(args.headers as Record<string, string>) ?? {} };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: body ?? undefined,
        signal: controller.signal,
        redirect: "manual",
      });

      clearTimeout(timer);
      const text = await res.text();
      const output = {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body: text.slice(0, 10_000), // cap response size
      };

      // Persist as run artifact
      this.persistToolArtifact("http_request", {
        request: { url, method, headers, body: body?.slice(0, 2_000) },
        response: { status: output.status, body: output.body.slice(0, 5_000) },
      });

      return { success: true, output };
    } finally {
      clearTimeout(timer);
    }
  }

  private async sendPromptTool(args: Record<string, unknown>): Promise<ToolResult> {
    const prompt = args.prompt as string;

    try {
      const res = await sendPrompt(this.ctx.target, prompt, { timeout: 30_000 });
      const text = extractResponseText(res.body);

      // Persist as run artifact
      this.persistToolArtifact("send_prompt", {
        request: { prompt: prompt.slice(0, 2_000), target: this.ctx.target },
        response: { text: text.slice(0, 5_000), raw: JSON.stringify(res.body).slice(0, 5_000) },
      });

      return { success: true, output: { response: text, raw: res.body } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: null, error: msg };
    }
  }

  /** Persist a tool call's request/response as a first-class run artifact via the event pipeline. */
  private persistToolArtifact(toolName: string, data: Record<string, unknown>): void {
    if (!this.db) return;
    try {
      this.db.logEvent({
        scanId: this.ctx.scanId,
        stage: "attack",
        eventType: "tool_artifact",
        payload: { tool: toolName, ...data },
        timestamp: Date.now(),
      });
    } catch {
      // Non-critical — don't fail the tool call if artifact persistence fails
    }
  }

  // ── Crawl helpers ──

  private parseHtml(html: string, baseUrl: string): {
    links: string[];
    forms: Array<{ action: string; method: string; inputs: Array<{ name: string; type: string }> }>;
    scripts: string[];
  } {
    const base = new URL(baseUrl);
    const links: string[] = [];
    const scripts: string[] = [];
    const forms: Array<{ action: string; method: string; inputs: Array<{ name: string; type: string }> }> = [];

    // Extract links
    const hrefRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = hrefRe.exec(html)) !== null) {
      try {
        const resolved = new URL(m[1], baseUrl);
        if (resolved.hostname === base.hostname) {
          links.push(resolved.toString());
        }
      } catch { /* skip malformed URLs */ }
    }

    // Extract script sources
    const scriptRe = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
    while ((m = scriptRe.exec(html)) !== null) {
      try {
        scripts.push(new URL(m[1], baseUrl).toString());
      } catch { /* skip */ }
    }

    // Extract forms with their inputs
    const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
    while ((m = formRe.exec(html)) !== null) {
      const attrs = m[1];
      const body = m[2];

      const actionMatch = /action\s*=\s*["']([^"']*)["']/i.exec(attrs);
      const methodMatch = /method\s*=\s*["']([^"']*)["']/i.exec(attrs);

      let action = baseUrl;
      if (actionMatch) {
        try { action = new URL(actionMatch[1], baseUrl).toString(); } catch { /* keep default */ }
      }
      const method = (methodMatch?.[1] ?? "GET").toUpperCase();

      const inputs: Array<{ name: string; type: string }> = [];
      const inputRe = /<(?:input|textarea|select)\b([^>]*)>/gi;
      let im: RegExpExecArray | null;
      while ((im = inputRe.exec(body)) !== null) {
        const iattrs = im[1];
        const nameMatch = /name\s*=\s*["']([^"']*)["']/i.exec(iattrs);
        const typeMatch = /type\s*=\s*["']([^"']*)["']/i.exec(iattrs);
        if (nameMatch) {
          inputs.push({ name: nameMatch[1], type: typeMatch?.[1] ?? "text" });
        }
      }

      forms.push({ action, method, inputs });
    }

    return { links: [...new Set(links)], forms, scripts: [...new Set(scripts)] };
  }

  private parseCookies(headers: Headers): string[] {
    const cookies: string[] = [];
    headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        cookies.push(value);
      }
    });
    return cookies;
  }

  private async crawl(args: Record<string, unknown>): Promise<ToolResult> {
    const startUrl = args.url as string;
    const maxDepth = Math.min(Math.max((args.depth as number) ?? 1, 1), 3);

    // Validate the URL scheme and resolve against target origin for relative URLs
    let resolved: URL;
    try {
      resolved = new URL(startUrl, this.ctx.target);
    } catch {
      return { success: false, output: null, error: `Invalid URL: ${startUrl}` };
    }

    if (!["http:", "https:"].includes(resolved.protocol)) {
      return { success: false, output: null, error: `Unsupported protocol: ${resolved.protocol}` };
    }

    const originHost = resolved.hostname;
    const visited = new Set<string>();
    const results: Array<{
      url: string;
      status: number;
      links: string[];
      forms: Array<{ action: string; method: string; inputs: Array<{ name: string; type: string }> }>;
      scripts: string[];
      cookies: string[];
      textContent?: string;
    }> = [];

    const queue: Array<{ url: string; depth: number }> = [{ url: resolved.toString(), depth: 1 }];

    while (queue.length > 0) {
      const item = queue.shift()!;
      const normalizedUrl = item.url.split("#")[0]; // strip fragment
      if (visited.has(normalizedUrl)) continue;
      visited.add(normalizedUrl);

      // Same-origin check
      let parsed: URL;
      try {
        parsed = new URL(normalizedUrl);
      } catch { continue; }
      if (parsed.hostname !== originHost) continue;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);

      try {
        const crawlAuthHeaders = buildAuthHeaders(this.ctx.authConfig);
        const res = await fetch(normalizedUrl, {
          method: "GET",
          signal: controller.signal,
          redirect: "follow",
          headers: { "User-Agent": "pwnkit-crawler/1.0", ...crawlAuthHeaders },
        });
        clearTimeout(timer);

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("html") && !contentType.includes("text")) {
          results.push({
            url: normalizedUrl,
            status: res.status,
            links: [],
            forms: [],
            scripts: [],
            cookies: this.parseCookies(res.headers),
          });
          continue;
        }

        const html = await res.text();
        const { links, forms, scripts } = this.parseHtml(html.slice(0, 500_000), normalizedUrl);
        const cookies = this.parseCookies(res.headers);

        // Extract visible text content so the agent can read credentials, hints, etc.
        const textContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000);

        results.push({ url: normalizedUrl, status: res.status, links, forms, scripts, cookies, textContent });

        // Enqueue discovered links for deeper crawling
        if (item.depth < maxDepth) {
          for (const link of links) {
            queue.push({ url: link, depth: item.depth + 1 });
          }
        }
      } catch (err) {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          url: normalizedUrl,
          status: 0,
          links: [],
          forms: [],
          scripts: [],
          cookies: [],
        });
        // Include the error inline so the agent sees partial results
        (results[results.length - 1] as Record<string, unknown>).error = msg;
      }
    }

    this.persistToolArtifact("crawl", {
      startUrl: resolved.toString(),
      depth: maxDepth,
      pagesVisited: results.length,
    });

    return {
      success: true,
      output: {
        pages: results,
        totalPages: results.length,
        totalLinks: results.reduce((n, p) => n + p.links.length, 0),
        totalForms: results.reduce((n, p) => n + p.forms.length, 0),
      },
    };
  }

  private async submitForm(args: Record<string, unknown>): Promise<ToolResult> {
    const rawUrl = args.url as string;
    const method = ((args.method as string) ?? "POST").toUpperCase();
    const fields = (args.fields as Record<string, string>) ?? {};
    const formAuthHeaders = buildAuthHeaders(this.ctx.authConfig);
    const extraHeaders = { ...formAuthHeaders, ...(args.headers as Record<string, string>) ?? {} };

    // Resolve URL relative to target
    let resolved: URL;
    try {
      resolved = new URL(rawUrl, this.ctx.target);
    } catch {
      return { success: false, output: null, error: `Invalid URL: ${rawUrl}` };
    }

    if (!["http:", "https:"].includes(resolved.protocol)) {
      return { success: false, output: null, error: `Unsupported protocol: ${resolved.protocol}` };
    }

    // Encode fields as application/x-www-form-urlencoded
    const encoded = new URLSearchParams(fields).toString();

    let fetchUrl = resolved.toString();
    const fetchOpts: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...extraHeaders,
      },
      redirect: "manual",
    };

    if (method === "GET") {
      // Append fields to query string
      const withParams = new URL(fetchUrl);
      for (const [k, v] of Object.entries(fields)) {
        withParams.searchParams.set(k, v);
      }
      fetchUrl = withParams.toString();
    } else {
      fetchOpts.body = encoded;
    }

    const controller = new AbortController();
    fetchOpts.signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(fetchUrl, fetchOpts);
      clearTimeout(timer);
      const text = await res.text();

      const output = {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body: text.slice(0, 10_000),
      };

      this.persistToolArtifact("submit_form", {
        request: { url: fetchUrl, method, fields },
        response: { status: output.status, body: output.body.slice(0, 5_000) },
      });

      return { success: true, output };
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: null, error: msg };
    }
  }

  private async shellExec(args: Record<string, unknown>): Promise<ToolResult> {
    const command = (args.command as string)?.trim();
    if (!command) {
      return { success: false, output: null, error: "Command is required" };
    }

    const timeoutSec = Math.min((args.timeout as number) ?? 30, 120);

    try {
      const { execSync } = await import("node:child_process");
      const result = execSync(command, {
        timeout: timeoutSec * 1000,
        maxBuffer: 1024 * 1024, // 1MB
        encoding: "utf-8",
        shell: "/bin/bash",
        env: { ...process.env, TARGET: this.ctx.target, ...this.buildAuthEnvVars() },
        stdio: ["pipe", "pipe", "pipe"],
      });

      const output = (result ?? "").slice(0, 10_000);

      this.persistToolArtifact("bash", {
        command: command.slice(0, 500),
        output: output.slice(0, 2_000),
      });

      return { success: true, output };
    } catch (err: any) {
      // execSync throws on non-zero exit — capture stdout+stderr anyway
      const stdout = (err.stdout as string) ?? "";
      const stderr = (err.stderr as string) ?? "";
      const combined = (stdout + "\n" + stderr).trim().slice(0, 10_000);

      if (combined) {
        // Non-zero exit but we got output — return it as success
        // (many pentesting tools exit non-zero on findings)
        this.persistToolArtifact("bash", {
          command: command.slice(0, 500),
          output: combined.slice(0, 2_000),
          exitCode: err.status,
        });
        return { success: true, output: combined };
      }

      const msg = err.killed ? "Command timed out" : (err.message ?? String(err));
      return { success: false, output: null, error: msg.slice(0, 2_000) };
    }
  }

  // ── Browser automation (Playwright) ──

  private async ensureBrowser(): Promise<{ page: any }> {
    if (this._browserPage) return { page: this._browserPage };

    // @ts-ignore — playwright is an optional dependency
    const { chromium } = await import("playwright");
    this._browser = await chromium.launch({ headless: true });
    const context = await this._browser.newContext({
      ignoreHTTPSErrors: true,
      userAgent: "pwnkit-browser/1.0",
    });
    this._browserPage = await context.newPage();

    // Capture dialogs (alert/confirm/prompt) — key XSS signal
    this._browserPage.on("dialog", async (dialog: any) => {
      this._browserDialogs.push(`${dialog.type()}: ${dialog.message()}`);
      await dialog.dismiss().catch(() => {});
    });

    // Capture console messages
    this._browserPage.on("console", (msg: any) => {
      if (this._browserConsole.length < 50) {
        this._browserConsole.push(`[${msg.type()}] ${msg.text()}`);
      }
    });

    return { page: this._browserPage };
  }

  private async browserAction(args: Record<string, unknown>): Promise<ToolResult> {
    const action = args.action as string;
    if (!action) {
      return { success: false, output: null, error: "action is required" };
    }

    if (!(await this.isPlaywrightAvailable())) {
      return {
        success: false,
        output: null,
        error: "playwright is not installed. Install it with: npm i playwright && npx playwright install chromium",
      };
    }

    // Clear per-action dialog/console buffers
    this._browserDialogs = [];
    this._browserConsole = [];

    const ACTION_TIMEOUT = 10_000;

    try {
      const { page } = await this.ensureBrowser();

      let result: unknown;

      switch (action) {
        case "navigate": {
          const url = args.url as string;
          if (!url) return { success: false, output: null, error: "url is required for navigate" };
          const response = await page.goto(url, { timeout: ACTION_TIMEOUT, waitUntil: "domcontentloaded" });
          result = {
            url: page.url(),
            status: response?.status() ?? null,
            title: await page.title(),
            dialogs: [...this._browserDialogs],
            console: this._browserConsole.slice(0, 20),
          };
          break;
        }

        case "click": {
          const selector = args.selector as string;
          if (!selector) return { success: false, output: null, error: "selector is required for click" };
          await page.click(selector, { timeout: ACTION_TIMEOUT });
          // Wait briefly for any navigation or DOM updates
          await page.waitForTimeout(500);
          result = {
            clicked: selector,
            url: page.url(),
            title: await page.title(),
            dialogs: [...this._browserDialogs],
            console: this._browserConsole.slice(0, 20),
          };
          break;
        }

        case "fill": {
          const selector = args.selector as string;
          const value = args.value as string;
          if (!selector) return { success: false, output: null, error: "selector is required for fill" };
          if (value === undefined) return { success: false, output: null, error: "value is required for fill" };
          await page.fill(selector, value, { timeout: ACTION_TIMEOUT });
          result = {
            filled: selector,
            value,
            dialogs: [...this._browserDialogs],
          };
          break;
        }

        case "evaluate": {
          const expression = args.value as string;
          if (!expression) return { success: false, output: null, error: "value (JavaScript) is required for evaluate" };
          const evalResult = await page.evaluate(expression).catch((e: Error) => `Error: ${e.message}`);
          result = {
            result: typeof evalResult === "object" ? JSON.stringify(evalResult) : String(evalResult),
            dialogs: [...this._browserDialogs],
            console: this._browserConsole.slice(0, 20),
          };
          break;
        }

        case "content": {
          const html = await page.content();
          // Extract visible text for readability
          const text = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) ?? "").catch(() => "");
          result = {
            url: page.url(),
            title: await page.title(),
            html: html.slice(0, 10_000),
            text: (text as string).slice(0, 5_000),
            dialogs: [...this._browserDialogs],
          };
          break;
        }

        case "screenshot": {
          const buffer = await page.screenshot({ type: "png", fullPage: false });
          const base64 = buffer.toString("base64").slice(0, 50_000); // cap at ~37KB image
          result = {
            url: page.url(),
            title: await page.title(),
            screenshot_base64: base64,
            dialogs: [...this._browserDialogs],
          };
          break;
        }

        default:
          return {
            success: false,
            output: null,
            error: `Unknown browser action: ${action}. Valid: navigate, click, fill, evaluate, content, screenshot`,
          };
      }

      this.persistToolArtifact("browser", {
        action,
        url: (args.url as string) ?? page.url(),
        dialogs: [...this._browserDialogs],
      });

      return { success: true, output: result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: { dialogs: [...this._browserDialogs], console: this._browserConsole.slice(0, 10) },
        error: msg.slice(0, 2_000),
      };
    }
  }

  private async spawnAgent(args: Record<string, unknown>): Promise<ToolResult> {
    const task = args.task as string;
    if (!task) return { success: false, output: null, error: "Task description is required" };

    const maxTurns = Math.min((args.max_turns as number) ?? 15, 25);

    try {
      // Dynamic import to avoid circular dependency
      const { runNativeAgentLoop } = await import("./native-loop.js");
      const { LlmApiRuntime } = await import("../runtime/llm-api.js");

      const rt = new LlmApiRuntime({ type: "api" as any, timeout: 60_000 });
      if (!(await rt.isAvailable())) {
        return { success: false, output: null, error: "No API key available for sub-agent" };
      }

      const subTools: ToolDefinition[] = ["bash", "save_finding", "done"]
        .map((n) => TOOL_DEFINITIONS[n])
        .filter((t): t is ToolDefinition => t !== undefined);

      const state = await runNativeAgentLoop({
        config: {
          role: "attack",
          systemPrompt: `You are a focused exploitation agent. Your ONLY job:\n\n${task}\n\nUse bash to run curl, python3, or any command. Save findings with save_finding. Call done when finished.`,
          tools: subTools,
          maxTurns,
          target: this.ctx.target,
          scanId: this.ctx.scanId + "-sub",
        },
        runtime: rt,
        db: null,
      });

      // Merge sub-agent findings into parent context
      for (const f of state.findings) {
        this.ctx.findings.push(f);
      }

      return {
        success: true,
        output: {
          turns: state.turnCount,
          findings: state.findings.length,
          summary: state.summary,
          done: state.done,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: null, error: msg.slice(0, 500) };
    }
  }

  private saveFinding(args: Record<string, unknown>): ToolResult {
    const finding: Finding = {
      id: randomUUID(),
      templateId: (args.template_id as string) ?? "manual",
      title: (args.title as string) ?? "Untitled finding",
      description: (args.description as string) ?? "",
      severity: (args.severity as Finding["severity"]) ?? "medium",
      category: (args.category as Finding["category"]) ?? "prompt-injection",
      status: "discovered",
      evidence: {
        request: (args.evidence_request as string) ?? "",
        response: (args.evidence_response as string) ?? "",
        analysis: args.evidence_analysis as string | undefined,
      },
      timestamp: Date.now(),
    };

    this.ctx.findings.push(finding);
    if (this.db && this.ctx.persistFindings !== false) {
      this.db.saveFinding(this.ctx.scanId, finding);
    }

    return { success: true, output: { findingId: finding.id, message: "Finding saved" } };
  }

  private queryFindings(args: Record<string, unknown>): ToolResult {
    if (this.db) {
      const results = this.db.queryFindings({
        scanId: this.ctx.scanId,
        severity: args.severity as string | undefined,
        category: args.category as string | undefined,
        status: args.status as string | undefined,
        limit: (args.limit as number) ?? 20,
      });
      return { success: true, output: results };
    }

    // Fallback to in-memory
    let results = [...this.ctx.findings];
    if (args.severity) results = results.filter((f) => f.severity === args.severity);
    if (args.category) results = results.filter((f) => f.category === args.category);
    if (args.status) results = results.filter((f) => f.status === args.status);
    return { success: true, output: results.slice(0, (args.limit as number) ?? 20) };
  }

  private updateFinding(args: Record<string, unknown>): ToolResult {
    const id = args.finding_id as string;
    const status = args.status as string;

    const finding = this.ctx.findings.find((f) => f.id === id);
    if (finding) {
      finding.status = status as Finding["status"];
    }
    if (this.db) {
      this.db.updateFindingStatus(id, status);
    }

    return { success: true, output: { message: `Finding ${id} updated to ${status}` } };
  }

  private readFile(args: Record<string, unknown>): ToolResult {
    if (!this.ctx.scopePath) {
      return {
        success: false,
        output: null,
        error: "read_file requires a scoped local directory and is not available for remote target scanning",
      };
    }

    const requestedPath = args.path as string;
    const maxLines = (args.max_lines as number) ?? 500;
    const path = resolveScopedPath(this.ctx.scopePath, requestedPath);

    const content = readFileSync(path, "utf-8");
    const lines = content.split("\n");
    const truncated = lines.length > maxLines;
    const output = lines.slice(0, maxLines).join("\n");

    return {
      success: true,
      output: { content: output, totalLines: lines.length, truncated },
    };
  }

  private runCommand(args: Record<string, unknown>): ToolResult {
    if (!this.ctx.scopePath) {
      return {
        success: false,
        output: null,
        error: "run_command requires a scoped local directory and is not available for remote target scanning",
      };
    }

    const command = (args.command as string).trim();
    if (DISALLOWED_SHELL_CHARS.test(command)) {
      return {
        success: false,
        output: null,
        error: `Shell operators (;, &, <, >, \`, $) are not allowed. Use pipe (|) for chaining. Permitted commands: ${[...ALLOWED_COMMANDS].join(", ")}`,
      };
    }

    // Split on pipe to support "grep foo | head -5" style commands.
    // Empty segments indicate shell operators like || or malformed pipes.
    const rawSegments = command.split("|");
    if (rawSegments.some((segment) => segment.trim().length === 0)) {
      return { success: false, output: null, error: "Empty pipe segments are not allowed" };
    }

    const segments = rawSegments.map((s) => s.trim());
    if (segments.length === 0) {
      return { success: false, output: null, error: "Command cannot be empty" };
    }

    // Validate each segment
    const tokenizedSegments: string[][] = [];
    for (const segment of segments) {
      let tokens: string[];
      try {
        tokens = tokenizeCommand(segment);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, output: null, error: msg };
      }

      if (tokens.length === 0) {
        return { success: false, output: null, error: "Empty pipe segments are not allowed" };
      }

      if (!isCommandAllowed(tokens)) {
        return {
          success: false,
          output: null,
          error: `Command "${tokens[0]}" not allowed. Permitted: ${[...ALLOWED_COMMANDS].join(", ")}`,
        };
      }

      try {
        validateCommandTokens(tokens);
        validateScopedCommand(tokens);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, output: null, error: msg };
      }

      tokenizedSegments.push(tokens);
    }

    const requestedCwd = args.cwd as string | undefined;
    const timeout = (args.timeout as number) ?? 30_000;
    const cwd = resolveScopedPath(this.ctx.scopePath, requestedCwd ?? ".");

    try {
      return executePipeline(tokenizedSegments, cwd, timeout);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: null, error: msg.slice(0, 2_000) };
    }
  }

  // ── Web search (anti-cheat gated) ──

  private static WEB_SEARCH_BLOCKLIST = [
    "writeup",
    "walkthrough",
    "solution",
    "ctf write",
    "how to solve",
    "flag{",
    "exploit-db",
  ];

  private async webSearch(args: Record<string, unknown>): Promise<ToolResult> {
    if (!featureFlags.webSearch) {
      return { success: false, output: null, error: "web_search is disabled. Set PWNKIT_FEATURE_WEB_SEARCH=1 to enable." };
    }

    const query = (args.query as string ?? "").trim();
    if (!query) {
      return { success: false, output: null, error: "query is required" };
    }

    // Anti-cheat: block queries that look for writeups/solutions
    const lowerQuery = query.toLowerCase();
    for (const blocked of ToolExecutor.WEB_SEARCH_BLOCKLIST) {
      if (lowerQuery.includes(blocked)) {
        return {
          success: false,
          output: null,
          error: `Blocked: search query contains disallowed term "${blocked}". Web search cannot be used to find writeups, solutions, or exploits.`,
        };
      }
    }

    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "pwnkit/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        return { success: false, output: null, error: `Search failed with status ${res.status}` };
      }

      const html = await res.text();

      // Parse DuckDuckGo HTML results — each result lives in a <div class="result">
      const results: Array<{ title: string; url: string; snippet: string }> = [];
      const resultRe = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = resultRe.exec(html)) !== null && results.length < 5) {
        const rawUrl = m[1];
        const title = m[2].replace(/<[^>]+>/g, "").trim();
        const snippet = m[3].replace(/<[^>]+>/g, "").trim();

        // DuckDuckGo wraps URLs in a redirect — extract the actual destination
        let finalUrl = rawUrl;
        try {
          const parsed = new URL(rawUrl, "https://duckduckgo.com");
          const uddg = parsed.searchParams.get("uddg");
          if (uddg) finalUrl = decodeURIComponent(uddg);
        } catch { /* keep raw */ }

        if (title || snippet) {
          results.push({ title, url: finalUrl, snippet });
        }
      }

      if (results.length === 0) {
        return { success: true, output: { message: "No results found.", results: [] } };
      }

      const formatted = results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
        .join("\n\n");

      return { success: true, output: { message: `Top ${results.length} results:`, formatted, results } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: null, error: `Web search failed: ${msg}` };
    } finally {
      clearTimeout(timer);
    }
  }

  private updateTarget(args: Record<string, unknown>): ToolResult {
    if (args.type) this.ctx.targetInfo.type = args.type as TargetInfo["type"];
    if (args.model) this.ctx.targetInfo.model = args.model as string;
    if (args.system_prompt) this.ctx.targetInfo.systemPrompt = args.system_prompt as string;
    if (args.endpoints) {
      try {
        this.ctx.targetInfo.endpoints = JSON.parse(args.endpoints as string);
      } catch {
        /* ignore parse errors */
      }
    }
    if (args.features) {
      try {
        this.ctx.targetInfo.detectedFeatures = JSON.parse(args.features as string);
      } catch {
        /* ignore parse errors */
      }
    }

    if (this.db) {
      this.db.upsertTarget({
        url: this.ctx.target,
        type: this.ctx.targetInfo.type ?? "unknown",
        ...this.ctx.targetInfo,
      } as TargetInfo);
    }

    return { success: true, output: { message: "Target profile updated", target: this.ctx.targetInfo } };
  }

  private markDone(args: Record<string, unknown>): ToolResult {
    return {
      success: true,
      output: { done: true, summary: (args.summary as string) ?? "Task completed" },
    };
  }
}

// ── Helper: get tools for a specific agent role ──

export function getToolsForRole(role: string, opts?: { hasScope?: boolean; webMode?: boolean; hasBrowser?: boolean }): ToolDefinition[] {
  const common = ["query_findings", "done"];
  const browserTools = opts?.hasBrowser ? ["browser"] : [];
  const webSearchTools = featureFlags.webSearch ? ["web_search"] : [];
  const networkTools = ["http_request", "crawl", "submit_form", "bash", ...browserTools, ...webSearchTools, "send_prompt", "save_finding", "update_finding", "update_target", ...common];
  const fileTools = ["read_file", "run_command"];

  const roleTools: Record<string, string[]> = {
    discovery: networkTools,
    attack: networkTools,
    // Verify agent gets file tools when there's a local scope (audit/review mode)
    verify: opts?.hasScope ? [...networkTools, ...fileTools] : networkTools,
    report: [...common],
    audit: Object.keys(TOOL_DEFINITIONS),
    review: Object.keys(TOOL_DEFINITIONS),
  };

  const toolNames = roleTools[role] ?? Object.keys(TOOL_DEFINITIONS);
  return toolNames
    .map((name) => TOOL_DEFINITIONS[name])
    .filter((t): t is ToolDefinition => t !== undefined);
}
