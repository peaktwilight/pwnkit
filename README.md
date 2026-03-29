<p align="center">
  <img src="assets/pwnkit-icon.gif" alt="pwnkit" width="80" />
</p>

<h1 align="center">pwnkit</h1>

<p align="center">
  <strong>General-purpose autonomous pentesting framework</strong><br/>
  <em>Scan LLM endpoints. Audit npm packages. Review source code. Pentest web apps. Re-exploit to kill false positives.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/pwnkit-cli"><img src="https://img.shields.io/npm/v/pwnkit-cli?color=crimson&style=flat-square" alt="npm version" /></a>
  <a href="https://github.com/peaktwilight/pwnkit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="license" /></a>
  <a href="https://github.com/peaktwilight/pwnkit/actions"><img src="https://img.shields.io/github/actions/workflow/status/peaktwilight/pwnkit/ci.yml?style=flat-square" alt="CI" /></a>
  <a href="https://github.com/peaktwilight/pwnkit/stargazers"><img src="https://img.shields.io/github/stars/peaktwilight/pwnkit?style=flat-square&color=gold" alt="stars" /></a>
  <a href="https://pwnkit.com"><img src="https://pwnkit.com/badge/peaktwilight/pwnkit" alt="pwnkit verified" /></a>
</p>

<p align="center">
  <img src="assets/demo.gif" alt="pwnkit Demo" width="700" />
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#commands">Commands</a> &middot;
  <a href="#how-it-works">How It Works</a> &middot;
  <a href="#what-pwnkit-scans">What It Scans</a> &middot;
  <a href="#how-it-compares">Comparison</a> &middot;
  <a href="#github-action">CI/CD</a> &middot;
  <a href="#built-by">About</a>
</p>

---

pwnkit is an open-source agentic security toolkit. Autonomous agents discover, attack, verify, and report vulnerabilities across LLM endpoints, web applications, npm packages, and Git repositories — the agents read code, craft payloads, analyze responses, and **re-exploit each finding to kill false positives**. No templates, no static rules — multi-turn agentic reasoning that thinks like an attacker.

One command. Zero config. Every finding re-exploited or dropped.

## Quick Start

```bash
# Scan an LLM endpoint
npx pwnkit-cli scan --target https://your-app.com/api/chat

# Audit an npm package for vulnerabilities
npx pwnkit-cli audit lodash

# Deep security review of a codebase
npx pwnkit-cli review ./my-ai-app

# Or just point pwnkit at a target — it auto-detects what to do
npx pwnkit-cli express          # audits npm package
npx pwnkit-cli ./my-repo        # reviews source code
npx pwnkit-cli https://github.com/user/repo  # clones and reviews
npx pwnkit-cli https://example.com           # scans web endpoint
```

That's it. pwnkit discovers your attack surface, launches targeted attacks, verifies findings, and generates a report — all in under 5 minutes.

### Auto-Detect

`pwnkit <target>` figures out what you mean without explicit subcommands:

| Input | What pwnkit does |
|-------|-----------------|
| `pwnkit express` | Treats it as an npm package name and runs `audit` |
| `pwnkit ./my-repo` | Detects a local path and runs `review` |
| `pwnkit https://github.com/user/repo` | Clones the repo and runs `review` |
| `pwnkit https://example.com` | Detects an HTTP URL and runs `scan` |

Explicit subcommands (`scan`, `audit`, `review`) still work — auto-detect is just a convenience layer on top.

## Commands

All commands are available via `npx pwnkit-cli <command>`. Explicit subcommands are optional — thanks to auto-detect, `npx pwnkit-cli <target>` works for most use cases (see [Auto-Detect](#auto-detect) above).

pwnkit ships five commands — from quick API probes to deep source-level audits:

| Command | What It Does | Example |
|---------|-------------|---------|
| **`scan`** | Probe LLM endpoints, MCP servers, and AI APIs for vulnerabilities | `npx pwnkit-cli scan --target https://api.example.com/chat` |
| **`audit`** | Install and security-audit any npm package with static analysis + AI review | `npx pwnkit-cli audit express@4.18.2` |
| **`review`** | Deep source code security review of a local repo or GitHub URL | `npx pwnkit-cli review https://github.com/user/repo` |
| **`history`** | Browse past scans with status, depth, findings count, and duration | `npx pwnkit-cli history --limit 20` |
| **`findings`** | Query, filter, and inspect verified findings across all scans | `npx pwnkit-cli findings list --severity critical` |

## How It Works

pwnkit runs autonomous AI agents in sequence. Each agent uses tools (`read_file`, `run_command`, `send_prompt`, `save_finding`) and makes multi-turn decisions — adapting its strategy based on what it learns:

```
  +-----------+     +-----------+     +-----------+     +-----------+
  | DISCOVER  | --> |  ATTACK   | --> |  VERIFY   | --> |  REPORT   |
  |  (Recon)  |     | (Offense) |     | (Confirm) |     | (Output)  |
  +-----------+     +-----------+     +-----------+     +-----------+
   Maps endpoints    Agents craft      Re-exploits       Generates SARIF,
   Model detection   payloads in       each finding       Markdown, and JSON
   System prompt     multi-turn        to kill false      with severity +
   extraction        conversations     positives          remediation
```

| Agent | Role | What It Does |
|-------|------|-------------|
| **Discover** | Recon | Maps endpoints, detects models, extracts system prompts, enumerates MCP tool schemas |
| **Attack** | Offense | Agentic multi-turn attacks: prompt injection, jailbreaks, tool poisoning, data exfiltration, encoding bypasses — agent reads responses and adapts |
| **Verify** | Validation | Re-exploits each finding independently. If it can't reproduce it, it's killed as a false positive |
| **Report** | Output | SARIF for GitHub Security tab, Markdown for humans, JSON for pipelines — with severity scores and remediation |

The **verification step is the differentiator.** No more triaging 200 "possible prompt injections" that turn out to be nothing.

## What pwnkit Scans

| Target | Command | How |
|--------|---------|-----|
| **LLM Endpoints** — ChatGPT, Claude, Llama APIs, custom chatbots | `scan --target <url>` | HTTP probing + multi-turn agent attacks |
| **MCP Servers** — Tool schemas, input validation, authorization | `scan --target <url> --mode mcp` | Connects to server, enumerates tools, tests each |
| **Web Apps & APIs** — AI-powered copilots, agents, RAG pipelines | `scan --target <url> --mode deep --repo ./src` | API probing + source code analysis |
| **Web Pentesting** — SQLi, XSS, SSRF, auth bypass, IDOR | `scan --target <url> --mode web` | Full autonomous web pentest, agents adapt per finding |
| **npm Packages** — Dependency supply chain, malicious code | `audit <package>` | Installs in sandbox, runs semgrep + AI code review |
| **Git Repositories** — Source-level security review | `review <path-or-url>` | Deep analysis with Claude Code, Codex, or Gemini CLI |

## Example Output

See the [demo GIF above](#) for real scan output, or run it yourself:

```bash
npx pwnkit-cli scan --target https://your-app.com/api/chat --depth quick
```

For a verbose view with the animated attack replay:

```bash
npx pwnkit-cli scan --target https://your-app.com/api/chat --verbose
```

## Scan Depth

| Depth | Test Cases | Time |
|-------|-----------|------|
| `quick` | ~15 | ~1 min |
| `default` | ~50 | ~3 min |
| `deep` | ~150 | ~10 min |

pwnkit is an agentic harness — bring your own AI. Use your API key (OpenRouter, Anthropic, OpenAI, Ollama), or use the Claude Code CLI or Codex CLI with your existing subscription via `--runtime claude` or `--runtime codex`.

```bash
# Quick scan for CI
npx pwnkit-cli scan --target https://api.example.com/chat --depth quick

# Deep audit before launch
npx pwnkit-cli scan --target https://api.example.com/chat --depth deep

# Source + API scan with Claude Code
npx pwnkit-cli scan --target https://api.example.com/chat --runtime claude --mode deep --repo ./src

# MCP server audit
npx pwnkit-cli scan --target https://mcp-server.example.com --mode mcp --runtime claude

# Full web pentest (SQLi, XSS, SSRF, auth bypass, IDOR)
npx pwnkit-cli scan --target https://example.com --mode web --runtime claude

# Audit an npm package
npx pwnkit-cli audit react --depth deep --runtime claude

# Review a GitHub repo
npx pwnkit-cli review https://github.com/user/repo --runtime codex --depth deep
```

## Runtime Modes

Bring your own agent CLI — pwnkit orchestrates it:

| Runtime | Flag | Best For |
|---------|------|----------|
| `api` | `--runtime api` | CI, quick scans — uses OpenRouter by default (`claude-sonnet-4.6`), no dependencies (default) |
| `claude` | `--runtime claude` | Attack generation, deep analysis — spawns Claude Code CLI |
| `codex` | `--runtime codex` | Verification, source analysis — spawns Codex CLI |
| `gemini` | `--runtime gemini` | Large context source analysis — spawns Gemini CLI |
| `opencode` | `--runtime opencode` | Multi-provider flexibility — spawns OpenCode CLI |
| `auto` | `--runtime auto` | Best overall — auto-detects installed runtimes, picks best per stage |

Combined with scan modes:

| Mode | Flag | Description |
|------|------|-------------|
| `probe` | `--mode probe` | Send payloads to API, check responses (default) |
| `deep` | `--mode deep` | API probing + source code audit (requires `--repo`) |
| `mcp` | `--mode mcp` | Connect to MCP server, enumerate tools, test each for security issues |
| `web` | `--mode web` | Full web pentesting — SQLi, XSS, SSRF, auth bypass, IDOR |

> `deep`, `mcp`, and `web` modes require a process runtime (`claude`, `codex`, `gemini`, `opencode`, or `auto`).

## How It Compares

| Feature | pwnkit | promptfoo | garak | semgrep | nuclei |
|---------|--------|-----------|-------|---------|--------|
| **Agentic multi-turn pipeline** | Yes — Autonomous agents with tool use | No — Single runner | No — Single runner | No — Rule-based | No — Template runner |
| **Verification (no false positives)** | Yes — Re-exploits to confirm | No | No | No | No |
| **LLM endpoint scanning** | Yes — Prompt injection, jailbreaks, exfil | Yes — Red-teaming | Yes — Probes | No | No |
| **Web pentesting (SQLi, XSS, SSRF, IDOR)** | Yes — `--mode web` | No | No | No | Partial — Templates only |
| **MCP server security** | Yes — Tool poisoning, schema abuse | No | No | No | No |
| **npm package audit** | Yes — Semgrep + AI review | No | No | Yes — Rules only | No |
| **Source code review** | Yes — AI-powered deep analysis | No | No | Yes — Rules only | No |
| **OWASP LLM Top 10** | Yes — 8/10 covered | Partial | Partial | N/A | N/A |
| **SARIF + GitHub Security tab** | Yes | Yes | No | Yes | Yes |
| **One command, zero config** | Yes — `npx pwnkit-cli scan` | Needs YAML config | Needs Python setup | Needs rules config | Needs templates |
| **Open source** | Yes — Apache-2.0 | Yes — (acquired by OpenAI) | Yes — MIT | Yes — LGPL / Paid Pro | Yes — MIT |
| **Pricing** | Free + bring your own AI | Varies | Free (local) | Free (OSS) / Paid (Pro) | Free |

pwnkit isn't replacing semgrep or nuclei — it covers the AI-specific attack surface they can't see. Use them together.

## GitHub Action

Add pwnkit to your CI/CD pipeline:

```yaml
name: AI Security Scan
on: [push, pull_request]

permissions:
  contents: read
  security-events: write

jobs:
  pwnkit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run pwnkit
        uses: peaktwilight/pwnkit/action@v1
        with:
          target: ${{ secrets.STAGING_API_URL }}
          depth: default  # quick | default | deep
          fail-on-severity: high  # critical | high | medium | low | info | none
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: pwnkit-report/report.sarif
```

> **API Key Priority:** pwnkit checks for `OPENROUTER_API_KEY` first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. OpenRouter gives you access to many models (including free ones) through a single key at [openrouter.ai](https://openrouter.ai).

Findings show up directly in the **Security** tab of your repository.

### Badge

Add a pwnkit badge to your README:

```markdown
[![pwnkit](https://pwnkit.com/badge/YOUR_ORG/YOUR_REPO)](https://pwnkit.com)
```

The badge auto-updates from your GitHub Actions scan results. Shows `verified` (green), finding counts (yellow/red), or `not scanned` (gray).

Also available as a [shields.io endpoint](https://shields.io/endpoint):
```
https://img.shields.io/endpoint?url=https://pwnkit.com/badge/YOUR_ORG/YOUR_REPO/shield
```

## Findings Management

Every finding is persisted in a local SQLite database. Query across scans:

```bash
# List critical findings
npx pwnkit-cli findings list --severity critical

# Filter by category
npx pwnkit-cli findings list --category prompt-injection --status confirmed

# Inspect a specific finding with full evidence
npx pwnkit-cli findings show NF-001

# Browse scan history
npx pwnkit-cli history --limit 10
```

Finding lifecycle: `discovered → verified → confirmed → scored → reported` (or `false-positive` if verification fails).

## Roadmap

- [x] Core autonomous agent pipeline (discover, attack, verify, report)
- [x] OWASP LLM Top 10 coverage (8/10)
- [x] SARIF output + GitHub Action
- [x] MCP server scanning
- [x] npm package auditing
- [x] Source code review (local + GitHub)
- [x] Multi-runtime support (Claude, Codex, Gemini, OpenCode)
- [x] Multi-turn agentic attacks (agents adapt payloads based on responses)
- [x] Web pentesting mode (SQLi, XSS, SSRF, auth bypass, IDOR)
- [ ] RAG pipeline security (poisoning, extraction)
- [ ] Agentic workflow testing (multi-tool chains)
- [ ] VS Code extension
- [ ] Team dashboard & historical tracking
- [ ] SOC 2 / compliance report generation

## Built By

Created by a security researcher with [7 published CVEs](https://doruk.ch/blog) across node-forge, mysql2, uptime-kuma, liquidjs, picomatch, and jspdf.

pwnkit is a general-purpose autonomous pentesting framework. It exists because modern attack surfaces — LLM endpoints, MCP servers, AI-powered web apps — require agents that adapt, not static rules that don't. You can't `nmap` a language model. You can't write a rule for a jailbreak that hasn't been invented yet. And traditional web scanners don't understand context — they miss IDOR in paginated APIs and SSRF buried in AI pipeline callbacks.

pwnkit uses autonomous agents that think like attackers, adapt their strategy mid-scan, and re-exploit every finding before reporting it. The result: real vulnerabilities, zero noise.

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/peaktwilight/pwnkit.git
cd pwnkit
pnpm install
pnpm test
```

## License

[Apache 2.0](LICENSE) — use it, fork it, ship it.
