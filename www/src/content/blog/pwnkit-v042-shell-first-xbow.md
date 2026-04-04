---
title: "pwnkit v0.4: shell-first pentesting, 27 XBOW flags, and the bug that broke everything"
date: "2026-04-04"
description: "we rebuilt pwnkit's agent architecture from structured tools to shell-first, cracked 23 XBOW benchmark challenges, and found a serialization bug that was crashing the agent after 3 turns."
readTime: "10 min read"
---

we spent six weeks building the wrong thing. ten structured tools &mdash; `crawl`, `submit_form`, `http_request`, `read_source`, `extract_links`, the works. each one carefully typed, validated, documented. the agent had a purpose-built toolkit for web pentesting.

it couldn't crack a basic IDOR in 20+ turns.

## the shell-first discovery

the structured tools looked great on paper. `crawl` would spider a target. `submit_form` would POST data. `http_request` gave the agent full control over method, headers, body. ten tools covering every action a pentester might need.

the problem was cognitive overhead. the agent had to figure out *which* tool to use, *how* to format the parameters, and *what* the output schema meant &mdash; for every single action. it would crawl a page, parse the response, realize it needed to follow a redirect, switch to `http_request`, format the headers wrong, retry, get confused about cookie state, and spiral.

twenty turns in, it still hadn't found the IDOR. it was too busy fighting the tool interface.

so we tried something desperate. we ripped out all ten tools and gave the agent one: `bash`. run any command. that's it.

```
turn 1: curl -s http://target/api/users/1 | jq .
turn 2: curl -s http://target/api/users/2 | jq .
turn 3: # noticed the IDOR, different user data returned
turn 4: for i in $(seq 1 20); do curl -s http://target/api/users/$i | jq .id; done
```

ten turns. first try. flag extracted.

the insight is embarrassingly simple: the model already knows curl. it's seen millions of curl commands in training data. there's zero learning curve. one tool means zero tool-selection overhead. the agent just *does the thing* instead of figuring out how to ask a tool to do the thing.

we kept `bash` as the primary tool for the rest of v0.4. every benchmark improvement traces back to this decision.

## XBOW benchmark results

XBOW is the gold standard for evaluating AI pentesting agents. 104 challenges across real vulnerability categories, each requiring actual exploitation &mdash; not just detection, but flag extraction.

pwnkit v0.4.2 extracted 27 flags across 13 vulnerability categories:

- **injection**: SQLi, blind SQLi, SSTI, command injection
- **access control**: IDOR, auth bypass, business logic flaws
- **file-based**: LFI, file upload, XXE, deserialization
- **network**: SSRF
- **session**: cookie manipulation

here's how that stacks up against published results:

<div class="bg-night-lighter border border-white/5 rounded-lg p-5 my-8">
  <div class="flex items-center gap-3 mb-3">
    <div class="w-2 h-2 rounded-full bg-blue-400"></div>
    <span class="text-sm font-mono text-blue-400">XBOW benchmark comparison</span>
  </div>
  <div class="grid grid-cols-4 gap-4 text-center">
    <div>
      <div class="text-2xl font-bold text-white">44.2%</div>
      <div class="text-xs text-ash mt-1">pwnkit v0.4.2</div>
    </div>
    <div>
      <div class="text-2xl font-bold text-white">85%</div>
      <div class="text-xs text-ash mt-1">XBOW</div>
    </div>
    <div>
      <div class="text-2xl font-bold text-white">92.3%</div>
      <div class="text-xs text-ash mt-1">KinoSec</div>
    </div>
    <div>
      <div class="text-2xl font-bold text-white">96.15%</div>
      <div class="text-xs text-ash mt-1">Shannon</div>
    </div>
  </div>
</div>

44.2% is not a winning number. but context matters.

KinoSec, XBOW, and Shannon have all been iterating on this benchmark for months. they use multi-agent architectures, custom tool libraries, and proprietary orchestration. we got to 44% in a few weeks with a single agent and a bash shell. the trajectory matters more than the snapshot, and the trajectory is steep.

the categories we're strong in &mdash; SQLi, IDOR, SSTI, SSRF &mdash; are the ones where curl knowledge translates directly. the gaps are in challenges that need stateful multi-step exploitation: chained deserialization, complex auth flows, file upload + LFI combos. that's where shell-first hits its limits and where we need to get smarter about planning.

## the responses API bug

this one still stings.

we were running pwnkit against the XBOW benchmark on Azure OpenAI using the Responses API. every challenge crashed after turn 3. every single one. the agent would start strong &mdash; reconnaissance, initial probing, maybe a first payload &mdash; then just die.

we spent two days debugging. checked token limits. checked rate limiting. checked payload sizes. nothing made sense.

the bug: when we serialized the conversation history for the Responses API, assistant messages were being sent as `input_text` instead of `output_text`. the API accepted this for the first few turns (lenient parsing), then Azure's stricter validation kicked in and rejected the entire request.

```typescript
// before (broken)
{ type: "input_text", text: assistantMessage }

// after (fixed)
{ type: "output_text", text: assistantMessage }
```

one line. the agent had been crashing on *every challenge* for the entire first week of benchmarking. every "zero flag" run, every "the agent can't hack anything" session &mdash; it was this bug. the agent wasn't failing at pentesting. it was failing at having a conversation.

the fix landed and our flag count jumped from 0 to 16 overnight. then the research-backed improvements pushed it to 23.

embarrassing? yes. but this is what real development looks like. the most impactful fix in v0.4 was a one-line type annotation.

## research-backed improvements

after the shell-first breakthrough and the API fix, we went deep on the literature. six papers and projects shaped the rest of v0.4:

**KinoSec** showed us the value of a planning phase. their agent doesn't just start attacking &mdash; it first builds a mental model of the target, identifies likely vulnerability classes, and creates an attack plan. we added a similar planning phase where the agent spends its first few turns on recon and hypothesis formation before throwing any payloads.

**XBOW's own paper** documented how challenge hints (a sentence or two describing the vulnerability category) are standard practice in benchmarking. we'd been running without hints, which is like doing a CTF without reading the challenge description. adding hints brought us in line with how everyone else evaluates.

**MAPTA and Cyber-AutoAgent** both emphasized reflection &mdash; the agent periodically stepping back to assess what's working and what isn't. we added reflection checkpoints at 60% of the turn budget. if the agent has used 24 of its 40 turns without a flag, it stops, reviews what it's tried, and pivots strategy.

**deadend-cli** had a clever approach to detecting when an agent is stuck in a loop. we borrowed their pattern of tracking repeated actions and forcing a strategy change after three consecutive similar attempts.

**Shannon** demonstrated that turn budget matters more than people think. their best results came with generous budgets that let the agent explore. we increased our turn limit from 20 to 40, and several challenges that were previously timing out started succeeding.

the combined effect of all these changes: planning + hints + reflection + larger budget + shell-first took us from 16 flags (post-bug-fix baseline) to 23.

## AI/LLM security benchmark

web vulns aren't the only thing pwnkit needs to find. we built a custom benchmark of 10 AI/LLM security challenges: prompt injection, jailbreak detection, system prompt extraction, PII leakage, and MCP-based SSRF.

pwnkit scored 10/10. 100%.

these challenges are closer to pwnkit's core design &mdash; the agent understands AI systems because it *is* an AI system. it knows how prompt injection works because it has to defend against it. it knows how system prompts can be extracted because it has one.

this is the category where agentic security tools have a genuine structural advantage over traditional scanners. a regex-based tool can't find a prompt injection. an AI agent can, because it can reason about what the prompt is trying to do.

## infrastructure

v0.4 wasn't just the agent. we built the scaffolding to support serious development:

**docs site** at docs.pwnkit.com. proper documentation instead of a README that kept getting longer.

**82 tests** &mdash; 48 unit tests covering the core scanning pipeline, message serialization, tool dispatch, and result parsing. 34 integration tests that run actual agent sessions against test targets. the Responses API bug would have been caught by integration tests if we'd had them earlier. now we do.

**Azure OpenAI runtime** with full Responses API support. the runtime layer is abstracted so we can swap between providers, but Azure is our primary target for enterprise deployments.

**blind PoC verification pipeline** with structured verdict records. every finding goes through the double-blind verification process described in the [previous post](/blog/blind-verification). the verdict records are machine-parseable JSON with confidence scores, data flow traces, and rejection reasons.

## what's next

v0.5 is about closing the gap on XBOW. specific targets:

**full CI benchmark run** with all improvements integrated. right now we're running challenges manually and tracking results in a spreadsheet. we need automated runs that report scores per category, track regressions, and flag improvements.

**sub-agent spawning** for complex exploit chains. the single-agent architecture hits a wall on challenges that need multiple phases &mdash; upload a shell, trigger deserialization, pivot to internal services. a coordinator agent that spawns specialized sub-agents for each phase should handle these better.

**push toward higher scores.** 23/52 is a start. the research says planning, reflection, and generous turn budgets are the biggest levers. we've implemented basic versions of all three. the next step is tuning them &mdash; when exactly should reflection trigger, how detailed should the plan be, what's the optimal turn budget per category.

the shell-first insight was the biggest unlock in pwnkit's history. we didn't plan it. we discovered it by running out of ideas with the structured approach and trying something dumb. sometimes the best architecture is no architecture. just give the agent a shell and get out of its way.
