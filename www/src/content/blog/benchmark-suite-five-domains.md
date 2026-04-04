---
title: "we built benchmarks for everything pwnkit does"
date: "2026-04-04"
description: "five benchmark suites across web pentesting, LLM security, LLM safety, npm auditing, and network pentesting. here's what we learned."
readTime: "5 min read"
---

pwnkit started with one benchmark. then two. now there are five. each covers a different domain that pwnkit operates in, and together they tell us whether the tool actually works or whether we're just shipping vibes.

here's the full picture of what we built, why each benchmark exists, and what we learned along the way.

## why one benchmark isn't enough

most AI pentesting tools benchmark against a single suite. usually XBOW, sometimes their own internal challenges. that tells you how the tool performs on traditional web vulns -- SQLi, IDOR, auth bypass -- but nothing about everything else.

pwnkit isn't just a web pentester. it scans LLM endpoints for prompt injection. it audits npm packages for supply chain attacks. it tests network services for CVEs. it probes LLM safety boundaries. one benchmark can't cover all of that. so we built five.

## the five benchmarks

### 1. AI/LLM security (10 challenges, 100%)

our original benchmark. 10 custom challenges covering prompt injection, jailbreaks, system prompt extraction, encoding bypasses, SSRF via MCP tools, and multi-turn escalation. each hides a `FLAG{...}` behind a real AI-specific vulnerability.

score: 10/10. baseline mode (no API key, deterministic checks only) catches 3/10. the remaining 7 need agentic AI to crack.

```bash
pnpm bench --agentic --runtime auto
```

### 2. XBOW web pentesting (104 challenges, 35 flags)

the standard benchmark for AI pentesting agents. 104 Docker CTF challenges covering SQLi, IDOR, SSTI, auth bypass, file upload, XXE, command injection, and more. our shell-first approach -- giving the agent `bash` instead of structured tools -- validated itself here. 29 flags locally (73% of runnable challenges), 6 more on linux/amd64 CI.

the big limitation: ~40 challenges can't build on arm64 macOS. all the XSS challenges require phantomjs, which has no arm64 package. this is partly why we added playwright (more on that below).

```bash
pnpm --filter @pwnkit/benchmark xbow --agentic
```

### 3. AutoPenBench network pentesting (33 tasks, TBD)

[AutoPenBench](https://github.com/lucagioacchini/auto-pen-bench) is 33 Docker-based tasks covering real network pentesting and CVE exploitation. not web CTFs -- actual network service enumeration, vulnerability scanning, and exploit development. the bar to beat is 21%, set by the original paper's best automated agent.

we built the runner. it hooks into pwnkit's existing shell-first pipeline -- the agent gets bash access to a network with vulnerable targets and has to find and exploit them. the catch: it needs Linux Docker to spin up the multi-container networks, so we can't score it on macOS yet.

```bash
pnpm --filter @pwnkit/benchmark autopenbench
```

### 4. HarmBench LLM safety (510 behaviors, TBD)

[HarmBench](https://www.harmbench.org/) flips the script. instead of testing whether pwnkit can break *into* an LLM, it tests whether pwnkit can make an LLM break *its own rules*. 510 harmful behaviors across categories like dangerous content generation, safety filter bypasses, and policy violations. the metric is Attack Success Rate (ASR) -- what percentage of harmful behaviors can the agent successfully elicit.

we built a lightweight harness that reuses pwnkit's `sendPrompt()` function. no heavyweight dependencies, no separate infrastructure. point it at an LLM endpoint and it runs through all 510 behaviors.

```bash
pnpm --filter @pwnkit/benchmark harmbench --target <url>
```

### 5. npm audit benchmark (30 packages, TBD)

this one surprised us. we went looking for an existing npm security benchmark to test pwnkit's audit mode against. there isn't one. nobody has built a standardized test suite for npm package security scanning.

so we made one. 30 packages: 10 known-malicious (install scripts that exfiltrate env vars, obfuscated backdoors, typosquats), 10 with real CVEs (prototype pollution, ReDoS, path traversal), and 10 safe packages that a scanner shouldn't flag. the metrics are precision, recall, and F1 -- can pwnkit correctly identify the bad packages without crying wolf on the safe ones?

this is the benchmark we're most excited about. the npm supply chain is one of the highest-impact attack surfaces in software, and there's been no standardized way to measure how well scanners handle it.

```bash
pnpm --filter @pwnkit/benchmark npm-bench
```

## the playwright addition

one persistent gap in our XBOW results: zero XSS challenges cracked. every XSS challenge in the benchmark requires a browser runtime (phantomjs) that doesn't exist on arm64. curl can't trigger DOM-based XSS. you need a real browser.

so we added a `browser` tool powered by Playwright. the agent can now open pages in a headless Chromium instance, interact with the DOM, inject scripts, and observe the results. it sits alongside `bash` -- the agent chooses whichever tool fits the job. curl for API calls and header inspection, browser for anything that needs JavaScript execution.

this doesn't just help with XBOW XSS challenges. it's how pwnkit will handle real-world XSS testing going forward.

## shell-first validated across domains

the shell-first approach -- giving the agent `bash` instead of structured tools -- was originally validated on XBOW web challenges. but as we built runners for AutoPenBench and HarmBench, we kept the same pattern. the agent gets a shell and figures it out.

for network pentesting (AutoPenBench), this is natural. nmap, metasploit, custom python scripts -- these are all shell commands. for LLM safety testing (HarmBench), the harness wraps `sendPrompt()` so the agent doesn't need the shell, but the architecture stays consistent.

the lesson: a minimal, shell-first tool set generalizes across domains better than building bespoke tool sets for each one.

## what's next

three benchmarks still need scores. the immediate priorities:

- **AutoPenBench on Linux CI.** the runner is built. we need a linux/amd64 machine with Docker to actually run the 33 tasks and get a number. the 21% bar feels beatable given our XBOW results, but network pentesting is a different beast than web CTFs.
- **HarmBench against real LLMs.** the harness works. we need to pick target LLMs and run the full 510-behavior suite. this will also tell us how pwnkit's attack strategies compare to dedicated red-teaming tools.
- **npm-bench scoring.** the 30-package test suite is ready. we need to run pwnkit's audit mode against all 30 and calculate precision/recall/F1.

once we have all five scores, we'll have the most comprehensive benchmark coverage of any open-source AI pentesting tool. not because five is a magic number, but because pwnkit operates across five domains and each one deserves a real measurement.
