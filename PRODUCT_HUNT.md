# Product Hunt Launch Draft

## Name
Nightfang

## Tagline
Open-source AI agents that pentest your AI apps before attackers do

## Description
Nightfang is an open-source CLI pentesting toolkit powered by four autonomous AI agents. One command scans your AI endpoints, MCP servers, npm packages, and source code for security vulnerabilities — then proves every finding is exploitable.

Built by a security researcher with 7 published CVEs (node-forge, uptime-kuma, liquidjs, picomatch, jspdf), Nightfang automates the pentesting workflow that used to take hours of manual work.

### Key Features
- **Four-agent pipeline** — Discover, Attack, Verify, Report. Each agent is specialized for a phase of the security audit.
- **Zero false positives** — The verification agent re-exploits every finding independently with proof before it hits the report.
- **Five attack surfaces** — LLM endpoints, MCP servers, npm packages, source code, and web apps.
- **8/10 OWASP LLM Top 10** — The most comprehensive open-source AI security coverage available.
- **CI/CD ready** — Quick scans in under 1 minute for $0.05. SARIF output for GitHub Security tab.
- **Zero config** — `npx nightfang scan --target <url>` and you're running.

### How It Compares
- vs. promptfoo: Multi-agent pipeline with verification, not a single test runner. Also covers packages and source code.
- vs. garak: Adds MCP server scanning, npm auditing, source review, and false positive elimination.
- vs. semgrep/nuclei: Sees AI-specific attack surfaces they can't.

## Topics
- Security
- Open Source
- Artificial Intelligence
- Developer Tools
- CLI Tools

## Links
- Website: https://nightfang.dev
- GitHub: https://github.com/peaktwilight/nightfang
- npm: https://www.npmjs.com/package/nightfang

## Pricing
Free (MIT License). LLM API costs: $0.05-$1.00 per scan depending on depth.

## First Comment (Maker's Comment)
Hey Product Hunt! I'm the creator of Nightfang.

I've spent years as a security researcher, publishing 7 CVEs and building tools like OpenSOAR and PhishMind. When AI apps started shipping everywhere, I realized the security tooling wasn't keeping up — you can't nmap a language model.

So I built the tool I wished I had: four AI agents that work together to discover, attack, verify, and report on vulnerabilities in AI applications. The key insight is verification — every finding is re-exploited with proof before it's reported, so you get zero false positives.

It's MIT licensed, fully open source, and works with OpenAI, Anthropic, Ollama, or any agent CLI. Try it with `npx nightfang scan --target <your-api>`.

Would love your feedback. PRs and issues welcome on GitHub!
