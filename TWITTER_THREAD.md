# Nightfang Launch Thread (Twitter/X)

## Tweet 1 (Hook)
I've published 7 CVEs across node-forge, uptime-kuma, liquidjs, picomatch, and jspdf.

Today I'm open-sourcing the tool I built to automate my own pentesting workflow.

Meet Nightfang — four AI agents that pentest your AI apps before attackers do.

npx nightfang scan --target <url>

## Tweet 2 (The Problem)
Every AI app shipping today has an attack surface traditional scanners can't see.

You can't nmap a language model. You can't write a static rule for a jailbreak that hasn't been invented yet.

I needed a tool that thinks like an attacker — and proves what it finds.

## Tweet 3 (How It Works)
Nightfang runs 4 agents in sequence:

1. DISCOVER — maps endpoints, system prompts, MCP tools
2. ATTACK — 47+ test cases across OWASP LLM Top 10
3. VERIFY — re-exploits every finding to kill false positives
4. REPORT — SARIF for GitHub Security tab

The verify step is what makes it different.

## Tweet 4 (Five Attack Surfaces)
It's not just LLM endpoints. Five commands, five attack surfaces:

- scan → LLM APIs + MCP servers
- audit → npm packages (supply chain)
- review → source code (any repo)
- findings → query verified results
- history → track scans over time

One toolkit. Full coverage.

## Tweet 5 (Cost)
AI-powered security tools have a cost problem. Most burn $50+ per scan.

Nightfang CI scans: $0.05, under 1 minute.
Default scans: $0.15, 3 minutes.
Deep audits: $1.00, 10 minutes.

Cheaper than one hour of manual pentesting. Runs on every push.

## Tweet 6 (Demo / Try It)
Try it right now — zero config:

npx nightfang scan --target https://your-app.com/api/chat
npx nightfang audit lodash
npx nightfang review ./my-ai-app

Works with OpenAI, Anthropic, Ollama, Claude Code, Codex, Gemini CLI.

## Tweet 7 (CTA)
Nightfang is:
- MIT licensed
- Live on npm (v0.1.0)
- Zero config (just npx)
- 8/10 OWASP LLM Top 10 coverage

GitHub: github.com/peaktwilight/nightfang
Website: nightfang.dev
npm: npmjs.com/package/nightfang

Star it, try it, break it. PRs welcome.
