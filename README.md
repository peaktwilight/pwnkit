<p align="center">
  <!-- TODO: Replace with actual logo -->
  <img src="assets/nightfang-logo.png" alt="Nightfang" width="200" />
  <br />
  <strong>Nightfang</strong>
  <br />
  <em>AI agents that hack your AI before attackers do</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nightfang"><img src="https://img.shields.io/npm/v/nightfang?color=crimson&style=flat-square" alt="npm version" /></a>
  <a href="https://github.com/peaktwilight/nightfang/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license" /></a>
  <a href="https://github.com/peaktwilight/nightfang/actions"><img src="https://img.shields.io/github/actions/workflow/status/peaktwilight/nightfang/ci.yml?style=flat-square" alt="CI" /></a>
  <a href="https://github.com/peaktwilight/nightfang/stargazers"><img src="https://img.shields.io/github/stars/peaktwilight/nightfang?style=flat-square&color=gold" alt="stars" /></a>
</p>

<p align="center">
  Security research automation for the AI era.<br/>
  Four autonomous agents probe your LLM apps, MCP servers, and AI pipelines for real vulnerabilities — then prove they're exploitable.
</p>

---

## Quick Start

```bash
npx nightfang scan --target https://your-app.com/api/chat
```

That's it. One command. Nightfang discovers your attack surface, launches targeted attacks, verifies findings, and generates a report — all in under 5 minutes.

## What Nightfang Does

Nightfang runs four specialized AI agents in sequence:

| Agent | Role | What It Does |
|-------|------|-------------|
| **Discover** | Recon | Maps endpoints, model cards, system prompts, MCP tool schemas, auth flows |
| **Attack** | Offense | Runs prompt injection, jailbreaks, tool poisoning, data exfiltration, and more |
| **Verify** | Validation | Re-exploits each finding to eliminate false positives, captures proof |
| **Report** | Output | Generates SARIF, Markdown, and JSON reports with severity + remediation |

### OWASP LLM Top 10 Coverage

| # | Category | Status |
|---|----------|--------|
| LLM01 | Prompt Injection | :white_check_mark: Direct + indirect |
| LLM02 | Insecure Output Handling | :white_check_mark: XSS, code exec via output |
| LLM03 | Training Data Poisoning | :construction: Detection only |
| LLM04 | Model Denial of Service | :white_check_mark: Resource exhaustion probes |
| LLM05 | Supply Chain Vulnerabilities | :white_check_mark: MCP tool poisoning, dependency confusion |
| LLM06 | Sensitive Information Disclosure | :white_check_mark: PII/secret extraction |
| LLM07 | Insecure Plugin Design | :white_check_mark: Tool schema abuse, SSRF via tools |
| LLM08 | Excessive Agency | :white_check_mark: Privilege escalation, unauthorized actions |
| LLM09 | Overreliance | :construction: Hallucination-based trust attacks |
| LLM10 | Model Theft | :white_check_mark: Model extraction, prompt theft |

## Example Output

```
$ npx nightfang scan --target https://demo.app/api/chat

  ◼ nightfang v0.1.0
  ◼ Target: https://demo.app/api/chat

  ▸ Discover  Found 3 endpoints, 2 MCP tools, system prompt extracted
  ▸ Attack    Ran 47 test cases across 6 categories
  ▸ Verify    Confirmed 4 of 7 findings (3 false positives eliminated)
  ▸ Report    Written to ./nightfang-report/

  ┌─────────────────────────────────────────────────────────┐
  │ RESULTS                                                 │
  ├────────┬────────────────────────────────┬────────┬──────┤
  │ ID     │ Finding                        │ Risk   │ Conf │
  ├────────┼────────────────────────────────┼────────┼──────┤
  │ NF-001 │ Direct prompt injection        │ HIGH   │ 99%  │
  │ NF-002 │ System prompt extraction       │ MEDIUM │ 95%  │
  │ NF-003 │ MCP tool SSRF via fetch_url    │ HIGH   │ 97%  │
  │ NF-004 │ PII leak in chat context       │ HIGH   │ 92%  │
  └────────┴────────────────────────────────┴────────┴──────┘

  4 verified vulnerabilities found.
  Report: ./nightfang-report/report.md
  SARIF:  ./nightfang-report/report.sarif
```

## How It Compares

| Feature | Nightfang | promptfoo | garak | mcpscan.ai |
|---------|-----------|-----------|-------|------------|
| Autonomous multi-agent | :white_check_mark: 4 specialized agents | :x: Single runner | :x: Single runner | :x: Single scanner |
| Verification (no false positives) | :white_check_mark: Re-exploits to confirm | :x: | :x: | :x: |
| MCP server security | :white_check_mark: Tool poisoning, schema abuse | :x: | :x: | :white_check_mark: Basic |
| OWASP LLM Top 10 | :white_check_mark: 8/10 covered | Partial | Partial | Partial |
| SARIF output (GitHub Security tab) | :white_check_mark: | :white_check_mark: | :x: | :x: |
| One command, zero config | :white_check_mark: `npx nightfang scan --target <url>` | Needs YAML config | Needs Python setup | Web-only |
| Open source | :white_check_mark: MIT | :white_check_mark: (acquired by OpenAI) | :white_check_mark: | :x: Closed |
| Cost per scan | $0.05–$1.00 | Varies | Free (local) | Free tier |

> **Note:** promptfoo was [acquired by OpenAI](https://openai.com) — Nightfang remains independent and open source.

## GitHub Action

Add Nightfang to your CI/CD pipeline:

```yaml
name: AI Security Scan
on: [push, pull_request]

jobs:
  nightfang:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Nightfang
        uses: peaktwilight/nightfang-action@v1
        with:
          target: ${{ secrets.STAGING_API_URL }}
          depth: default  # quick | default | deep
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}  # or ANTHROPIC_API_KEY

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: nightfang-report/report.sarif
```

Findings show up directly in the **Security** tab of your repository.

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

# Deep scan with source code analysis (requires Claude Code or Codex CLI)
npx nightfang scan --target https://api.example.com/chat --runtime claude --mode deep --repo ./path/to/target

# MCP server audit
npx nightfang scan --target https://mcp-server.example.com --runtime claude --mode mcp
```

## Runtime Modes

Nightfang supports three execution runtimes:

| Runtime | Flag | Description |
|---------|------|-------------|
| `api` | `--runtime api` | Direct HTTP probing (default). Fast, cheap, no dependencies. |
| `claude` | `--runtime claude` | Spawns Claude Code as subprocess. Can read source code, run tools, execute PoCs. |
| `codex` | `--runtime codex` | Spawns Codex CLI as subprocess. Same capabilities as Claude runtime. |

Combined with scan modes:

| Mode | Flag | Description |
|------|------|-------------|
| `probe` | `--mode probe` | Send payloads to API, check responses (default). |
| `deep` | `--mode deep` | Full analysis — API probing + source code audit when `--repo` is provided. |
| `mcp` | `--mode mcp` | Connect to MCP server, enumerate tools, test each for security issues. |

> `deep` and `mcp` modes require `--runtime claude` or `--runtime codex`.

## Roadmap

- [x] Core 4-agent pipeline (discover, attack, verify, report)
- [x] OWASP LLM Top 10 coverage (8/10)
- [x] SARIF output + GitHub Action
- [x] MCP server scanning
- [ ] Multi-turn conversation attacks
- [ ] RAG pipeline security (poisoning, extraction)
- [ ] Agentic workflow testing (multi-tool chains)
- [ ] VS Code extension
- [ ] Team dashboard & historical tracking
- [ ] SOC 2 / compliance report generation

## Built By

Created by a security researcher with [7 published CVEs](https://www.cve.org/) across node-forge, uptime-kuma, liquidjs, picomatch, and jspdf — plus the creator of [OpenSOAR](https://github.com/peaktwilight) (SOAR platform) and PhishMind (phishing analysis).

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
