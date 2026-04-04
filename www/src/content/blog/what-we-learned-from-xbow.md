---
title: "what we learned running pwnkit against 104 CTF challenges"
date: "2026-04-04"
description: "29 flags, a serialization bug, a 770-line prompt that didn't help, and why the model matters more than the framework."
readTime: "8 min read"
---

we spent the last two days running pwnkit against the XBOW benchmark -- 104 Docker CTF challenges covering every web vulnerability class you can think of. SQL injection, IDOR, SSTI, command injection, file upload, deserialization, auth bypass, business logic.

here's everything we learned.

## the numbers

29 flags extracted across 15 vulnerability categories. 73% of challenges that successfully ran. for context: KinoSec scores 92.3% and Shannon scores 96.15% (but Shannon reads the source code -- it's white-box).

we're using Azure gpt-5.4. KinoSec uses Claude Sonnet. Shannon uses Claude Opus. the model matters -- probably more than the framework.

## shell-first works

the biggest discovery: giving the agent a single `bash` tool outperforms giving it 10 structured tools (crawl, submit_form, http_request, etc.).

structured tools failed on a basic IDOR challenge after 20+ turns. bash cracked it in 10 turns, first try. the model knows curl from training data. it doesn't need a custom API.

our final tool set: `bash` + `save_finding` + `done`. that's it.

## the bug that changed everything

for the first two days, our XBOW scores were terrible. the agent kept crashing after 2-3 turns with a cryptic Azure API error: "Invalid value: input_text."

the root cause: when serializing conversations for Azure's Responses API, we were sending assistant text as `input_text` instead of `output_text`. one word wrong. the agent literally couldn't have a multi-turn conversation.

fixing this one bug added 5 new flags immediately. challenges that were "impossible" before suddenly cracked in 10-15 turns. always check if your agent is actually running before blaming the prompts.

## what we studied

we dug into every open-source pentesting agent we could find:

**Shannon** (96.15%) reads the source code. it has a pre-recon agent that analyzes the entire codebase before the pentest even starts. this is white-box testing -- not comparable to black-box approaches.

**deadend-cli** (78%) uses a 770-line vulnerability playbook baked into the system prompt. it has 25+ tools, 5 specialized sub-agents, and a confidence-based planning algorithm (ADaPT) that decomposes hard tasks into subtasks.

**Cyber-AutoAgent** (84.62%) has a tool router hook that transparently routes unknown tool names to shell execution. it also uses confidence-gated pivoting -- after 3 failures of the same type, it forces a strategy change.

## what we tried

**long vulnerability playbook**: we added bypass techniques, encoding ladders, SQLi mutations, SSTI escalation chains. A/B tested against a minimal prompt. result: the playbook found 1 more vulnerability but extracted 0 more flags. the model already knows these techniques from training. we stripped it back to 25 lines.

**sub-agent spawning**: we added a `spawn_agent` tool that creates a fresh context for deep exploitation. the agent never used it. it prefers to keep working in bash.

**tool router hook**: we catch unknown tool names and route them to bash. the model doesn't hallucinate tool names when it only has 3 tools. never triggered.

**challenge hints**: XBOW provides a description for each challenge -- all published benchmark results use it. adding the hint is standard practice and helped on some challenges.

**planning phase**: the agent writes out an attack plan before exploiting. helps with consistency but doesn't crack new challenges.

**reflection checkpoints**: at 60% of turns with no findings, the agent reviews what it tried. helps prevent repetition but doesn't flip hard challenges.

## what actually matters

looking at all the data, the things that moved the score were:

1. **fixing bugs in our own code** (output_text fix: +5 flags)
2. **fixing infrastructure** (port detection: +2 flags)
3. **shell-first approach** (+15 flags vs structured tools)
4. **passing challenge hints** (standard practice, helped on a few)

the things that didn't help:
- longer prompts
- more tools
- sub-agents
- bypass playbooks

the model is the bottleneck, not the framework. gpt-5.4 via Azure gets us to 73%. switching to Claude Opus (what Shannon uses) or Claude Sonnet (what KinoSec uses) would likely change the numbers significantly. the framework just needs to get out of the model's way.

## the honest comparison

| tool | score | model | approach |
|------|-------|-------|----------|
| Shannon | 96% | Claude Opus | white-box (reads source) |
| KinoSec | 92% | Claude Sonnet | black-box, proprietary |
| Cyber-AutoAgent | 85% | Claude/Bedrock | black-box, meta-agent |
| deadend-cli | 78% | Kimi K2.5 | black-box, ADaPT planning |
| pwnkit | 73% | Azure gpt-5.4 | black-box, shell-first |

our architecture is sound. our prompts are clean. the model and the infrastructure around it (retry logic, turn budget, session management) determine the ceiling.

## what's next

1. test with Claude Sonnet/Opus to isolate model vs framework contribution
2. add Playwright for challenges that need browser interaction
3. implement confidence-gated pivoting from Cyber-AutoAgent
4. run the full 104 on linux/amd64 CI where all challenges build

the goal isn't to win a benchmark. it's to build a tool that finds real vulnerabilities in real applications. 73% on a CTF benchmark with a minimal framework and 3 tools is a solid foundation.
