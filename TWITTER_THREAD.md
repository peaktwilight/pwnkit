# Nightfang Launch Thread (Twitter/X)

## Tweet 1 (Hook)
I used Claude Opus to find 7 CVEs in packages with 40M+ weekly downloads.

node-forge (32M/week) — certificate forgery
mysql2 (5M/week) — 4 vulnerabilities chained
Uptime Kuma / LiquidJS — SSTI bypass
jsPDF — PDF injection + XSS (CVSS 9.6)
picomatch — ReDoS

Today I'm open-sourcing the framework that found them.

## Tweet 2 (The Story)
Three weeks ago I started a weekend project: can Claude Opus systematically audit npm packages the way a security researcher would?

Not linting. Actually reading source code, tracing data flows, finding trust boundary violations, writing working PoCs.

73 findings. 7 CVEs. 40M+ weekly downloads affected.

## Tweet 3 (The node-forge Bug)
The node-forge finding shows why this works.

32 million weekly downloads. A billion per year. The certificate chain verification had a conditional that only checked basicConstraints when the extension was present.

When absent — normal for end-entity certs — any certificate could act as a CA.

One missing conditional. Certificate forgery for any domain.

## Tweet 4 (Why AI Finds What Scanners Miss)
None of these bugs were sophisticated.

A missing conditional check. An unfiltered URL parameter. A fallback path with no validation. String concatenation where there should be DOM construction.

Traditional scanners can't write rules for these. But an LLM that reads code like a researcher — tracing every input, checking every assumption — finds them through thoroughness, not cleverness.

## Tweet 5 (From Manual to Framework)
So I turned my workflow into a framework. Four agents, each specialized:

1. DISCOVER — maps endpoints, extracts system prompts, enumerates MCP tools
2. ATTACK — 47+ test cases across OWASP LLM Top 10
3. VERIFY — re-exploits every finding. Can't reproduce? Killed.
4. REPORT — SARIF for GitHub Security tab

The verify step is the differentiator.

## Tweet 6 (Verification = Zero False Positives)
Every other tool gives you 200 "possible vulnerabilities" and hopes you triage them.

Nightfang re-exploits each finding independently. Working exploit or it doesn't count.

The 7 CVEs were found this way. Every single one verified with a working PoC before disclosure.

That's the standard. Not "might be a problem." Proof.

## Tweet 7 (Five Attack Surfaces)
It's not just LLM endpoints. Five commands:

- scan → LLM APIs + MCP servers
- audit → npm packages (this is how I found the CVEs)
- review → source code (any repo, local or GitHub)
- findings → query verified results
- history → track scans over time

One toolkit. Full coverage.

## Tweet 8 (Industry Context)
Stripe just published their Minions paper — running 1000s of AI agents on internal tasks.

AI agents at scale are the future. But with scale comes attack surface nobody's testing.

If companies are deploying thousands of agents, someone needs to pentest them. Nightfang automates that.

## Tweet 9 (vs. promptfoo)
"What about promptfoo?"

Promptfoo was acquired by OpenAI. It's a red-teaming test runner.

Nightfang is different:
- Multi-agent pipeline with verification (not a single runner)
- Also audits npm packages and reviews source code
- Verification eliminates false positives
- MIT licensed, no corporate parent

## Tweet 10 (Cost)
AI security tools have a cost problem. Most charge $50+ per assessment.

Nightfang CI scans: $0.05, under 1 minute.
Default scans: $0.15, 3 minutes.
Deep audits: $1.00, 10 minutes.

Runs on OpenAI, Anthropic, Ollama. Bring your own agent CLI.

## Tweet 11 (CTA)
Try it now — zero config:

npx nightfang scan --target https://your-app.com/api/chat
npx nightfang audit lodash
npx nightfang review ./my-ai-app

MIT licensed. v0.1.0 on npm.

GitHub: github.com/peaktwilight/nightfang
Website: nightfang.dev
Full CVE writeups: doruk.ch/blog

Star it, try it, break it.
