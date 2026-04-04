---
title: Architecture
description: How the 5-stage pipeline, runtime adapters, and MCP integration work.
---

pwnkit is a fully autonomous agentic pentesting framework that covers LLM endpoints, web applications, npm packages, and source code. It runs autonomous AI agents in a plan-discover-attack-verify-report pipeline. For web pentesting, the agent uses a shell-first approach -- `bash` (curl, python3, bash) is the primary tool, not structured APIs. For LLM and code targets, the agent uses specialized tools (`send_prompt`, `read_file`). Blind verification kills false positives -- every finding is independently re-exploited by a second agent that never sees the original reasoning.

## The pipeline

The core pipeline has five stages:

```
Plan -> Discover -> Attack -> Verify -> Report
```

These stages are grouped into two agent sessions:

### 1. Research agent (Plan + Discover + Attack + PoC)

A single agent session that:

1. **Plans** the engagement -- estimates target difficulty, identifies likely vulnerability classes, and prioritizes attack vectors. Research into top pentesting agents ([KinoSec](https://kinosec.ai) at 92.3%, [XBOW](https://xbow.com) at 85%, [MAPTA](https://arxiv.org/abs/2508.20816) at 76.9%) shows that planning before execution is a shared trait of high-performing agents. The plan is injected into the system prompt so the agent starts with a strategy rather than fumbling through discovery.
2. **Discovers** the attack surface -- maps endpoints, detects models, identifies features, fingerprints web technologies, and enumerates exposed paths
3. **Attacks** the target -- crafts multi-turn attacks spanning prompt injection, jailbreaks, tool poisoning, data exfiltration (LLM), CORS misconfiguration, SSRF, XSS, path traversal, header injection (web), supply chain and malicious code analysis (npm), and vulnerability patterns (source code)
4. **Writes PoC code** -- produces a proof-of-concept that demonstrates each vulnerability

**Challenge hints.** When available, challenge descriptions are passed to the agent as context. This is standard practice -- [XBOW provides challenge descriptions to all agents](https://xbow.com/blog/core-components-ai-pentesting-framework) in their benchmark. It is not benchmark-specific tuning; it is how a real pentester would receive a scope document.

The research agent's tool set depends on the target type:

- **Web targets:** `bash` (primary -- run curl, python3, bash, sqlmap, anything), `browser` (Playwright-based headless browser for XSS testing and JavaScript-rendered pages), `save_finding`, `done`. The structured tools (`crawl_page`, `submit_form`, `http_request`) are available but optional -- benchmarking showed the agent performs better with just shell access.
- **LLM targets:** `send_prompt` (talk to LLM endpoints), `bash`, `save_finding`, `done`.
- **Source/npm targets:** `read_file`, `search_code`, `list_files`, `run_command`, `save_finding`.

The agent adapts its strategy based on what it discovers -- if a naive prompt injection fails, it may try encoding bypasses, multi-turn escalation, or indirect injection. For web apps, it escalates from fingerprinting to active exploitation using real pentesting tools via shell. For source code, it traces data flows from user input to dangerous sinks.

**Reflection checkpoints.** When the agent reaches 60% of its turn budget, pwnkit injects a reflection prompt forcing the agent to review what has been tried, what failed, and what alternative approaches remain. This is inspired by [deadend-cli](https://xoxruns.medium.com/feedback-driven-iteration-and-fully-local-webapp-pentesting-ai-agent-achieving-78-on-xbow-199ef719bf01) (78% on XBOW) and [PentestAgent](https://arxiv.org/abs/2508.20816)'s self-reflection mechanism. Without reflection, agents frequently stall on a single approach and exhaust their budget.

**Turn budget.** [MAPTA](https://arxiv.org/abs/2508.20816) data shows 40 tool calls is the sweet spot for CTF-style challenges -- enough to complete multi-step exploit chains without wasting tokens on dead ends. Deep mode uses a budget of 40 turns (increased from the original 20).

### 2. Verify agent (Blind validation)

The verify agent receives **only** the PoC code and the file path. It never sees the research agent's reasoning, chain of thought, or attack strategy. This is the same principle as double-blind peer review.

The verify agent independently:

- Traces data flow from the PoC
- Attempts to reproduce the finding
- Confirms or kills the finding

If the verify agent cannot reproduce the vulnerability, it is killed as a false positive. This eliminates the noise that plagues other scanners.

### 3. Report (Output)

Only confirmed findings (those that survived blind verification) are included in the final report. Output formats:

- **SARIF** — for the GitHub Security tab
- **Markdown** — human-readable report
- **JSON** — machine-readable for pipelines

Each finding includes a severity score, category, PoC code, and remediation guidance.

## Scan modes

The pipeline adapts its tooling and attack strategy based on the target type:

| Mode | Target | What it does |
|------|--------|-------------|
| `deep` | LLM endpoint URL | Prompt injection, jailbreaks, tool poisoning, data exfiltration, multi-turn escalation (40-turn budget) |
| `probe` | LLM endpoint URL | Lightweight surface scan of an LLM endpoint |
| `web` | Web application URL | CORS, headers, exposed files, SSRF, XSS, path traversal, fingerprinting |
| `mcp` | MCP server | Tool poisoning, schema abuse, permission escalation |
| `audit` | npm package name | Supply chain analysis, malicious code detection, dependency risk |
| `review` | Local path or GitHub URL | AI-powered source code vulnerability analysis |

The mode is auto-detected from the target when possible, or set explicitly with `--mode`.

## Runtime adapters

pwnkit decouples the scanning pipeline from the LLM backend through runtime adapters. Each adapter implements the same interface but connects to a different provider:

| Adapter | Backend | How it works |
|---------|---------|-------------|
| `ApiRuntime` | OpenRouter / Anthropic / OpenAI | Direct HTTP calls to the provider's API |
| `ClaudeRuntime` | Claude Code CLI | Spawns `claude` as a subprocess with tool definitions |
| `CodexRuntime` | Codex CLI | Spawns `codex` as a subprocess |
| `GeminiRuntime` | Gemini CLI | Spawns the Gemini CLI |
| `McpRuntime` | MCP servers | Connects to Model Context Protocol servers |
| `AutoRuntime` | Best available | Detects installed CLIs and picks the best per stage |

The `--runtime` flag selects which adapter to use. The `auto` runtime probes for installed CLIs and picks the most capable one for each pipeline stage (for example, using Claude for deep reasoning and the API for quick classification).

## MCP integration

pwnkit integrates with the Model Context Protocol (MCP) in two ways:

### As an MCP client

The `McpRuntime` adapter can connect to MCP servers, using their exposed tools as the LLM backend for the scanning pipeline. This enables using any MCP-compatible model server.

### Scanning MCP servers

The `--mode mcp` scan mode (coming soon) will probe MCP servers for:

- **Tool poisoning** — malicious tool definitions that inject instructions
- **Schema abuse** — tool schemas designed to exfiltrate data
- **Permission escalation** — tools that request more access than needed

## Product model

The product is intentionally split into two surfaces:

- **CLI** — the execution surface for local runs, CI, replay, and exports
- **Dashboard** — the local verification workbench for triage, evidence review, and human sign-off

The CLI runs scans and produces findings. The dashboard consumes those findings and provides a Kanban-style board for triage, evidence inspection, and disposition tracking. Both share the same local SQLite database.

## Shell-first approach (web mode)

For web application pentesting, pwnkit uses a shell-first approach. Instead of routing the agent through structured tools like `crawl_page`, `submit_form`, or `http_request`, the web mode gives the agent a minimal tool set:

- `bash` — run any bash command (curl, sqlmap, python, nmap, etc.)
- `save_finding` — record a confirmed vulnerability with PoC
- `done` — signal completion

This works because the model already knows curl, bash pipelines, and standard pentesting tools from training data. A single `curl -c cookies.txt ... | jq` command replaces multiple structured tool calls and eliminates the state-threading confusion that causes agents to loop.

The structured tools (`crawl_page`, `submit_form`, `http_request`) are still available as optional additions, but benchmarking showed the agent performs better with just shell access.

See the [Research](/research/) page for the full rationale and data behind this design decision and the [Benchmark](/benchmark/) page for detailed results.

## Agent tools

Each agent has access to a set of tools depending on the scan type:

| Tool | Used in | Purpose |
|------|---------|---------|
| `bash` | Web, LLM, Verify | **Primary tool for web pentesting.** Run any shell command (curl, python3, bash, sqlmap, nmap, etc.). Renamed from `shell_exec` to match [pi-mono](https://github.com/badlogic/pi-mono)'s naming convention. |
| `browser` | Web | Playwright-based headless browser for XSS testing and JavaScript-rendered pages. Complements `bash`/curl for cases where a real browser DOM is needed. |
| `save_finding` | All modes | Record a discovered vulnerability with PoC |
| `done` | All modes | Signal that the agent has finished |
| `send_prompt` | LLM | Send prompts to LLM/AI endpoints |
| `read_file` | Source, npm | Read source files for code review |
| `run_command` | Source, npm | Execute commands in a sandbox |
| `list_files` | Source, npm | Enumerate files in a directory |
| `search_code` | Source, npm | Search for patterns across a codebase |
| `crawl_page` | Web (optional) | Crawl a web page -- available but `bash` with curl is preferred |
| `submit_form` | Web (optional) | Submit a form -- available but `bash` with curl is preferred |
| `http_request` | Web (optional) | Send HTTP requests -- available but `bash` with curl is preferred |
