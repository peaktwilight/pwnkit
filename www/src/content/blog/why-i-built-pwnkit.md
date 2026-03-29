---
title: "Why I Built pwnkit"
date: "2026-03-27"
description: "From 7 CVEs and manual pentesting to autonomous AI agents that re-exploit every finding to kill false positives."
readTime: "8 min read"
---

I've spent years breaking software. Seven published CVEs across node-forge, uptime-kuma, liquidjs, picomatch, and jspdf. The pattern was always the same: find a vulnerability, write the proof of concept, write the report. Repeat.

Then AI happened to security.

Suddenly every app had a chatbot. Every developer tool had an AI copilot. MCP servers started popping up everywhere, exposing tool schemas that nobody was auditing. Companies were shipping AI features as fast as they could, and the attack surface was growing faster than anyone could manually test.

## The problem I kept hitting

When I started doing AI security assessments, the tooling was... not there. The options were:

- **promptfoo** for red-teaming LLM outputs. Good for eval, but it's a test runner, not a pentester. No verification, no proof of exploit.
- **garak** for LLM probing. Solid attack coverage, but Python-heavy setup and no MCP or supply chain coverage.
- **semgrep + nuclei** for traditional scanning. Can't see AI-specific attack surfaces at all.

None of them did what I actually needed: scan an AI endpoint, attack it systematically, *verify* that the findings are real, and give me a report I could hand to a client. I was stitching together 4-5 tools for every engagement and still writing manual PoCs for every finding.

## The insight: attackers verify, tools don't

The biggest waste of time in security isn't finding vulnerabilities. It's triaging false positives. Every scanner I've used produces a mountain of "possible" findings that turn out to be nothing. You spend 80% of your time proving that things *aren't* broken.

Real attackers don't have this problem. They try to exploit something. If it works, it's real. If it doesn't, they move on. That's the workflow I wanted to automate.

## Autonomous agents, one pipeline

pwnkit runs autonomous agents in sequence, each specialized for a phase:

<div class="grid grid-cols-3 gap-4 my-8">
  <div class="bg-night-lighter border border-white/5 rounded-lg p-4">
    <div class="text-xs font-mono text-emerald-400 mb-1">01 Research</div>
    <p class="text-sm text-smoke m-0">Maps the attack surface, crafts payloads, launches multi-turn attacks, and writes PoC code &mdash; all in one agent session.</p>
  </div>
  <div class="bg-night-lighter border border-white/5 rounded-lg p-4">
    <div class="text-xs font-mono text-blue-400 mb-1">02 Verify</div>
    <p class="text-sm text-smoke m-0">Blind verification &mdash; gets ONLY the PoC and file path, independently reproduces each finding. Can't reproduce? Killed.</p>
  </div>
  <div class="bg-night-lighter border border-white/5 rounded-lg p-4">
    <div class="text-xs font-mono text-purple-400 mb-1">03 Report</div>
    <p class="text-sm text-smoke m-0">SARIF for GitHub Security tab. Markdown and JSON with full evidence chains. Only confirmed findings.</p>
  </div>
</div>

The verification agent is what makes this different. It doesn't trust the attack agent's output. It independently re-exploits each finding, captures proof artifacts, and assigns a confidence score. If a "prompt injection" only works with a contrived input that a real user would never send, it gets flagged and downgraded.

### Blind Verification

Most security tools report everything that "might" be a bug. pwnkit does something different.

After the research agent finds a vulnerability and writes a proof-of-concept, a separate verify agent gets ONLY the PoC code and the file path &mdash; not the reasoning. It independently traces the data flow and tries to reproduce the finding.

If it can't reproduce &rarr; the finding is killed. No false positives in the report.

This is the same principle as double-blind peer review: the reviewer doesn't know the researcher's reasoning, so they can't be biased by it.

## Not just LLMs

AI security isn't just about prompt injection. The attack surface includes:

- **LLM endpoints** &mdash; ChatGPT, Claude, Llama APIs, custom chatbots
- **MCP servers** &mdash; tool schemas, validation, auth, poisoning vectors
- **npm packages** &mdash; supply chain attacks, malicious code, dependency risk
- **Source code** &mdash; AI-powered deep security review of any repo
- **Web apps** &mdash; AI copilots, RAG pipelines, agent APIs

That's why pwnkit has five commands, not one. `scan` for endpoints, `audit` for packages, `review` for source code, plus `findings` and `history` to track everything.

## Bring your own tools

pwnkit is an agentic harness &mdash; it doesn't come with its own AI model. You bring your own:

- **API mode:** Use your own API key (OpenRouter, Anthropic, OpenAI). Pay per token.
- **Claude Code CLI:** Use `--runtime claude` to run scans through your Claude Code subscription.
- **Codex CLI:** Use `--runtime codex` to run through Codex. Great for verification and code review.

The harness orchestrates the research-verify pipeline. The model does the thinking. You choose what powers it.

## Try it now

pwnkit is live on npm. No config needed. One command:

```
npx pwnkit-cli scan --target https://your-app.com/api/chat
```

It's Apache 2.0 licensed, fully open source, and I'm actively building it. If you're shipping AI features and want to know what an attacker would find, give it a shot.
