# Nightfang Launch Thread (Twitter/X)

## Tweet 1 (Hook)
I used Claude Opus to find 7 CVEs in projects with 500M+ combined downloads.

node-forge. uptime-kuma. liquidjs. picomatch. jspdf.

Today I'm open-sourcing the framework that made it possible.

Meet Nightfang.

## Tweet 2 (The Story)
Here's what happened:

I pointed Claude Opus at npm packages I use daily. Within hours, it found vulnerabilities that had been sitting in production for years.

Not theoretical. Real CVEs. Assigned, disclosed, patched.

Full writeups: doruk.ch/blog

## Tweet 3 (The Insight)
The interesting part wasn't that AI found bugs.

It's that it found bugs *traditional scanners missed*.

You can't write a static rule for every edge case. But an LLM that reads code like a researcher — pattern-matching across thousands of packages it's been trained on — sees things differently.

## Tweet 4 (From Manual to Framework)
So I turned my manual workflow into a framework.

Four agents, each specialized:

1. DISCOVER — maps attack surface, extracts system prompts, enumerates MCP tools
2. ATTACK — 47+ test cases across OWASP LLM Top 10
3. VERIFY — re-exploits every finding. Can't reproduce? Killed as false positive.
4. REPORT — SARIF for GitHub Security tab

## Tweet 5 (Why Verification Matters)
The verify step is the whole point.

Every other tool gives you 200 "possible vulnerabilities" and hopes you triage them.

Nightfang re-exploits each finding independently. If it can't prove it's real, it drops it.

Zero false positives. Every finding comes with proof.

## Tweet 6 (Not Just LLMs)
It's not just for LLM endpoints. Five commands, five attack surfaces:

- scan → LLM APIs + MCP servers
- audit → npm packages (found the CVEs this way)
- review → source code (any repo, local or GitHub)
- findings → query verified results
- history → track scans over time

## Tweet 7 (Industry Context)
This isn't a toy. Stripe just published their Minions paper — running 1000s of AI agents on internal tasks.

AI agents at scale are the future. But with scale comes attack surface.

If companies are deploying thousands of agents, someone needs to be testing them. That's what Nightfang does.

## Tweet 8 (promptfoo Comparison)
"What about promptfoo?"

Promptfoo was acquired by OpenAI. It's a red-teaming test runner — good for what it does.

Nightfang is different:
- Multi-agent pipeline, not a single runner
- Verification eliminates false positives
- Also covers npm packages and source code
- MIT licensed. No corporate parent.

## Tweet 9 (Cost + Speed)
AI security tools have a cost problem. Most charge $50+ per assessment.

Nightfang CI scans: $0.05, under 1 minute.
Default scans: $0.15, 3 minutes.
Deep audits: $1.00, 10 minutes.

Runs on OpenAI, Anthropic, Ollama, or bring your own agent CLI.

## Tweet 10 (CTA)
Try it now — zero config:

npx nightfang scan --target https://your-app.com/api/chat
npx nightfang audit lodash
npx nightfang review ./my-ai-app

MIT licensed. v0.1.0 on npm.

GitHub: github.com/peaktwilight/nightfang
Website: nightfang.dev
Full CVE writeups: doruk.ch/blog

Star it, try it, break it.
