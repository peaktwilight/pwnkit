<p align="center">
  <img src="assets/nightfang-icon.gif" alt="Nightfang" width="80" />
</p>

<h1 align="center">Nightfang</h1>

<p align="center">
  <strong>Security research automation for the AI era</strong><br/>
  <em>Scan LLM endpoints. Audit npm packages. Review source code. Prove every finding is real.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nightfang"><img src="https://img.shields.io/npm/v/nightfang?color=crimson&style=flat-square" alt="npm version" /></a>
  <a href="https://github.com/peaktwilight/nightfang/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license" /></a>
  <a href="https://github.com/peaktwilight/nightfang/actions"><img src="https://img.shields.io/github/actions/workflow/status/peaktwilight/nightfang/ci.yml?style=flat-square" alt="CI" /></a>
  <a href="https://github.com/peaktwilight/nightfang/stargazers"><img src="https://img.shields.io/github/stars/peaktwilight/nightfang?style=flat-square&color=gold" alt="stars" /></a>
  <a href="https://github.com/peaktwilight/nightfang/actions/workflows/self-scan.yml"><img src="https://nightfang.dev/badge/peaktwilight/nightfang" alt="nightfang verified" /></a>
</p>

<p align="center">
  <img src="assets/demo.gif" alt="Nightfang Demo" width="700" />
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#commands">Commands</a> &middot;
  <a href="#how-it-works">How It Works</a> &middot;
  <a href="#what-nightfang-scans">What It Scans</a> &middot;
  <a href="#how-it-compares">Comparison</a> &middot;
  <a href="#github-action">CI/CD</a> &middot;
  <a href="#built-by">About</a>
</p>

---

Nightfang is an open-source pentesting toolkit that combines four autonomous AI agents with a template-driven attack engine. Point it at an API, an npm package, or a Git repo — it discovers vulnerabilities, attacks them, **re-exploits each finding to eliminate false positives**, and generates SARIF reports that plug straight into GitHub's Security tab.

One command. Zero config. Every finding verified with proof.

## Quick Start

```bash
# Scan an LLM endpoint
npx nightfang scan --target https://your-app.com/api/chat

# Audit an npm package for vulnerabilities
npx nightfang audit lodash

# Deep security review of a codebase
npx nightfang review ./my-ai-app
```

That's it. Nightfang discovers your attack surface, launches targeted attacks, verifies findings, and generates a report — all in under 5 minutes.

## Commands

Nightfang ships five commands — from quick API probes to deep source-level audits:

| Command | What It Does | Example |
|---------|-------------|---------|
| **`scan`** | Probe LLM endpoints, MCP servers, and AI APIs for vulnerabilities | `npx nightfang scan --target https://api.example.com/chat` |
| **`audit`** | Install and security-audit any npm package with static analysis + AI review | `npx nightfang audit express@4.18.2` |
| **`review`** | Deep source code security review of a local repo or GitHub URL | `npx nightfang review https://github.com/user/repo` |
| **`history`** | Browse past scans with status, depth, findings count, and duration | `npx nightfang history --limit 20` |
| **`findings`** | Query, filter, and inspect verified findings across all scans | `npx nightfang findings list --severity critical` |

## How It Works

Nightfang runs four specialized AI agents in sequence. Each agent builds on the previous one's output:

```
  +-----------+     +-----------+     +-----------+     +-----------+
  | DISCOVER  | --> |  ATTACK   | --> |  VERIFY   | --> |  REPORT   |
  |  (Recon)  |     | (Offense) |     | (Confirm) |     | (Output)  |
  +-----------+     +-----------+     +-----------+     +-----------+
   Maps endpoints    Runs 47+ test    Re-exploits       Generates SARIF,
   Model detection   cases across     each finding       Markdown, and JSON
   System prompt     7 categories     to kill false      with severity +
   extraction        of attacks       positives          remediation
```

| Agent | Role | What It Does |
|-------|------|-------------|
| **Discover** | Recon | Maps endpoints, detects models, extracts system prompts, enumerates MCP tool schemas |
| **Attack** | Offense | Prompt injection, jailbreaks, tool poisoning, data exfiltration, encoding bypasses — 12 attack templates, 7 categories |
| **Verify** | Validation | Re-exploits each finding independently. If it can't reproduce it, it's killed as a false positive |
| **Report** | Output | SARIF for GitHub Security tab, Markdown for humans, JSON for pipelines — with severity scores and remediation |

The **verification step is the differentiator.** No more triaging 200 "possible prompt injections" that turn out to be nothing.

## What Nightfang Scans

| Target | Command | How |
|--------|---------|-----|
| **LLM Endpoints** — ChatGPT, Claude, Llama APIs, custom chatbots | `scan --target <url>` | HTTP probing + multi-turn agent attacks |
| **MCP Servers** — Tool schemas, input validation, authorization | `scan --target <url> --mode mcp` | Connects to server, enumerates tools, tests each |
| **Web Apps & APIs** — AI-powered copilots, agents, RAG pipelines | `scan --target <url> --mode deep --repo ./src` | API probing + source code analysis |
| **npm Packages** — Dependency supply chain, malicious code | `audit <package>` | Installs in sandbox, runs semgrep + AI code review |
| **Git Repositories** — Source-level security review | `review <path-or-url>` | Deep analysis with Claude Code, Codex, or Gemini CLI |

### OWASP LLM Top 10 Coverage

| # | Category | Status |
|---|----------|--------|
| LLM01 | Prompt Injection | :white_check_mark: Direct + indirect + encoding bypass |
| LLM02 | Insecure Output Handling | :white_check_mark: XSS, code exec via output |
| LLM03 | Training Data Poisoning | :construction: Detection only |
| LLM04 | Model Denial of Service | :white_check_mark: Resource exhaustion probes |
| LLM05 | Supply Chain Vulnerabilities | :white_check_mark: MCP tool poisoning, npm audit, dependency confusion |
| LLM06 | Sensitive Information Disclosure | :white_check_mark: PII/secret extraction |
| LLM07 | Insecure Plugin Design | :white_check_mark: Tool schema abuse, SSRF via tools |
| LLM08 | Excessive Agency | :white_check_mark: Privilege escalation, unauthorized actions |
| LLM09 | Overreliance | :construction: Hallucination-based trust attacks |
| LLM10 | Model Theft | :white_check_mark: Model extraction, prompt theft |

## Example Output

See the [demo GIF above](#) for real scan output, or run it yourself:

```bash
npx nightfang scan --target https://your-app.com/api/chat --depth quick
```

For a verbose view with the animated attack replay:

```bash
npx nightfang scan --target https://your-app.com/api/chat --verbose
```

## Scan Depth & Cost

| Depth | Test Cases | Time | Estimated Cost |
|-------|-----------|------|----------------|
| `quick` | ~15 | ~1 min | $0.05–$0.15 |
| `default` | ~50 | ~3 min | $0.15–$0.50 |
| `deep` | ~150 | ~10 min | $0.50–$1.00 |

Cost depends on the LLM provider you configure. Nightfang supports OpenAI, Anthropic, and local models via Ollama.

```bash
# Quick scan for CI
npx nightfang scan --target https://api.example.com/chat --depth quick

# Deep audit before launch
npx nightfang scan --target https://api.example.com/chat --depth deep

# Source + API scan with Claude Code
npx nightfang scan --target https://api.example.com/chat --runtime claude --mode deep --repo ./src

# MCP server audit
npx nightfang scan --target https://mcp-server.example.com --mode mcp --runtime claude

# Audit an npm package
npx nightfang audit react --depth deep --runtime claude

# Review a GitHub repo
npx nightfang review https://github.com/user/repo --runtime codex --depth deep
```

## Runtime Modes

Bring your own agent CLI — Nightfang orchestrates it:

| Runtime | Flag | Best For |
|---------|------|----------|
| `api` | `--runtime api` | CI, quick scans — fast, cheap, no dependencies (default) |
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

> `deep` and `mcp` modes require a process runtime (`claude`, `codex`, `gemini`, `opencode`, or `auto`).

## How It Compares

| Feature | Nightfang | promptfoo | garak | semgrep | nuclei |
|---------|-----------|-----------|-------|---------|--------|
| **Autonomous multi-agent pipeline** | :white_check_mark: 4 specialized agents | :x: Single runner | :x: Single runner | :x: Rule-based | :x: Template runner |
| **Verification (no false positives)** | :white_check_mark: Re-exploits to confirm | :x: | :x: | :x: | :x: |
| **LLM endpoint scanning** | :white_check_mark: Prompt injection, jailbreaks, exfil | :white_check_mark: Red-teaming | :white_check_mark: Probes | :x: | :x: |
| **MCP server security** | :white_check_mark: Tool poisoning, schema abuse | :x: | :x: | :x: | :x: |
| **npm package audit** | :white_check_mark: Semgrep + AI review | :x: | :x: | :white_check_mark: Rules only | :x: |
| **Source code review** | :white_check_mark: AI-powered deep analysis | :x: | :x: | :white_check_mark: Rules only | :x: |
| **OWASP LLM Top 10** | :white_check_mark: 8/10 covered | Partial | Partial | N/A | N/A |
| **SARIF + GitHub Security tab** | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: | :white_check_mark: |
| **One command, zero config** | :white_check_mark: `npx nightfang scan` | Needs YAML config | Needs Python setup | Needs rules config | Needs templates |
| **Open source** | :white_check_mark: MIT | :white_check_mark: (acquired by OpenAI) | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Cost per scan** | $0.05–$1.00 | Varies | Free (local) | Free (OSS) / Paid (Pro) | Free |

Nightfang isn't replacing semgrep or nuclei — it covers the AI-specific attack surface they can't see. Use them together.

## GitHub Action

Add Nightfang to your CI/CD pipeline:

```yaml
name: AI Security Scan
on: [push, pull_request]

permissions:
  contents: read
  security-events: write

jobs:
  nightfang:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Nightfang
        uses: peaktwilight/nightfang/action@v1
        with:
          target: ${{ secrets.STAGING_API_URL }}
          depth: default  # quick | default | deep
          fail-on-severity: high  # critical | high | medium | low | info | none
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: nightfang-report/report.sarif
```

> **API Key Priority:** Nightfang checks for `OPENROUTER_API_KEY` first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. OpenRouter gives you access to many models (including free ones) through a single key at [openrouter.ai](https://openrouter.ai).

Findings show up directly in the **Security** tab of your repository.

### Badge

Add a Nightfang badge to your README:

```markdown
[![nightfang](https://nightfang.dev/badge/YOUR_ORG/YOUR_REPO)](https://github.com/YOUR_ORG/YOUR_REPO/actions)
```

The badge auto-updates from your GitHub Actions scan results. Shows `verified` (green), finding counts (yellow/red), or `not scanned` (gray).

Also available as a [shields.io endpoint](https://shields.io/endpoint):
```
https://img.shields.io/endpoint?url=https://nightfang.dev/badge/YOUR_ORG/YOUR_REPO/shield
```

## Findings Management

Every finding is persisted in a local SQLite database. Query across scans:

```bash
# List critical findings
npx nightfang findings list --severity critical

# Filter by category
npx nightfang findings list --category prompt-injection --status confirmed

# Inspect a specific finding with full evidence
npx nightfang findings show NF-001

# Browse scan history
npx nightfang history --limit 10
```

Finding lifecycle: `discovered → verified → confirmed → scored → reported` (or `false-positive` if verification fails).

## Roadmap

- [x] Core 4-agent pipeline (discover, attack, verify, report)
- [x] OWASP LLM Top 10 coverage (8/10)
- [x] SARIF output + GitHub Action
- [x] MCP server scanning
- [x] npm package auditing
- [x] Source code review (local + GitHub)
- [x] Multi-runtime support (Claude, Codex, Gemini, OpenCode)
- [ ] Multi-turn conversation attacks
- [ ] RAG pipeline security (poisoning, extraction)
- [ ] Agentic workflow testing (multi-tool chains)
- [ ] VS Code extension
- [ ] Team dashboard & historical tracking
- [ ] SOC 2 / compliance report generation

## Built By

Created by a security researcher with [7 published CVEs](https://doruk.ch/blog) across node-forge, mysql2, uptime-kuma, liquidjs, picomatch, and jspdf.

Nightfang exists because traditional security tools can't see AI attack surfaces. You can't `nmap` a language model. You can't write a static rule for a jailbreak that hasn't been invented yet. You need agents that think like attackers — and then prove what they find.

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/peaktwilight/nightfang.git
cd nightfang
pnpm install
pnpm test
```

## License

[MIT](LICENSE) — use it, fork it, ship it.
