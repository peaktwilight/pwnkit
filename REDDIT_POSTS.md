# Nightfang Reddit Launch Posts

---

## r/netsec

**Title:** I used Claude Opus to find 7 CVEs in npm packages with 40M+ weekly downloads — open-sourcing the framework

**Body:**

Over the past three weeks, I ran a systematic security audit using Claude Opus against popular npm packages. The results:

- **73 total findings** across dozens of packages
- **7 published CVEs** in node-forge, mysql2, Uptime Kuma/LiquidJS, jsPDF, and picomatch
- **40M+ combined weekly downloads** affected

### The CVEs

| CVE | Package | Impact | Weekly Downloads |
|-----|---------|--------|-----------------|
| CVE-2026-33896 | node-forge | Certificate chain verification bypass — missing basicConstraints check allows any cert to act as CA | 32M |
| 4 findings | mysql2 | Connection override via URL params (host redirect, TLS disable, multi-statement enable) + prototype pollution + geometry DoS + OOB read in packet framing | 5M |
| CVE-2026-33130 | Uptime Kuma / LiquidJS | SSTI bypass — previously "patched" vulnerability bypassed by removing two quote characters. Root cause: `require.resolve()` with no path containment | — |
| CVE-2026-31898 / CVE-2026-31938 | jsPDF | PDF object injection via unsanitized annotation colors + XSS via `document.write()` in output methods (CVSS 9.6) | — |
| CVE-2026-33671 | picomatch | ReDoS via catastrophic backtracking | — |

### Methodology

The workflow is four phases:

1. **Target selection** — high download count + complex parsing/input handling
2. **Source code review** — the AI agent reads the entire codebase, traces data flows, maps trust boundaries, flags known vulnerability patterns
3. **Verification** — every finding gets a working PoC or it's discarded. No theoretical risks.
4. **Responsible disclosure** — GitHub Security Advisories, 90-day timeline, full writeups

The key insight: these bugs aren't sophisticated. A missing conditional. An unfiltered URL parameter. A fallback path with no validation. They exist because nobody sat down and read the code carefully enough. AI agents excel at exactly this kind of thorough, methodical review.

### Open-sourcing as Nightfang

I've packaged this workflow as an open-source CLI tool called Nightfang. Four AI agents (discover, attack, verify, report) run in sequence. The verification agent re-exploits every finding independently — if it can't reproduce, the finding is killed.

```bash
npx nightfang audit node-forge
npx nightfang scan --target https://your-app.com/api/chat
npx nightfang review ./my-ai-app
```

- GitHub: https://github.com/peaktwilight/nightfang
- Website: https://nightfang.dev
- Full CVE writeups with PoCs and timelines: https://doruk.ch/blog
- MIT licensed

Happy to answer technical questions about any of the CVEs or the methodology.

---

## r/cybersecurity

**Title:** Open-sourcing an AI-powered pentesting framework after it found 7 CVEs in major npm packages (node-forge, mysql2, jsPDF, picomatch)

**Body:**

I spent three weeks using Claude Opus to systematically audit popular npm packages. The AI agent reads source code the way a security researcher does — tracing data flows, mapping trust boundaries, checking assumptions — except it doesn't get fatigued and processes entire codebases in minutes.

**Result:** 73 findings, 7 published CVEs, packages with 40M+ weekly downloads affected.

### Why this matters for security teams

The vulnerabilities found were not exotic. They were the kind of bugs that slip through because nobody has the time to manually review every dependency:

- **node-forge** (32M downloads/week): Certificate forgery. A missing `basicConstraints` check meant any end-entity cert could act as a CA. One conditional. Billions of yearly downloads.
- **mysql2** (5M/week): URL query params could override the connection host, disable TLS, and enable multi-statement queries. Four bugs that chain together.
- **jsPDF**: PDF injection + XSS via `document.write()`. CVSS 9.6 Critical.

These are in your dependency tree right now. The question isn't whether they exist — it's whether you find them before someone else does.

### The tool: Nightfang

I've open-sourced the framework as Nightfang. It's a CLI toolkit with four specialized AI agents:

1. **Discover** — maps your attack surface (endpoints, MCP tools, system prompts)
2. **Attack** — runs 47+ test cases across the OWASP LLM Top 10
3. **Verify** — re-exploits every finding. Can't reproduce? Killed as false positive.
4. **Report** — SARIF output for GitHub Security tab

**How teams can use it:**

- **CI/CD gate**: Quick scans ($0.05, <1 min) on every push. SARIF goes straight to GitHub Security tab.
- **Dependency audit**: `npx nightfang audit <package>` before adding new dependencies.
- **Pre-launch assessment**: Deep scan ($1, ~10 min) before deploying AI-powered features.
- **MCP server testing**: If you're deploying MCP tools, Nightfang tests for tool poisoning, schema abuse, SSRF.

For context, Stripe recently published their Minions paper on running thousands of AI agents for internal tasks. As AI agent deployment scales, the attack surface grows with it. Tools like Nightfang are how you keep up.

```bash
npx nightfang scan --target https://your-api.com/chat
npx nightfang audit express
```

- GitHub: https://github.com/peaktwilight/nightfang
- Website: https://nightfang.dev
- CVE writeups: https://doruk.ch/blog
- MIT licensed, works with OpenAI/Anthropic/Ollama

---

## r/programming

**Title:** I built a 4-agent AI pipeline that found 7 CVEs in npm packages — here's the architecture (open source, MIT)

**Body:**

Three weeks ago I started a weekend project: can Claude Opus systematically audit npm packages for security vulnerabilities the way a human researcher would? Not running a linter — actually reading source code, tracing data flows, and writing working exploits.

It found 7 CVEs across node-forge (32M weekly downloads), mysql2, jsPDF, LiquidJS, and picomatch. 73 total findings. Every one verified with a working PoC.

I've now open-sourced the framework as **Nightfang**. Here's the architecture.

### The 4-agent pipeline

Nightfang runs four specialized agents in sequence, each building on the previous output:

```
DISCOVER → ATTACK → VERIFY → REPORT
```

1. **Discover (Recon)** — Maps endpoints, detects models, extracts system prompts, enumerates MCP tool schemas. Builds a target profile.

2. **Attack (Offense)** — Runs 47+ test cases across 7 categories (prompt injection, jailbreaks, tool poisoning, data exfiltration, encoding bypasses). Uses 12 attack templates mapped to the OWASP LLM Top 10.

3. **Verify (Validation)** — This is the interesting part architecturally. A *separate* agent independently re-exploits each finding. Different context, different approach. If it can't reproduce the vulnerability, the finding is killed. This eliminates false positives structurally, not through heuristics.

4. **Report (Output)** — Generates SARIF (plugs into GitHub Security tab), Markdown, and JSON. Includes severity scores and remediation guidance.

### Runtime abstraction

Nightfang doesn't ship its own LLM — it orchestrates whatever agent CLI you have:

| Runtime | Flag | Use case |
|---------|------|----------|
| `api` | `--runtime api` | Direct API calls, fastest, cheapest (default) |
| `claude` | `--runtime claude` | Spawns Claude Code CLI for deep analysis |
| `codex` | `--runtime codex` | Spawns Codex CLI for verification |
| `gemini` | `--runtime gemini` | Large context source analysis |
| `auto` | `--runtime auto` | Auto-detects installed runtimes, picks best per stage |

This means you can mix runtimes per pipeline stage. Use a cheap model for discovery, a capable model for attacks, a different model for verification.

### Five commands, five attack surfaces

```bash
npx nightfang scan --target <url>          # LLM endpoints + MCP servers
npx nightfang audit <npm-package>          # Supply chain audit (how I found the CVEs)
npx nightfang review <path-or-github-url>  # Source code review
npx nightfang findings list --severity critical
npx nightfang history --limit 10
```

Findings persist in a local SQLite database across runs.

### Why this is interesting from a programming perspective

The verification step is what makes the architecture novel. Most security tools produce findings and hope humans triage them. Having a separate agent independently verify each finding — with different context and a mandate to *disprove* the vulnerability — is essentially adversarial validation baked into the pipeline.

It's the same principle as having a separate QA team, but automated and running on every scan.

**Relevant industry context:** Stripe recently published their Minions paper on running AI agents at scale. The pattern of specialized agents in a pipeline is becoming standard. Nightfang applies it to security.

- GitHub: https://github.com/peaktwilight/nightfang
- Website: https://nightfang.dev
- Technical CVE writeups: https://doruk.ch/blog
- MIT licensed

### Comparison with promptfoo

promptfoo (recently acquired by OpenAI) is a red-teaming test runner — you define test cases, it runs them. Nightfang is a multi-agent pipeline that discovers its own attack vectors, then verifies them. Different tools for different problems. Also: Nightfang covers npm packages and source code, not just LLM endpoints.

---

## r/selfhosted

**Title:** Nightfang — open-source AI security scanner you can run locally (MIT, zero config, npx)

**Body:**

I built an open-source security scanner called Nightfang that uses AI agents to pentest AI applications, audit npm packages, and review source code. It runs entirely locally — no cloud service, no account, no API keys needed beyond your LLM provider.

### Why selfhosters should care

If you're running any AI-powered services (chatbots, MCP servers, copilots, RAG pipelines) or hosting apps that depend on npm packages, Nightfang can audit them:

```bash
# Scan your local AI endpoint
npx nightfang scan --target http://localhost:3000/api/chat

# Audit a package before you add it to your stack
npx nightfang audit uptime-kuma

# Review your app's source code
npx nightfang review ./my-app

# Use local models via Ollama — no data leaves your machine
npx nightfang scan --target http://localhost:3000/api/chat --runtime api
```

### What makes it different

- **Four AI agents** work in sequence: discover attack surface → attack it → verify every finding with a working exploit → generate report
- **Zero false positives** — if the verify agent can't reproduce it, the finding is dropped
- **SARIF output** — plugs into GitHub Security tab if you use GitHub Actions
- **Local SQLite database** — findings persist across scans, query with `nightfang findings`
- **MIT licensed** — use it, fork it, modify it

### Backstory

I used this workflow (with Claude Opus) to find 7 CVEs in packages with 40M+ combined weekly downloads — node-forge, mysql2, jsPDF, LiquidJS, picomatch. The node-forge bug (CVE-2026-33896) was a certificate forgery in a package with 32M weekly downloads. Full writeups with PoCs at doruk.ch/blog.

### Cost

If you use Ollama with local models, it's free (just your hardware). With cloud LLMs:
- Quick scan: $0.05, ~1 min
- Default: $0.15, ~3 min
- Deep: $1.00, ~10 min

### Links

- GitHub: https://github.com/peaktwilight/nightfang
- Website: https://nightfang.dev
- npm: https://www.npmjs.com/package/nightfang
- CVE writeups: https://doruk.ch/blog

v0.1.0 on npm. `npx nightfang scan` works globally with zero config. Feedback welcome.
