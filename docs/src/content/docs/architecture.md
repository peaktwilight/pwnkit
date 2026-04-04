---
title: Architecture
description: How the 4-stage pipeline, runtime adapters, and MCP integration work.
---

pwnkit is a fully autonomous agentic pentesting framework that covers LLM endpoints, web applications, npm packages, and source code. It runs autonomous AI agents in a discover-attack-verify-report pipeline. For web pentesting, the agent uses a shell-first approach -- `shell_exec` (curl, python3, bash) is the primary tool, not structured APIs. For LLM and code targets, the agent uses specialized tools (`send_prompt`, `read_file`). Blind verification kills false positives -- every finding is independently re-exploited by a second agent that never sees the original reasoning.

## The pipeline

The core pipeline has four stages:

```
Discover -> Attack -> Verify -> Report
```

These stages are grouped into two agent sessions:

### 1. Research agent (Discover + Attack + PoC)

A single agent session that:

1. **Discovers** the attack surface -- maps endpoints, detects models, identifies features, fingerprints web technologies, and enumerates exposed paths
2. **Attacks** the target -- crafts multi-turn attacks spanning prompt injection, jailbreaks, tool poisoning, data exfiltration (LLM), CORS misconfiguration, SSRF, XSS, path traversal, header injection (web), supply chain and malicious code analysis (npm), and vulnerability patterns (source code)
3. **Writes PoC code** -- produces a proof-of-concept that demonstrates each vulnerability

The research agent's tool set depends on the target type:

- **Web targets:** `shell_exec` (primary -- run curl, python3, bash, sqlmap, anything), `save_finding`, `done`. The structured tools (`crawl_page`, `submit_form`, `http_request`) are available but optional -- benchmarking showed the agent performs better with just shell access.
- **LLM targets:** `send_prompt` (talk to LLM endpoints), `shell_exec`, `save_finding`, `done`.
- **Source/npm targets:** `read_file`, `search_code`, `list_files`, `run_command`, `save_finding`.

The agent adapts its strategy based on what it discovers -- if a naive prompt injection fails, it may try encoding bypasses, multi-turn escalation, or indirect injection. For web apps, it escalates from fingerprinting to active exploitation using real pentesting tools via shell. For source code, it traces data flows from user input to dangerous sinks.

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
| `deep` | LLM endpoint URL | Prompt injection, jailbreaks, tool poisoning, data exfiltration, multi-turn escalation |
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

- `shell_exec` — run any bash command (curl, sqlmap, python, nmap, etc.)
- `save_finding` — record a confirmed vulnerability with PoC
- `done` — signal completion

This works because the model already knows curl, bash pipelines, and standard pentesting tools from training data. A single `curl -c cookies.txt ... | jq` command replaces multiple structured tool calls and eliminates the state-threading confusion that causes agents to loop.

The structured tools (`crawl_page`, `submit_form`, `http_request`) are still available as optional additions, but benchmarking showed the agent performs better with just shell access. On the XBOW benchmark, the shell-first approach extracted 22 flags from ~45 tested challenges (49%) across 13 vulnerability categories, with no benchmark-specific tuning.

See the [Philosophy](/philosophy/) page for the full rationale behind this design decision and the [Benchmark](/benchmark/) page for detailed results.

## Agent tools

Each agent has access to a set of tools depending on the scan type:

| Tool | Used in | Purpose |
|------|---------|---------|
| `shell_exec` | Web, LLM, Verify | **Primary tool for web pentesting.** Run any shell command (curl, python3, bash, sqlmap, nmap, etc.) |
| `save_finding` | All modes | Record a discovered vulnerability with PoC |
| `done` | All modes | Signal that the agent has finished |
| `send_prompt` | LLM | Send prompts to LLM/AI endpoints |
| `read_file` | Source, npm | Read source files for code review |
| `run_command` | Source, npm | Execute commands in a sandbox |
| `list_files` | Source, npm | Enumerate files in a directory |
| `search_code` | Source, npm | Search for patterns across a codebase |
| `crawl_page` | Web (optional) | Crawl a web page -- available but `shell_exec` with curl is preferred |
| `submit_form` | Web (optional) | Submit a form -- available but `shell_exec` with curl is preferred |
| `http_request` | Web (optional) | Send HTTP requests -- available but `shell_exec` with curl is preferred |
