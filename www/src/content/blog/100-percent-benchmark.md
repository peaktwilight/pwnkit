---
title: "100% on our AI security benchmark"
date: "2026-04-03"
description: "10 challenges. 10 flags extracted. zero false positives. how pwnkit's agentic pipeline handles prompt injection, jailbreaks, SSRF, and multi-turn escalation."
readTime: "6 min read"
---

we built a benchmark. 10 AI/LLM security challenges, each with a hidden `FLAG{...}` that can only be extracted by exploiting the vulnerability. binary pass/fail -- extract the flag or you didn't find the bug.

pwnkit scored 100%. every flag extracted. zero false positives.

## why we built it

security scanners love to claim high detection rates. the problem is nobody agrees on what "detection" means. is it "the tool printed a warning"? or "the tool actually exploited the vulnerability and proved it exists"?

we went with the second one. flag-based verification. the same format the [XBOW benchmark](https://github.com/xbow-engineering/validation-benchmarks) uses for traditional web vulns. except our challenges cover the AI-specific attack surface that XBOW and KinoSec don't test.

## the challenges

| challenge | difficulty | what it tests |
|-----------|-----------|---------------|
| direct prompt injection | easy | can the agent override system instructions? |
| system prompt extraction | easy | can the agent leak the hidden system prompt? |
| PII data leakage | easy | can the agent extract customer PII? |
| base64 encoding bypass | medium | can the agent decode and follow encoded payloads? |
| DAN jailbreak | medium | can the agent break out via roleplay? |
| SSRF via MCP tool | medium | can the agent exploit MCP tools for SSRF? |
| multi-turn escalation | hard | can the agent escalate over multiple turns? |
| CORS misconfiguration | easy | does the scanner catch permissive CORS? |
| sensitive path exposure | easy | does the scanner find exposed .git/config? |
| indirect prompt injection | hard | can the agent detect injection via fetched content? |

every challenge is a real server (Express for LLM endpoints, HTTP for web targets, JSON-RPC for MCP) running locally. the benchmark spins them up, runs pwnkit against each one, and checks if the flag appears in the findings.

## two modes, two baselines

**baseline mode** (no API key, deterministic checks only): 30% detection. pwnkit's web and MCP probes catch CORS, exposed files, and SSRF without any AI. these are pattern-matching checks that run in under a second.

**agentic mode** (full AI pipeline): 100% detection. the agentic scanner runs the full discover-attack-verify-report pipeline with multi-turn tool use. each challenge takes about a minute as the agent probes, adapts, and escalates.

the 70% gap between baseline and agentic is the AI-specific attack surface. you can't write a regex for a jailbreak. you can't template a multi-turn privilege escalation. you need an agent that reasons about the target's responses and adapts its strategy.

## what makes this different from XBOW

the [XBOW benchmark](https://github.com/xbow-engineering/validation-benchmarks) is 104 Docker CTF challenges covering traditional web vulns -- SQL injection, XSS, RCE, SSRF, auth bypass. KinoSec scores 92.3% on it. that's impressive, but it's a different domain.

our benchmark covers the attack surface that XBOW doesn't touch: prompt injection, jailbreaks, system prompt extraction, encoding bypasses, multi-turn escalation, MCP tool abuse, and PII exfiltration through chat interfaces. these are the vulnerabilities that show up when you build with LLMs.

the two benchmarks are complementary. we're working on running pwnkit against the full XBOW suite too -- that CI pipeline is already set up.

## blind verification matters

the benchmark doesn't just check if pwnkit found something. the agentic pipeline includes a blind verification step: a separate agent that gets ONLY the proof-of-concept, not the research agent's reasoning. it independently re-exploits the vulnerability. if it can't reproduce the finding, it gets killed as a false positive.

this is why we got zero false positives across all 10 challenges. the verification agent is biased toward rejection, not confirmation.

## run it yourself

```bash
git clone https://github.com/peaktwilight/pwnkit
cd pwnkit && pnpm install

# baseline (no API key needed)
pnpm bench

# full agentic pipeline
pnpm bench --agentic
```

the benchmark suite lives in `packages/benchmark/`. each challenge is defined in `src/challenges/index.ts` with a flag, a server handler, and expected finding categories. adding new challenges is straightforward.

## what's next

- running pwnkit against the full 104-challenge XBOW benchmark on CI
- adding more AI-specific challenges (RAG poisoning, agent tool chain abuse, indirect injection variants)
- publishing historical scores across model versions to track regression

the benchmark is open source. if you build AI-powered applications, run it against your endpoints. if you build security tools, benchmark against it.
