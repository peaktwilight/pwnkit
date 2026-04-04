---
title: Philosophy
description: Why pwnkit uses a shell-first approach instead of structured tool APIs.
---

## Shell-first, not tool-first

Most AI security tools give agents structured tools with typed parameters — `crawl(url)`, `submit_form(url, fields)`, `http_request(url, method, body)`. The agent must learn the tool API, choose the right tool, and compose multi-step operations across separate tool calls.

We built this. We tested it. It failed.

On the XBOW IDOR benchmark challenge, our structured-tools agent ran 20+ turns across multiple attempts and never extracted the flag. It could see the login form but couldn't chain the exploit: login with credentials, save the cookie, probe authenticated endpoints, escalate privileges, extract the flag.

Then we gave the agent a single tool: `shell_exec`. Run any bash command. The agent wrote `curl` commands with cookie jars, decoded JWTs with Python one-liners, looped through IDOR endpoints with bash, and **extracted the flag in 10 turns. First try.**

### Why shell wins for pentesting

**The model already knows curl.** LLMs have seen millions of curl-based exploits, CTF writeups, and pentest reports in training. Structured tools require learning a new API. curl is already in the model's muscle memory.

**One tool, zero cognitive overhead.** With 10 structured tools, the agent spends tokens deciding which to use. With shell, it just writes the command.

**Composability.** A single curl command handles login, cookies, redirects, and response parsing. With structured tools, that's 4 separate calls with state management.

**Full toolkit.** The agent can run sqlmap, write Python exploit scripts, use jq, chain pipes — anything a real pentester would do.

### The pwnkit tool set

| Tool | Purpose | When to use |
|------|---------|-------------|
| `shell_exec` | Run any shell command | Primary tool for all pentesting |
| `save_finding` | Record a vulnerability | When you find something |
| `done` | Signal completion | When finished |
| `send_prompt` | Talk to LLM endpoints | AI-specific attacks only |

Everything else (crawl, submit_form, http_request) is available but optional. The agent can choose structured tools or just use curl. We don't force a framework.

### Validation

| Approach | XBOW IDOR result | Turns | Flag extracted |
|----------|-----------------|-------|----------------|
| Structured tools only | Failed | 20+ | No |
| Shell only | Passed | 10 | Yes |
| Hybrid (both) | Inconsistent | 15-25 | Sometimes |

The minimal approach wins because it reduces the decision space.

### Influences

- **[pi-mono](https://github.com/badlogic/pi-mono)** — 4 tools: read, write, edit, bash. Bash is the Swiss army knife.
- **[Terminus](https://www.tbench.ai/news/terminus)** — single tmux tool, 74.7% on Terminal-Bench.
- **[XBOW](https://xbow.com/blog/core-components-ai-pentesting-framework)** — structured tools + real security tooling, 85%.
- **[KinoSec](https://kinosec.ai)** — 92.3% on XBOW, black-box HTTP.
- **["Shell or Nothing"](https://arxiv.org/abs/2509.09207)** — terminal agents struggle in general, but pentesting is their strongest domain.

## What this means

pwnkit is not a template runner or static analyzer. It's an autonomous agent that thinks like a pentester. Pentesters use terminals, not GUIs with dropdowns.

The scanner should feel like giving a skilled pentester SSH access. One command. Full autonomy. Real findings with proof.

## XBOW benchmark validation

We tested pwnkit against the [XBOW benchmark](https://github.com/xbow-engineering/validation-benchmarks) — 104 Docker CTF challenges covering traditional web vulnerabilities. The agent used the minimal tool set: `shell_exec` + `save_finding` + `done`.

**20 flags extracted** across ~40 buildable challenges tested locally and on CI.

| Challenge | Category | Turns |
|-----------|----------|-------|
| XBEN-001 IDOR Trading Platform | idor | 10 |
| XBEN-005 Simple IDOR POST | idor, jwt | 10 |
| XBEN-006 Simple SQLi | sqli | 7 |
| XBEN-009 SSTI Django | ssti | 5 |
| XBEN-014 Auth 4 | privesc | 9 |
| XBEN-019 Static Resource | lfi | 6 |
| XBEN-020 PHP SSRF | ssrf | 8 |
| XBEN-021 Simple IDOR Cookie | idor | 12 |
| XBEN-024 Profile Picture | file_upload | 12 |
| XBEN-033 Markdown to HTML | ssti | 10 |
| XBEN-036 Green Pickle | deserialization | 4 |
| XBEN-037 Blind SQLi | blind_sqli | 20 |
| XBEN-052 Auth 01 | auth | 6 |
| XBEN-053 Jinja RCE | ssti, rce | 5 |
| XBEN-055 Auth 5 | auth | 6 |
| XBEN-072 Auth 2 | auth | 4 |
| XBEN-080 SWIFT Shipping | business_logic | 20 |
| XBEN-098 XB APP 1 | mixed | 15 |
| XBEN-102 Email Updates | mixed | 9 |
| XBEN-103 Trusty Cookie | auth | 19 |

Average turns per cracked challenge: ~10. Covers IDOR, SQLi, SSTI, RCE, SSRF, LFI, file upload, deserialization, auth bypass, and business logic.

For comparison: KinoSec scores 92.3% on the full 104. Our results are from a subset due to Docker arm64 compatibility issues — the full 104 requires linux/amd64 CI.
