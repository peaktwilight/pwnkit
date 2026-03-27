import type {
  ScanContext,
  StageResult,
  AttackTemplate,
  AttackResult,
  AttackOutcome,
} from "@nightfang/shared";
import { DEPTH_CONFIG } from "@nightfang/shared";
import type { Runtime, RuntimeContext } from "../runtime/types.js";
import { sendPrompt, extractResponseText } from "../http.js";
import { buildDeepScanPrompt, buildMcpAuditPrompt } from "../prompts.js";

export interface AttackStageResult {
  results: AttackResult[];
  templatesRun: number;
  payloadsRun: number;
}

export async function runAttacks(
  ctx: ScanContext,
  templates: AttackTemplate[],
  runtime: Runtime
): Promise<StageResult<AttackStageResult>> {
  const start = Date.now();
  const results: AttackResult[] = [];
  const depthCfg = DEPTH_CONFIG[ctx.config.depth];

  // Limit templates based on depth
  const templatesToRun = templates.slice(0, depthCfg.maxTemplates);
  let payloadsRun = 0;

  for (const template of templatesToRun) {
    const payloads = template.payloads.slice(0, depthCfg.maxPayloadsPerTemplate);

    for (const payload of payloads) {
      payloadsRun++;
      try {
        const { responseText, latencyMs } = runtime.type === "api"
          ? await executeApiAttack(ctx, payload.prompt)
          : await executeProcessAttack(runtime, ctx, template, payload.prompt);

        const outcome = evaluateResponse(responseText, template);

        const result: AttackResult = {
          templateId: template.id,
          payloadId: payload.id,
          outcome,
          request: payload.prompt,
          response: responseText,
          latencyMs,
          timestamp: Date.now(),
        };

        results.push(result);
        ctx.attacks.push(result);
      } catch (err) {
        const result: AttackResult = {
          templateId: template.id,
          payloadId: payload.id,
          outcome: "error",
          request: payload.prompt,
          response: "",
          latencyMs: 0,
          timestamp: Date.now(),
          error: err instanceof Error ? err.message : String(err),
        };
        results.push(result);
        ctx.attacks.push(result);
      }
    }
  }

  return {
    stage: "attack",
    success: true,
    data: {
      results,
      templatesRun: templatesToRun.length,
      payloadsRun,
    },
    durationMs: Date.now() - start,
  };
}

/** Execute attack via direct HTTP (API mode) */
async function executeApiAttack(
  ctx: ScanContext,
  prompt: string
): Promise<{ responseText: string; latencyMs: number }> {
  const res = await sendPrompt(ctx.config.target, prompt, {
    timeout: ctx.config.timeout,
  });

  // Treat HTTP error responses as failures so the scanner can warn the user
  // instead of silently reporting "no vulnerabilities found".
  if (res.status >= 400) {
    throw new Error(
      `HTTP ${res.status} from target — the endpoint may be invalid or unreachable`
    );
  }

  return {
    responseText: extractResponseText(res.body),
    latencyMs: res.latencyMs,
  };
}

/** Execute attack via Claude Code / Codex subprocess */
async function executeProcessAttack(
  runtime: Runtime,
  ctx: ScanContext,
  template: AttackTemplate,
  prompt: string
): Promise<{ responseText: string; latencyMs: number }> {
  // For deep scan: wrap the payload in an agent prompt that gives
  // Claude Code context about the target and what to look for
  const agentPrompt = template.category === "tool-misuse"
    ? buildMcpAuditPrompt(ctx.config.target, template, prompt)
    : buildDeepScanPrompt(ctx.config.target, template, prompt);

  const runtimeCtx: RuntimeContext = {
    target: ctx.config.target,
    templateId: template.id,
    findings: ctx.findings.length > 0
      ? JSON.stringify(ctx.findings.map((f) => ({ id: f.id, title: f.title, severity: f.severity })))
      : undefined,
  };

  const result = await runtime.execute(agentPrompt, runtimeCtx);

  if (result.error && !result.output) {
    throw new Error(`Runtime error: ${result.error}`);
  }

  return {
    responseText: result.output,
    latencyMs: result.durationMs,
  };
}

function evaluateResponse(
  response: string,
  template: AttackTemplate
): AttackOutcome {
  const { detection } = template;

  const vulnerableMatches = findMatchingPatterns(
    response,
    detection.vulnerablePatterns,
  );
  const safeMatches = findMatchingPatterns(response, detection.safePatterns);

  // Refusal responses often repeat sensitive terms (for example "system prompt")
  // without actually complying. Treat mixed matches as inconclusive instead of
  // over-reporting a vulnerability.
  if (vulnerableMatches.length > 0 && safeMatches.length > 0) {
    return "inconclusive";
  }

  if (safeMatches.length > 0) {
    return "safe";
  }

  if (vulnerableMatches.length > 0) {
    return "vulnerable";
  }

  return "inconclusive";
}

function findMatchingPatterns(
  response: string,
  patterns?: string[],
): string[] {
  if (!patterns || patterns.length === 0) {
    return [];
  }

  return patterns.filter((pattern) => {
    const re = compileDetectionPattern(pattern);
    return re ? re.test(response) : false;
  });
}

function compileDetectionPattern(pattern: string): RegExp | null {
  let source = pattern;
  const flags = new Set<string>(["i"]);

  // Support YAML patterns that use PCRE-style inline flags, e.g. "(?i)foo".
  const inlineFlags = source.match(/^\(\?([a-z]+)\)/i);
  if (inlineFlags) {
    source = source.slice(inlineFlags[0].length);
    for (const flag of inlineFlags[1].toLowerCase()) {
      if ("imsu".includes(flag)) flags.add(flag);
    }
  }

  try {
    return new RegExp(source, [...flags].join(""));
  } catch {
    return null;
  }
}
