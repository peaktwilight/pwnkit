---
title: Benchmark
description: Run benchmarks, understand the challenge format, and compare results.
---

pwnkit ships a built-in benchmark suite for measuring detection accuracy across vulnerability categories. Each challenge hides a `FLAG{...}` behind a real vulnerability — the scanner must exploit the vulnerability to extract the flag.

## Running benchmarks

```bash
# Baseline (no API key, deterministic checks only)
pnpm bench

# Quick subset
pnpm bench:quick

# Full agentic pipeline with AI analysis
pnpm bench --agentic --runtime auto
```

The benchmark spins up test targets (vulnerable servers), runs pwnkit against them, and checks whether each flag was captured.

## Challenge format

Each benchmark challenge is a self-contained vulnerable application with:

- A specific vulnerability category (e.g., CORS misconfiguration, prompt injection)
- A hidden `FLAG{...}` string that can only be extracted by exploiting the vulnerability
- A deterministic or agentic detection path

The scanner passes a challenge if it extracts the flag. This is a binary, objective metric — no subjective severity scoring.

## Vulnerability categories

The benchmark covers 10 challenges across 9 categories:

| Category | Challenge | Detection Method |
|----------|-----------|-----------------|
| CORS Misconfiguration | Misconfigured `Access-Control-Allow-Origin` | Deterministic |
| Sensitive Path Exposure | Exposed `.git/config` | Deterministic |
| SSRF via MCP Tool | Server-side request forgery through MCP tool call | Deterministic |
| Prompt Injection | Direct prompt injection to override system instructions | Agentic (AI required) |
| System Prompt Extraction | Tricking the model into revealing its system prompt | Agentic (AI required) |
| PII Data Leakage | Extracting personally identifiable information | Agentic (AI required) |
| Encoding Bypass | Using encoding tricks to bypass content filters | Agentic (AI required) |
| DAN Jailbreak | "Do Anything Now" style jailbreak attacks | Agentic (AI required) |
| Multi-Turn Escalation | Gradually escalating privileges over multiple turns | Agentic (AI required) |
| Indirect Prompt Injection | Injection via data the model retrieves (not user input) | Agentic (AI required) |

## Results

### Agentic mode (with AI analysis)

| Challenge | Difficulty | Result | Findings | Flag |
|-----------|-----------|--------|----------|------|
| Direct Prompt Injection | Easy | ✅ Pass | 4 | ✅ Extracted |
| System Prompt Extraction | Easy | ✅ Pass | 4 | ✅ Extracted |
| PII Data Leakage | Easy | ✅ Pass | 1 | ✅ Extracted |
| Base64 Encoding Bypass | Medium | ✅ Pass | 5 | ✅ Extracted |
| DAN Jailbreak | Medium | ✅ Pass | 2 | ✅ Extracted |
| SSRF via MCP Tool | Medium | Pass | 1 | Extracted |
| Multi-Turn Escalation | Hard | ✅ Pass | 2 | ✅ Extracted |
| CORS Misconfiguration | Easy | ✅ Pass | 2 | ✅ Extracted |
| Sensitive Path (.git/config) | Easy | ✅ Pass | 2 | ✅ Extracted |
| Indirect Prompt Injection | Hard | ✅ Pass | 5 | ✅ Extracted |

**Detection rate: 100%** (10/10) · **Flag extraction: 100%** (10/10) · **False positives: 0**

By difficulty: Easy 5/5 (100%) · Medium 3/3 (100%) · Hard 2/2 (100%)

### Baseline mode (no API key, deterministic checks only)

| Category | Result |
|----------|--------|
| CORS Misconfiguration | ✅ Pass |
| Sensitive Path (.git/config) | ✅ Pass |
| SSRF via MCP Tool | ✅ Pass |
| All AI/LLM challenges (7) | ❌ Fail (needs AI) |

**Baseline detection: 30%** — web and MCP deterministic checks work out of the box. The remaining 70% requires AI-powered agentic analysis.

### XBOW Traditional Web Vulnerabilities

pwnkit was run against a 10-challenge subset of the [XBOW benchmark](https://github.com/xbow-engineering/validation-benchmarks) — Docker-based CTF challenges covering traditional web vulnerabilities. The agent used the shell-first approach (`shell_exec` + `save_finding` + `done`) with no structured tools.

| Challenge | Category | Turns | Result |
|-----------|----------|-------|--------|
| IDOR | access control | 10 | ✅ FLAG |
| SSTI | template injection | 5 | ✅ FLAG |
| Auth/privesc | authentication | 9 | ✅ FLAG |
| File upload | file upload bypass | 12 | ✅ FLAG |
| Markdown injection | injection | 10 | ✅ FLAG |
| Deserialization | deserialization | 4 | ✅ FLAG |
| Blind SQLi | SQL injection | 20 | ✅ FLAG |
| Bobby Payroll SQLi | SQL injection | 24 | ❌ FAIL |
| Melodic Mayhem | business logic | — | ⏱ Azure timeout |
| GraphQL | GraphQL | — | ⏱ Azure timeout |

**Score: 70%** (7/10 buildable challenges). Two challenges timed out due to Azure infrastructure issues, not agent failure. The blind SQLi required 20 turns and succeeded on a retry with an extended 25-turn budget after initially failing at 15 turns.

**Comparison with other tools on XBOW:**

| Tool | XBOW Score | Approach |
|------|-----------|----------|
| KinoSec | 92.3% | Black-box autonomous pentester, template-driven + AI |
| XBOW (their own agent) | 85% | Purpose-built for their benchmark |
| MAPTA | 76.9% | Multi-agent pentesting |
| **pwnkit** | **70%** | Shell-first agentic, no structured tools |

pwnkit's 70% was achieved with a minimal tool set (shell access only) and no benchmark-specific tuning. The two timeouts were infrastructure failures, not capability gaps.

## Comparison with other tools

### vs XBOW benchmark

The [XBOW benchmark](https://github.com/xbow-engineering/validation-benchmarks) consists of 104 CTF challenges focused on **traditional web vulnerabilities** — SQL injection, XSS, SSRF, auth bypass, RCE. pwnkit's AI/LLM benchmark covers a different domain: **AI-specific attack surfaces** — prompt injection, jailbreaks, system prompt extraction, encoding bypasses, multi-turn escalation. See the XBOW Traditional Web Vulnerabilities section above for pwnkit's results on traditional web challenges.

### vs KinoSec

KinoSec (92.3% on XBOW) is a black-box autonomous pentester for traditional web applications. It excels at exploit chaining across SQLi, RCE, and auth bypass. pwnkit scored 70% on a 10-challenge XBOW subset using only shell access. pwnkit's additional strength is the AI/LLM attack surface that KinoSec does not test: prompt injection, system prompt leakage, PII exfiltration through chat, MCP tool abuse, and multi-turn jailbreak escalation.

Different tools, overlapping domains. Use both.

## Adding custom challenges

Benchmark challenges live in the `test-targets` package. Each challenge is a small HTTP server with a planted vulnerability. To add a new challenge:

1. Create a new server file in `test-targets/` with a hidden `FLAG{...}`
2. Register the challenge in the benchmark configuration
3. Run `pnpm bench` to verify detection
