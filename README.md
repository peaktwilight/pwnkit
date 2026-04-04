<p align="center">
 <img src="assets/pwnkit-icon.gif" alt="pwnkit" width="80" />
</p>

<h1 align="center">pwnkit</h1>

<p align="center">
 <strong>Let autonomous AI agents hack you so the real ones can't.</strong><br/>
 <em>Fully autonomous agentic pentesting framework. Blind PoC verification to minimize false positives.</em>
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
 <a href="https://docs.pwnkit.com">Docs</a> &middot;
 <a href="https://pwnkit.com">Website</a> &middot;
 <a href="https://pwnkit.com/blog">Blog</a> &middot;
 <a href="#benchmark">Benchmark</a>
</p>

---

Autonomous AI agents that pentest web apps, LLM endpoints, npm packages, and source code. The agent gets a `bash` tool and acts like a real pentester -- writing curl commands, Python exploit scripts, and chaining vulnerabilities. Every finding is independently re-exploited by a blind verify agent to kill false positives.

**v0.5.0** adds Playwright-based XSS detection, white-box mode (`--repo`) for source-aware scanning, and validation across 5 benchmark suites.

```bash
npx pwnkit-cli
```

## Quick Start

```bash
# Pentest a web app
npx pwnkit-cli scan --target https://example.com --mode web

# White-box scan with source code access
npx pwnkit-cli scan --target https://example.com --repo ./source

# Scan an LLM endpoint
npx pwnkit-cli scan --target https://your-app.com/api/chat

# Audit an npm package
npx pwnkit-cli audit lodash

# Review source code
npx pwnkit-cli review ./my-app

# Auto-detect -- just give it a target
npx pwnkit-cli https://example.com
npx pwnkit-cli express
npx pwnkit-cli ./my-repo
```

See the [documentation](https://docs.pwnkit.com) for configuration, runtime modes, and CI/CD setup.

## How It Works

The agent gets 3 tools: `bash`, `save_finding`, `done`. It runs curl, writes Python scripts, chains exploits — the same way a human pentester works. No templates, no static rules.

```
  Research Agent              Blind Verify Agent           Report
  discover + attack + PoC --> gets ONLY PoC + path    --> SARIF / JSON / MD
                              no reasoning, no bias       only confirmed findings
                              can't reproduce? killed
```

The blind verification is the differentiator. The verify agent can't be biased by the research agent's reasoning.

## Benchmark

Validated across 5 benchmark suites: XBOW, AI/LLM security, AutoPenBench, HarmBench, and JailbreakBench.

### XBOW (traditional web vulnerabilities)

**35+ flags extracted** on the [XBOW benchmark](https://github.com/xbow-engineering/validation-benchmarks) (104 Docker CTF challenges) covering SQLi, IDOR, SSTI, RCE, SSRF, LFI, XXE, file upload, deserialization, auth bypass, and more. White-box mode (`--repo`) flips previously impossible challenges by reading source code before attacking.

| Tool | Score | Approach |
|------|-------|----------|
| Shannon | 96.15% | White-box, source-aware |
| KinoSec | 92.3% | Black-box, proprietary |
| XBOW | 85% | Purpose-built |
| Cyber-AutoAgent | 84.62% | Open-source, meta-agent |
| pwnkit | 35+ flags | Open-source, shell-first |

### AI/LLM security

**100% (10/10)** on custom challenges covering prompt injection, jailbreaks, system prompt extraction, PII leakage, encoding bypass, multi-turn escalation, and MCP SSRF. Zero false positives.

See [benchmark details](https://docs.pwnkit.com/benchmark) for per-challenge breakdowns and the full flag table.

## GitHub Action

```yaml
- uses: peaktwilight/pwnkit@main
  with:
    mode: review
    path: .
    format: sarif
  env:
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```

## Built By

Created by a security researcher with [7 published CVEs](https://doruk.ch/blog). pwnkit exists because modern attack surfaces require agents that adapt, not static rules that don't.

## Contributing

```bash
git clone https://github.com/peaktwilight/pwnkit.git
cd pwnkit && pnpm install && pnpm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

*Built by [Peak Twilight](https://doruk.ch) -- also building [FoxGuard](https://foxguard.dev), [vibecheck](https://vibechecked.doruk.ch), [unfuck](https://unfcked.doruk.ch), [whatdiditdo](https://whatdiditdo.doruk.ch)*

## License

[Apache 2.0](LICENSE)
