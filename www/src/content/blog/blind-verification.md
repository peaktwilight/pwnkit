---
title: "Why I Built Blind Verification"
date: "2026-03-29"
description: "Every security scanner drowns you in false positives. I tried three approaches before I found one that actually works."
readTime: "10 min read"
---

You run a security scan. It finds 200 "possible vulnerabilities." You spend the next four hours triaging. 190 of them are noise. The other 10 are maybes. You still have to write manual PoCs to confirm any of them.

This is the state of security tooling in 2026. And it drove me insane enough to try fixing it three times before I got it right.

## attempt 1: template-based scanning

The first version of pwnkit was simple. YAML templates. Regex patterns. Send a payload, check if the response matches a known-bad pattern. This is how most scanners work &mdash; nuclei, nikto, the whole ecosystem.

```yaml
# template-v1.yaml
id: ssrf-check
payloads:
  - "http://169.254.169.254/latest/meta-data/"
  - "http://localhost:6379"
matchers:
  - type: regex
    pattern: "(ami-id|instance-id|ERR wrong)"
```

It worked for the obvious stuff. But the false positive rate was brutal. A response containing the word "instance-id" in an error message? Flagged. An API that returns user input in the response body? Flagged. Regex can't understand context. It sees patterns, not meaning.

I was spending more time triaging findings than I would have spent just pentesting manually.

## attempt 2: agentic scanning

If regex can't understand context, what if the scanner could think? I replaced the template engine with an AI agent that actually read the code, crafted payloads based on what it saw, and reasoned about responses.

This was better. Way better. The agent could look at a function, understand the data flow, and craft a targeted attack. It could tell the difference between user input being reflected in an error message versus user input being passed to `exec()`.

But it had a new problem: hallucination.

The agent would find something that looked suspicious, then reason itself into a vulnerability that didn't exist. "This function *could* be vulnerable if the input isn't sanitized upstream..." Then it would check upstream, find no sanitization, and report a critical finding &mdash; without noticing the WAF sitting in front of the whole thing, or the type coercion that made the payload harmless.

"Could be vulnerable" is not the same as "is vulnerable." But the agent couldn't always tell the difference.

## attempt 3: single agent with proof-of-concept

Okay. So make the agent prove it. Don't just report a finding &mdash; write a concrete PoC that demonstrates the exploit. If you can't write a working PoC, you don't have a finding.

This killed a lot of the hallucinations. The agent had to put its money where its mouth was. No more "could be vulnerable" &mdash; either the PoC works or it doesn't.

But there was a subtler problem: **confirmation bias**.

The same agent that decided something was vulnerable was also writing the PoC. And if it already believed the vulnerability was real, it would write a PoC that *looked* convincing but didn't actually prove anything. It would test the happy path. It would assume its payload got through. It would write assertions that passed because they were testing the wrong thing.

It's the same problem that happens with human pentesters. If you're the one who found the bug, you're the worst person to verify it. You already believe it's real.

## the insight: double-blind peer review

In academia, when you submit a paper for peer review, the reviewer doesn't know who wrote it or what the author was thinking. They get the paper and nothing else. They have to independently evaluate whether the conclusions follow from the evidence.

What if I did the same thing with vulnerability verification?

The research agent does its thing &mdash; discovers attack surfaces, crafts payloads, launches multi-turn attacks, writes PoC code. One long agent session. Then I take **only** the PoC code and the file path, strip out all the reasoning and context, and hand it to a completely separate verify agent.

The verify agent has no idea why the researcher thought this was vulnerable. It doesn't know the attack narrative. It gets a PoC script and a file to look at. Its job: independently trace the data flow, run the PoC, and confirm whether the exploit actually works.

If it can't confirm &mdash; the finding is killed. No negotiation.

```javascript
// The pipeline

// 1. Research agent: one multi-turn session
//    discovers + attacks + writes PoC
const findings = await researchAgent.run({
  target: packageDir,
  mode: "audit"
});
// Returns: [{ file, vulnerability, poc, reasoning }]

// 2. Verify agents: parallel, independent, blind
//    each gets ONLY poc + file path
const verified = await Promise.all(
  findings.map(f => verifyAgent.run({
    poc: f.poc,        // just the PoC code
    filePath: f.file   // just the file path
    // NO reasoning, NO context, NO attack narrative
  }))
);

// 3. Only confirmed findings make the report
const confirmed = verified.filter(v => v.status === "confirmed");
```

## pwnkit scanned itself

The best way to test a security tool is to point it at itself. So I did.

The research agent went through the pwnkit codebase and found 6 potential vulnerabilities:

- **Command injection** via unsanitized package names passed to shell
- **SSRF** through target URL parameter in scan mode
- **Arbitrary file read** via path traversal in review command
- **Prompt injection** in LLM-powered analysis pipeline
- Two more related to **input validation** edge cases

Six findings. The old pwnkit would have reported all six as vulnerabilities.

The blind verify agents independently rejected **all six** as false positives.

And every rejection was correct. The code had proper mitigations in place &mdash; input sanitization, URL validation, path normalization, sandboxed execution &mdash; that the research agent missed or underestimated during its analysis. The verify agents, starting from scratch with only the PoC and file path, traced the actual data flow and found that none of the PoCs would succeed against the real code.

<div class="bg-night-lighter border border-white/5 rounded-lg p-5 my-8">
  <div class="flex items-center gap-3 mb-3">
    <div class="w-2 h-2 rounded-full bg-emerald-400"></div>
    <span class="text-sm font-mono text-emerald-400">Verification result</span>
  </div>
  <div class="grid grid-cols-3 gap-4 text-center">
    <div>
      <div class="text-2xl font-bold text-white">6</div>
      <div class="text-xs text-ash mt-1">reported by research</div>
    </div>
    <div>
      <div class="text-2xl font-bold text-crimson">0</div>
      <div class="text-xs text-ash mt-1">confirmed by verify</div>
    </div>
    <div>
      <div class="text-2xl font-bold text-emerald-400">6</div>
      <div class="text-xs text-ash mt-1">correct rejections</div>
    </div>
  </div>
</div>

## why blind matters

You might wonder: why not just have the same agent verify its own findings? Or pass the reasoning along so the verify agent has more context?

Because context is exactly how bias propagates. If the verify agent reads "I believe this is a command injection because the package name flows into a shell command," it's going to look for ways to confirm that narrative. It's going to focus on the shell command and might miss the sanitization step three functions up the call stack.

By making it blind, I force the verify agent to build its own understanding from the ground up. It has to:

- Read the PoC code and understand what it's trying to exploit
- Open the target file and trace the data flow independently
- Determine if the PoC would actually succeed against the real code
- Return a structured verdict: confirmed or rejected, with evidence

If the research agent missed a sanitization function, the verify agent will find it. If the PoC makes assumptions about the runtime environment, the verify agent will catch that. Two independent analyses are exponentially harder to fool than one.

## parallel, cheap, fast

The verify agents run in parallel &mdash; one per finding. If the research agent reports 8 vulnerabilities, 8 verify agents spin up simultaneously. Each one is a short, focused session. They don't need multi-turn conversations or tool access. They read code, trace data flow, and output a verdict.

```typescript
// Structured output via --json-schema (Claude Code)
// or --output-schema (Codex)

interface VerifyResult {
  finding_id: string;
  status: "confirmed" | "rejected";
  confidence: number;       // 0-100
  evidence: string;         // what the agent found
  data_flow_trace: string;  // source -> sink analysis
  rejection_reason?: string;// why it's a false positive
}
```

The structured output schema means I get machine-parseable results from every verify agent. No regex parsing of natural language. No "let me summarize my findings" that might miss details. Just a typed verdict I can pipe straight into the report.

And because pwnkit is runtime-agnostic, this works with whatever you're running:

- **Claude Code** &mdash; `--runtime claude` with `--json-schema`
- **Codex** &mdash; `--runtime codex` with `--output-schema`
- **Gemini, OpenCode, or any API** &mdash; same pipeline, different backend

## the pipeline, end to end

<div class="bg-night-lighter border border-white/5 rounded-lg p-5 my-8">
  <div class="space-y-4 font-mono text-sm">
    <div class="flex items-start gap-3">
      <span class="text-emerald-400 shrink-0 mt-0.5">01</span>
      <div>
        <div class="text-white">Research agent</div>
        <div class="text-ash text-xs mt-1">One multi-turn session. Reads code, maps attack surface, crafts payloads, launches attacks, writes PoC for every finding.</div>
      </div>
    </div>
    <div class="border-l border-white/10 ml-3 h-4"></div>
    <div class="flex items-start gap-3">
      <span class="text-blue-400 shrink-0 mt-0.5">02</span>
      <div>
        <div class="text-white">Strip context</div>
        <div class="text-ash text-xs mt-1">Extract only PoC code + file path from each finding. Discard reasoning, attack narrative, confidence scores.</div>
      </div>
    </div>
    <div class="border-l border-white/10 ml-3 h-4"></div>
    <div class="flex items-start gap-3">
      <span class="text-blue-400 shrink-0 mt-0.5">03</span>
      <div>
        <div class="text-white">Verify agents (parallel)</div>
        <div class="text-ash text-xs mt-1">N agents spin up simultaneously. Each gets one PoC + one file. Independently traces data flow, confirms or rejects.</div>
      </div>
    </div>
    <div class="border-l border-white/10 ml-3 h-4"></div>
    <div class="flex items-start gap-3">
      <span class="text-purple-400 shrink-0 mt-0.5">04</span>
      <div>
        <div class="text-white">Report generation</div>
        <div class="text-ash text-xs mt-1">Only confirmed findings appear. SARIF for GitHub, markdown + JSON with full evidence chains.</div>
      </div>
    </div>
  </div>
</div>

## why this matters

False positives aren't just annoying. They're actively harmful.

Every false positive erodes trust in the tool. After the third time a developer triages a "critical" finding that turns out to be nothing, they stop looking at the reports. The real vulnerability that comes next gets ignored because the signal-to-noise ratio trained them to ignore it.

Blind verification doesn't just reduce false positives. It makes every confirmed finding *trustworthy*. When pwnkit reports a vulnerability, it means two independent AI agents &mdash; one attacking, one verifying &mdash; both agree it's real. The verify agent has traced the data flow from source to sink and confirmed the PoC works. That's a finding you can act on.

It's the same principle that makes peer review work in science. The same principle behind adversarial testing. The same principle behind separation of duties in security. You don't let the person who writes the check also approve the check.

## try it

Blind verification is built into every pwnkit command. You don't have to configure it &mdash; it runs automatically. Audit a package:

```
npx pwnkit-cli audit your-package
```

The research agent will find what it finds. The verify agents will kill what doesn't hold up. You get only the real stuff.
