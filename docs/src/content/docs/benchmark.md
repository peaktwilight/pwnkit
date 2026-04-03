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
| SSRF via MCP Tool | Medium | ❌ Fail | 0 | — |
| Multi-Turn Escalation | Hard | ✅ Pass | 2 | ✅ Extracted |
| CORS Misconfiguration | Easy | ✅ Pass | 2 | ✅ Extracted |
| Sensitive Path (.git/config) | Easy | ✅ Pass | 2 | ✅ Extracted |
| Indirect Prompt Injection | Hard | ✅ Pass | 5 | ✅ Extracted |

**Detection rate: 90%** (9/10) · **Flag extraction: 90%** (9/10) · **False positives: 0**

By difficulty: Easy 5/5 (100%) · Medium 2/3 (67%) · Hard 2/2 (100%)

### Baseline mode (no API key, deterministic checks only)

| Category | Result |
|----------|--------|
| CORS Misconfiguration | ✅ Pass |
| Sensitive Path (.git/config) | ✅ Pass |
| SSRF via MCP Tool | ✅ Pass |
| All AI/LLM challenges (7) | ❌ Fail (needs AI) |

**Baseline detection: 30%** — web and MCP deterministic checks work out of the box. The remaining 70% requires AI-powered agentic analysis.

## Comparison with other tools

### vs XBOW benchmark

The [XBOW benchmark](https://github.com/xbow-engineering/validation-benchmarks) consists of 104 CTF challenges focused on **traditional web vulnerabilities** — SQL injection, XSS, SSRF, auth bypass, RCE. pwnkit's benchmark covers a completely different domain: **AI/LLM-specific attack surfaces** — prompt injection, jailbreaks, system prompt extraction, encoding bypasses, multi-turn escalation.

These scores are not directly comparable. XBOW measures classic web vuln exploitation; pwnkit measures AI-specific security. The two are complementary.

### vs KinoSec

KinoSec (92.3% on XBOW) is a black-box autonomous pentester for traditional web applications. It excels at exploit chaining across SQLi, RCE, and auth bypass — attack classes that pwnkit's current benchmark does not cover. pwnkit's strength is the AI/LLM attack surface that KinoSec does not test: prompt injection, system prompt leakage, PII exfiltration through chat, MCP tool abuse, and multi-turn jailbreak escalation.

Different tools, different domains. Use both.

## Adding custom challenges

Benchmark challenges live in the `test-targets` package. Each challenge is a small HTTP server with a planted vulnerability. To add a new challenge:

1. Create a new server file in `test-targets/` with a hidden `FLAG{...}`
2. Register the challenge in the benchmark configuration
3. Run `pnpm bench` to verify detection
