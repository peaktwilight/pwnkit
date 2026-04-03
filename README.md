<p align="center">
 <img src="assets/pwnkit-icon.gif" alt="pwnkit" width="80" />
</p>

<h1 align="center">pwnkit</h1>

<p align="center">
 <strong>Let autonomous agents hack you before someone else does.</strong><br/>
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

Autonomous agents that discover, attack, and verify vulnerabilities across LLM endpoints, web apps, npm packages, and source code. Every finding is independently re-exploited by a blind verify agent to kill false positives.

```bash
npx pwnkit-cli
```

## Quick Start

```bash
# Scan an LLM endpoint
npx pwnkit-cli scan --target https://your-app.com/api/chat

# Pentest a web app
npx pwnkit-cli scan --target https://example.com --mode web

# Audit an npm package
npx pwnkit-cli audit lodash

# Review source code
npx pwnkit-cli review ./my-ai-app

# Auto-detect — just give it a target
npx pwnkit-cli express          # audits npm package
npx pwnkit-cli ./my-repo        # reviews source code
npx pwnkit-cli https://api.com  # scans endpoint
```

See the [full documentation](https://docs.pwnkit.com/getting-started) for configuration, runtime modes, and CI/CD setup.

## How It Works

```
  Research Agent              Blind Verify Agent           Report
  discover + attack + PoC --> gets ONLY PoC + path    --> SARIF / JSON / MD
                              no reasoning, no bias       only confirmed findings
                              can't reproduce? killed
```

The blind verification is the differentiator. The verify agent can't be biased by the research agent's reasoning — same principle as double-blind peer review.

## Benchmark

10 AI/LLM security challenges with flag-based verification. Extract the flag or fail.

| Mode | Detection | Flag Extraction |
|------|-----------|-----------------|
| **Agentic** (with AI) | **100%** (10/10) | **100%** (10/10) |
| Baseline (no AI) | 30% (3/10) | 20% (2/10) |

All categories covered: prompt injection, system prompt extraction, PII leakage, encoding bypass, jailbreaks, multi-turn escalation, CORS, sensitive paths, MCP SSRF, indirect injection.

```bash
pnpm bench              # baseline (deterministic, no API key)
pnpm bench --agentic    # full agentic pipeline with AI
```

Our benchmark covers AI/LLM-specific attack surfaces. This is a different domain from [XBOW](https://github.com/xbow-engineering/validation-benchmarks) (traditional web vulns) and KinoSec (black-box web pentesting) — the scores measure different things. See the [benchmark docs](https://docs.pwnkit.com/benchmark) for details.

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

## License

[Apache 2.0](LICENSE)
