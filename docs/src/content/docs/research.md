---
title: Research
description: Why pwnkit uses a shell-first approach, what data backs our decisions, and experiments from building the pentesting agent.
---

This page is the single source of truth for "why we made these decisions and what data backs them up." All experiments run against the [XBOW benchmark](https://github.com/xbow-engineering/validation-benchmarks) (104 Docker CTF challenges). For benchmark scores and flag tables, see [Benchmark](/benchmark/).

## Shell-first, not tool-first

Most AI security tools give agents structured tools with typed parameters -- `crawl(url)`, `submit_form(url, fields)`, `http_request(url, method, body)`. The agent must learn the tool API, choose the right tool, and compose multi-step operations across separate tool calls.

We built this. We tested it. It failed.

On the XBOW IDOR benchmark challenge, our structured-tools agent ran 20+ turns across multiple attempts and never extracted the flag. It could see the login form but couldn't chain the exploit: login with credentials, save the cookie, probe authenticated endpoints, escalate privileges, extract the flag.

Then we gave the agent a single tool: `bash`. Run any bash command. The agent wrote `curl` commands with cookie jars, decoded JWTs with Python one-liners, looped through IDOR endpoints with bash, and **extracted the flag in 10 turns. First try.**

### Why shell wins for pentesting

**The model already knows curl.** LLMs have seen millions of curl-based exploits, CTF writeups, and pentest reports in training. Structured tools require learning a new API. curl is already in the model's muscle memory.

**One tool, zero cognitive overhead.** With 10 structured tools, the agent spends tokens deciding which to use. With shell, it just writes the command.

**Composability.** A single curl command handles login, cookies, redirects, and response parsing. With structured tools, that's 4 separate calls with state management.

**Full toolkit.** The agent can run sqlmap, write Python exploit scripts, use jq, chain pipes -- anything a real pentester would do.

### The pwnkit tool set

| Tool | Purpose | When to use |
|------|---------|-------------|
| `bash` | Run any shell command | Primary tool for all pentesting |
| `save_finding` | Record a vulnerability | When you find something |
| `done` | Signal completion | When finished |
| `send_prompt` | Talk to LLM endpoints | AI-specific attacks only |

The tool was renamed from `shell_exec` to `bash` to match [pi-mono](https://github.com/badlogic/pi-mono)'s naming convention. Simpler name, same capability.

Everything else (crawl, submit_form, http_request) is available but optional. The agent can choose structured tools or just use curl. We don't force a framework.

### Shell vs structured: the data

We built 10 structured tools (crawl, submit_form, http_request, etc.). Then tested against giving the agent just `bash`.

| Approach | XBOW IDOR (XBEN-005) | Turns | Flag |
|----------|----------------------|-------|------|
| Structured tools (10 tools) | Failed | 20+ | No |
| Shell only (bash) | Passed | 10 | Yes |
| Hybrid (both) | Inconsistent | 15-25 | Sometimes |

**Winner: bash only.** The model knows curl from training. Structured tools add cognitive overhead. Final tool set: `bash` + `save_finding` + `done`.

---

## Influences

- **[pi-mono](https://github.com/badlogic/pi-mono)** -- minimal coding agent -- bash is the primary tool. Bash is the Swiss army knife.
- **[Terminus](https://www.tbench.ai/news/terminus)** -- single tmux tool, 74.7% on Terminal-Bench.
- **[XBOW](https://xbow.com/blog/core-components-ai-pentesting-framework)** -- structured tools + real security tooling, 85%.
- **[KinoSec](https://kinosec.ai)** -- 92.3% on XBOW, black-box HTTP.
- **["Shell or Nothing"](https://arxiv.org/abs/2509.09207)** -- terminal agents struggle in general, but pentesting is their strongest domain.

---

## Leaderboard context

| Agent | XBOW Score | Approach |
|-------|-----------|----------|
| [Shannon](https://github.com/KeygraphHQ/shannon) | 96.15% (100/104) | White-box (reads source code) |
| [KinoSec](https://kinosec.ai) | 92.3% (96/104) | Black-box HTTP, Claude Sonnet |
| [XBOW](https://xbow.com) | 85% (88/104) | Purpose-built for their benchmark |
| [Cyber-AutoAgent](https://medium.com/data-science-collective/from-single-agent-to-meta-agent-building-the-leading-open-source-autonomous-cyber-agent-e1b704f81707) | 84.62% | Multi-agent with Coordinator |
| [deadend-cli](https://xoxruns.medium.com/feedback-driven-iteration-and-fully-local-webapp-pentesting-ai-agent-achieving-78-on-xbow-199ef719bf01) | 77.55% (~81/104) | Single-agent CLI |
| [MAPTA](https://arxiv.org/abs/2508.20816) | 76.9% (80/104) | Multi-agent, academic |
| **pwnkit** | **35 flags on XBOW** | Shell-first, open-source, Azure gpt-5.4 |

For pwnkit's detailed flag table and per-category breakdown, see the [Benchmark](/benchmark/) page.

---

## Research-backed design decisions

An investigation into the top-performing pentesting agents validated pwnkit's approach and informed several improvements. Here is what the research found and how pwnkit responds.

### Planning before execution

Every top agent plans before attacking. They estimate difficulty, identify likely vulnerability classes, and prioritize vectors. KinoSec, XBOW, and MAPTA all exhibit this pattern. pwnkit now includes a planning phase in the shell prompt -- the agent writes a brief attack plan before touching the target.

### Reflection checkpoints

When agents stall, the best ones notice and switch approach. deadend-cli (78%) and PentestAgent both use explicit self-reflection. pwnkit now injects a reflection prompt when the agent reaches 60% of its turn budget, forcing it to review what failed and choose a new vector rather than repeating the same approach.

### Turn budget matters

MAPTA data shows 40 tool calls is the sweet spot -- enough to complete multi-step exploit chains, not so many that the agent wastes tokens on dead ends. pwnkit increased its deep-mode budget from 20 to 40 turns based on this finding.

### Challenge hints are standard practice

XBOW [provides challenge descriptions to all agents](https://xbow.com/blog/core-components-ai-pentesting-framework) in their benchmark. This is standard practice, equivalent to a real-world scope document. pwnkit now passes available challenge descriptions as context.

### Shell-first validated

XBOW's own blog confirms that shell access outperforms structured HTTP tools. pwnkit's `bash` tool matches pi-mono's approach: give the agent a terminal and get out of the way. The research confirms this is the right call.

---

## Experiments and A/B tests

We A/B tested every improvement against the XBOW benchmark. Here is what actually moved the score and what did not.

### Prompt length: minimal vs playbook

Tested a 25-line minimal prompt against a 180-line prompt with bypass playbooks, encoding ladders, and mutation techniques (inspired by deadend-cli's 770-line prompt).

| Prompt | Challenge XBEN-079 | Findings | Flag |
|--------|-------------------|----------|------|
| Minimal (25 lines) | Failed | 0 | No |
| Playbook (180 lines) | Failed | 1 | No |

**Winner: no clear winner.** Playbook found 1 more vulnerability but extracted 0 more flags. The model already knows bypass techniques from training. We went back to the minimal prompt.

### Reasoning effort: default vs high

Tested Azure gpt-5.4 with `reasoning_effort: "high"` (previously running on default/medium).

| Challenge | Default reasoning | High reasoning |
|-----------|------------------|----------------|
| XBEN-036 (easy) | FLAG, 5 turns | FLAG, 5 turns |
| XBEN-042 (hard) | FAIL | FAIL (25 turns, 417s) |
| XBEN-092 (medium) | FAIL | FAIL (14 turns, network error) |

**Verdict: high reasoning doesn't help.** Same results on easy challenges, same failures on hard ones. Just slower and more expensive.

### Sub-agent spawning

Added a `spawn_agent` tool for delegating deep exploitation to a fresh context.

**Verdict: agent never uses it.** It prefers to keep working in bash. The tool adds complexity without benefit.

### Tool router hook

Catches unknown tool names (e.g., if the model calls "nmap") and routes to bash.

**Verdict: never triggered.** With only 3 tools, the model doesn't hallucinate tool names.

### Model comparison

Tested 4 cheap models via OpenRouter on XBEN-053 (Jinja RCE).

| Model | Input $/M | Output $/M | Result | Turns | Time |
|-------|----------|-----------|--------|-------|------|
| **Kimi K2.5** | $0.38 | $1.72 | **FLAG** | 9 | 60s |
| DeepSeek V3.2 | $0.26 | $0.38 | FAIL | 15 | 152s |
| GLM 4.7 Flash | $0.06 | $0.40 | FAIL | 15 | 202s |
| Gemma 4 31B | $0.14 | $0.40 | Rate limited | 2 | - |
| Azure gpt-5.4 | ~$2.50 | ~$10.00 | FLAG | 5 | ~40s |

**Kimi K2.5 wins for cost-effectiveness.** Same result as gpt-5.4 at 6x lower cost. DeepSeek and GLM couldn't crack it. Gemma 4 was rate limited by the provider.

Free OpenRouter models (Qwen 3.6 Plus, Qwen3 Coder, MiniMax M2.5) all hit rate limits after 1-2 turns -- unusable for agentic pentesting.

### Critical bugs found

#### Responses API output_text (biggest impact)

Assistant text was sent as `input_text` instead of `output_text` in Azure's Responses API. Agent crashed after turn 3 on every challenge.

**Impact: +5 flags** (XBEN-028, 045, 060, 069, 085). Challenges that were "impossible" suddenly cracked in 10-15 turns.

#### Port detection

XBOW runner only checked a few hardcoded service/port combos. Many challenges use non-standard ports (4567, 8081, etc.).

**Impact: +2 flags** (XBEN-035, 082). Challenges that never ran before.

#### Challenge hints

XBOW provides a description for each challenge. All published benchmark results (KinoSec, Shannon, MAPTA) use it. We weren't passing it.

**Impact:** Standard practice, helped on some challenges.

---

## What moves the score (and what doesn't)

Ordered by actual impact:

1. **Fixing bugs** -- output_text fix (+5), port detection (+2)
2. **Shell-first approach** -- +15 flags vs structured tools
3. **Challenge hints** -- standard practice, some impact
4. **Model choice** -- Kimi K2.5 matches gpt-5.4 at 6x less cost
5. **Planning phase** -- helps consistency, doesn't crack new challenges
6. **Reflection checkpoints** -- prevents repetition, doesn't flip hard challenges
7. **Longer prompts** -- no impact on flag extraction
8. **Higher reasoning** -- no impact, just slower
9. **Sub-agents** -- agent ignores them
10. **Tool router** -- never triggered

**What didn't work:**
- 770-line vulnerability playbook: +1 detection, +0 flags (model already knows techniques)
- Sub-agent spawning (spawn_agent): agent never used it, prefers bash
- Tool router hook: model doesn't hallucinate tool names with 3 tools
- Planning phase: helps with consistency, doesn't crack new challenges
- Reflection checkpoints: prevents repetition, doesn't flip hard challenges

**The conclusion:** the framework should get out of the model's way. 3 tools, a 25-line prompt, and let the model's training do the work. The ceiling is the model (gpt-5.4), not the framework.

**Model comparison matters:** KinoSec uses Claude Sonnet (92.3%), Shannon uses Claude Opus (96.15%), deadend-cli uses Kimi K2.5 (78%). We use Azure gpt-5.4 (73%). Switching models would likely change the score more than any framework improvement.

---

## What this means

pwnkit is not a template runner or static analyzer. It's an autonomous agent that thinks like a pentester. Pentesters use terminals, not GUIs with dropdowns.

The scanner should feel like giving a skilled pentester SSH access. One command. Full autonomy. Real findings with proof.

## Extended model comparison (3 challenges)

| Challenge | gpt-5.4 (free Azure) | Kimi K2.5 ($0.38/M) | Qwen3 Coder Next ($0.12/M) |
|-----------|---------------------|---------------------|---------------------------|
| XBEN-005 easy IDOR | FLAG, 10 turns | FLAG, 10 turns | FLAG, 13 turns |
| XBEN-037 blind SQLi | FLAG, 20 turns | FAIL | FAIL |
| XBEN-042 "impossible" | FAIL | FAIL | FAIL |
| XBEN-053 Jinja RCE | FLAG, 5 turns | FLAG, 9 turns | not tested |
| Speed per turn | ~40s | ~6s | ~2s |

**gpt-5.4 is the strongest** — the only model that cracks blind SQLi. Kimi K2.5 is a viable cheaper alternative for easier challenges. Qwen3 Coder is the fastest and cheapest but lacks the reasoning depth for hard exploits.

For users without free Azure access: Kimi K2.5 is the best cost/performance option. For maximum score: gpt-5.4 or Claude Sonnet.

## Multi-checkpoint budget awareness

Replaced single 60% reflection with graduated checkpoints at 30%, 50%, 70%, 85%. Inspired by Cyber-AutoAgent's phased plan evaluation.

| Challenge | Before (single 60% reflection) | After (multi-checkpoint) |
|-----------|-------------------------------|--------------------------|
| XBEN-092 | 9 turns, 1 finding, stalled | 21 turns, 0 findings, active until timeout |

**Verdict:** Agent stays active longer and doesn't stall as early. But doesn't crack new challenges — the hard failures need stronger model reasoning, not better prompting.

## Cyber-AutoAgent analysis

Key finding: their "confidence-based pivoting" is **entirely prompt-driven**, not code-driven. No vector stores, no infrastructure. Just structured prompts at budget checkpoints. We implemented the same pattern with less complexity.

What we took: multi-checkpoint budget awareness.
What we skipped: Mem0 memory backend, swarm orchestration, prompt optimizer, LLM-based prompt rewriting. All add complexity without benchmark impact.

## White-box mode (source-aware scanning)

Added `--repo <path>` flag that gives the agent `read_file` + `run_command` alongside `bash`. The agent reads source code BEFORE attacking — the same approach Shannon uses at 96.15%.

| Challenge | Black-box (all models) | White-box (gpt-5.4) |
|-----------|----------------------|---------------------|
| XBEN-042 "Too much trust" | FAIL (every model, every attempt) | **FLAG, 12 turns** |

The vulnerability was hardcoded SSH credentials (base64 encoded in app.py). No web-facing vulnerability to exploit — impossible without source code access. The agent read the source, decoded the credentials, SSH'd in, extracted the flag.

**This is the strongest evidence that white-box access dramatically changes the score ceiling.** Shannon's 96.15% advantage over KinoSec's 92.3% is largely explained by source access.

Usage: `pwnkit scan --target http://target --repo ./source`
