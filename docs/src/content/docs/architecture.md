---
title: Architecture
description: How the 4-stage pipeline, runtime adapters, and MCP integration work.
---

pwnkit is a general-purpose autonomous pentesting framework that covers LLM endpoints, web applications, npm packages, and source code. It runs autonomous AI agents in a discover-attack-verify-report pipeline. Each agent uses tools (`read_file`, `run_command`, `send_prompt`, `save_finding`) and makes multi-turn decisions, adapting its strategy based on what it learns. Blind verification kills false positives -- every finding is independently re-exploited by a second agent that never sees the original reasoning.

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

The research agent has access to tools like `send_prompt` (for LLM endpoints), `read_file` (for source review), `run_command` (for package audits and web probing), and `http_request` (for web app pentesting). It adapts its strategy based on what it discovers -- if a naive prompt injection fails, it may try encoding bypasses, multi-turn escalation, or indirect injection. For web apps, it escalates from fingerprinting to active exploitation. For source code, it traces data flows from user input to dangerous sinks.

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

## Agent tools

Each agent has access to a set of tools depending on the scan type:

| Tool | Used by | Purpose |
|------|---------|---------|
| `read_file` | Research, Verify | Read source files for code review |
| `run_command` | Research, Verify | Execute commands in a sandbox |
| `send_prompt` | Research, Verify | Send prompts to LLM endpoints |
| `save_finding` | Research | Record a discovered vulnerability with PoC |
| `list_files` | Research | Enumerate files in a directory |
| `search_code` | Research | Search for patterns across a codebase |
| `http_request` | Research, Verify | Send HTTP requests for web app pentesting |
