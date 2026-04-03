import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LlmApiRuntime } from "./llm-api.js";
import type { NativeMessage, NativeContentBlock } from "./types.js";

// ── Provider Detection ──

describe("LlmApiRuntime provider detection", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_BASE_URL;
    delete process.env.AZURE_OPENAI_MODEL;
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.PWNKIT_MODEL;
  });

  afterEach(() => {
    Object.assign(process.env, origEnv);
  });

  it("selects OpenRouter when OPENROUTER_API_KEY is set", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test123";
    const rt = new LlmApiRuntime({ type: "api", timeout: 5000 });
    expect((rt as any).provider).toBe("openrouter");
    expect((rt as any).apiKey).toBe("sk-or-test123");
    expect(await rt.isAvailable()).toBe(true);
  });

  it("selects Anthropic when ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test456";
    const rt = new LlmApiRuntime({ type: "api", timeout: 5000 });
    expect((rt as any).provider).toBe("anthropic");
    // Anthropic uses its own Messages API, wireApi is just a default
    expect((rt as any).wireApi).toBe("chat_completions");
  });

  it("selects Azure when AZURE_OPENAI_API_KEY is set (before OPENAI_API_KEY)", async () => {
    process.env.AZURE_OPENAI_API_KEY = "azure-key-123";
    process.env.OPENAI_API_KEY = "sk-openai-should-not-win";
    const rt = new LlmApiRuntime({ type: "api", timeout: 5000 });
    expect((rt as any).provider).toBe("azure");
    expect((rt as any).apiKey).toBe("azure-key-123");
  });

  it("selects OpenAI as last resort", async () => {
    process.env.OPENAI_API_KEY = "sk-openai-test";
    const rt = new LlmApiRuntime({ type: "api", timeout: 5000 });
    expect((rt as any).provider).toBe("openai");
  });

  it("reports unavailable when no key is set", async () => {
    const rt = new LlmApiRuntime({ type: "api", timeout: 5000 });
    expect(await rt.isAvailable()).toBe(false);
  });

  it("detects provider from explicit config key prefix", () => {
    const rt1 = new LlmApiRuntime({ type: "api", timeout: 5000, apiKey: "sk-or-cfg" });
    expect((rt1 as any).provider).toBe("openrouter");

    const rt2 = new LlmApiRuntime({ type: "api", timeout: 5000, apiKey: "sk-ant-cfg" });
    expect((rt2 as any).provider).toBe("anthropic");

    const rt3 = new LlmApiRuntime({ type: "api", timeout: 5000, apiKey: "some-other-key" });
    expect((rt3 as any).provider).toBe("openai");
  });

  it("respects PWNKIT_MODEL env var", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.PWNKIT_MODEL = "gpt-4-turbo";
    const rt = new LlmApiRuntime({ type: "api", timeout: 5000 });
    expect((rt as any).model).toBe("gpt-4-turbo");
  });
});

// ── Azure Headers ──

describe("LlmApiRuntime Azure headers", () => {
  it("uses api-key header for Azure provider", () => {
    const rt = new LlmApiRuntime({
      type: "api",
      timeout: 5000,
      apiKey: "azure-key",
    });
    // Force Azure provider
    (rt as any).provider = "azure";
    (rt as any).apiKey = "azure-key-123";
    const headers = (rt as any).buildHeaders();
    expect(headers["api-key"]).toBe("azure-key-123");
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("uses Bearer token for OpenAI provider", () => {
    const rt = new LlmApiRuntime({
      type: "api",
      timeout: 5000,
      apiKey: "sk-test",
    });
    (rt as any).provider = "openai";
    (rt as any).apiKey = "sk-test";
    const headers = (rt as any).buildHeaders();
    expect(headers["Authorization"]).toBe("Bearer sk-test");
    expect(headers["api-key"]).toBeUndefined();
  });
});

// ── Responses API Message Format ──

describe("LlmApiRuntime Responses API message format", () => {
  let rt: LlmApiRuntime;
  let capturedBody: any;

  beforeEach(() => {
    rt = new LlmApiRuntime({ type: "api", timeout: 5000, apiKey: "test-key" });
    (rt as any).provider = "openai";
    (rt as any).wireApi = "responses";
    (rt as any).apiKey = "test-key";

    // Mock fetch to capture the request body
    capturedBody = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        text: async () => JSON.stringify({
          output: [
            { type: "message", content: [{ type: "output_text", text: "done" }] },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      } as Response;
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("converts tool_use blocks to top-level function_call items", async () => {
    const messages: NativeMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "test prompt" }],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "I'll call a tool" },
          {
            type: "tool_use",
            id: "call_123",
            name: "http_request",
            input: { url: "https://example.com" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_123",
            content: '{"status":200}',
          },
        ],
      },
    ];

    await rt.executeNative("system prompt", messages, []);

    // Verify the input structure
    const input = capturedBody.input;

    // System message
    expect(input[0].role).toBe("system");

    // User text
    expect(input[1].role).toBe("user");
    expect(input[1].content[0].type).toBe("input_text");

    // Assistant text should be flushed before function_call
    expect(input[2].role).toBe("assistant");
    expect(input[2].content[0].type).toBe("input_text");
    expect(input[2].content[0].text).toBe("I'll call a tool");

    // function_call should be a top-level item, NOT nested in content
    expect(input[3].type).toBe("function_call");
    expect(input[3].call_id).toBe("call_123");
    expect(input[3].name).toBe("http_request");
    expect(input[3].arguments).toBe('{"url":"https://example.com"}');

    // function_call_output should be a top-level item
    expect(input[4].type).toBe("function_call_output");
    expect(input[4].call_id).toBe("call_123");
    expect(input[4].output).toBe('{"status":200}');
  });

  it("handles multiple tool calls in one turn", async () => {
    const messages: NativeMessage[] = [
      { role: "user", content: [{ type: "text", text: "go" }] },
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "c1", name: "http_request", input: { url: "https://a.com" } },
          { type: "tool_use", id: "c2", name: "send_prompt", input: { prompt: "hello" } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "c1", content: "result1" },
          { type: "tool_result", tool_use_id: "c2", content: "result2" },
        ],
      },
    ];

    await rt.executeNative("sys", messages, []);

    const input = capturedBody.input;
    // system(0), user(1), fn_call(2), fn_call(3), fn_output(4), fn_output(5)
    expect(input[2].type).toBe("function_call");
    expect(input[2].call_id).toBe("c1");
    expect(input[3].type).toBe("function_call");
    expect(input[3].call_id).toBe("c2");
    expect(input[4].type).toBe("function_call_output");
    expect(input[4].call_id).toBe("c1");
    expect(input[5].type).toBe("function_call_output");
    expect(input[5].call_id).toBe("c2");
  });

  it("does not nest function_call inside content arrays", async () => {
    const messages: NativeMessage[] = [
      { role: "user", content: [{ type: "text", text: "start" }] },
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "tc1", name: "done", input: { summary: "ok" } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tc1", content: '{"done":true}' },
        ],
      },
    ];

    await rt.executeNative("sys", messages, []);

    const input = capturedBody.input;
    // Verify no item has a nested function_call in its content array
    for (const item of input) {
      if (Array.isArray(item.content)) {
        for (const block of item.content) {
          expect(block.type).not.toBe("function_call");
          expect(block.type).not.toBe("function_call_output");
        }
      }
    }

    // The function_call should be at top level
    const fnCalls = input.filter((i: any) => i.type === "function_call");
    expect(fnCalls).toHaveLength(1);
    expect(fnCalls[0].call_id).toBe("tc1");
  });
});

// ── Chat Completions Message Format ──

describe("LlmApiRuntime chat completions format", () => {
  let rt: LlmApiRuntime;
  let capturedBody: any;

  beforeEach(() => {
    rt = new LlmApiRuntime({ type: "api", timeout: 5000, apiKey: "test-key" });
    (rt as any).provider = "openai";
    (rt as any).wireApi = "chat_completions";
    (rt as any).apiKey = "test-key";

    capturedBody = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        text: async () => JSON.stringify({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      } as Response;
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("converts tool_use to OpenAI tool_calls format", async () => {
    const messages: NativeMessage[] = [
      { role: "user", content: [{ type: "text", text: "hello" }] },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tc1",
            name: "http_request",
            input: { url: "https://x.com" },
          },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tc1", content: "result" },
        ],
      },
    ];

    await rt.executeNative("system", messages, []);

    const msgs = capturedBody.messages;
    // system(0), user(1), assistant with tool_calls(2), tool result(3)
    expect(msgs[0].role).toBe("system");
    expect(msgs[2].role).toBe("assistant");
    expect(msgs[2].tool_calls[0].id).toBe("tc1");
    expect(msgs[2].tool_calls[0].function.name).toBe("http_request");
    expect(msgs[3].role).toBe("tool");
    expect(msgs[3].tool_call_id).toBe("tc1");
  });
});

// ── Response Parsing ──

describe("LlmApiRuntime response parsing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses function_call items from Responses API output", async () => {
    const rt = new LlmApiRuntime({ type: "api", timeout: 5000, apiKey: "test" });
    (rt as any).provider = "openai";
    (rt as any).wireApi = "responses";
    (rt as any).apiKey = "test";

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        output: [
          {
            type: "function_call",
            call_id: "fc_001",
            name: "http_request",
            arguments: '{"url":"https://target.com"}',
          },
        ],
        usage: { input_tokens: 50, output_tokens: 20 },
      }),
    } as Response)));

    const result = await rt.executeNative("sys", [
      { role: "user", content: [{ type: "text", text: "go" }] },
    ], []);

    expect(result.stopReason).toBe("tool_use");
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("tool_use");
    const toolUse = result.content[0] as Extract<NativeContentBlock, { type: "tool_use" }>;
    expect(toolUse.id).toBe("fc_001");
    expect(toolUse.name).toBe("http_request");
    expect(toolUse.input).toEqual({ url: "https://target.com" });
  });

  it("parses tool_calls from chat completions response", async () => {
    const rt = new LlmApiRuntime({ type: "api", timeout: 5000, apiKey: "test" });
    (rt as any).provider = "openai";
    (rt as any).wireApi = "chat_completions";
    (rt as any).apiKey = "test";

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: "tc_abc",
              type: "function",
              function: {
                name: "send_prompt",
                arguments: '{"prompt":"test"}',
              },
            }],
          },
          finish_reason: "tool_calls",
        }],
        usage: { prompt_tokens: 30, completion_tokens: 10 },
      }),
    } as Response)));

    const result = await rt.executeNative("sys", [
      { role: "user", content: [{ type: "text", text: "go" }] },
    ], []);

    expect(result.stopReason).toBe("tool_use");
    expect(result.content).toHaveLength(1);
    const block = result.content[0] as Extract<NativeContentBlock, { type: "tool_use" }>;
    expect(block.name).toBe("send_prompt");
    expect(block.input).toEqual({ prompt: "test" });
  });

  it("returns error result on API failure", async () => {
    const rt = new LlmApiRuntime({ type: "api", timeout: 5000, apiKey: "test" });
    (rt as any).provider = "openai";
    (rt as any).wireApi = "chat_completions";
    (rt as any).apiKey = "test";

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => '{"error":"bad request"}',
    } as unknown as Response)));

    const result = await rt.executeNative("sys", [
      { role: "user", content: [{ type: "text", text: "go" }] },
    ], []);

    expect(result.stopReason).toBe("error");
    expect(result.error).toContain("400");
  });
});
