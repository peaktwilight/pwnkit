---
title: "The Age of Agentic Security"
date: "2026-03-26"
description: "If AI agents can write 1,000 pull requests a week, AI agents should be testing 1,000 pull requests a week. The asymmetry is about to collapse."
readTime: "9 min read"
---

Stripe recently published a post about their internal AI agents &mdash; what they call "Minions." The numbers are striking: over 1,000 pull requests per week, produced autonomously by AI agents, reviewed and merged by human engineers. These are not toy examples. They are production changes to one of the most important financial infrastructure companies in the world.

This is the new normal. Every major engineering organization is deploying AI agents to write code at scale. GitHub Copilot, Cursor, Devin, internal systems like Stripe's &mdash; the velocity of code production has fundamentally changed.

But here is the part nobody is talking about enough: the velocity of security testing has not changed at all.

## The asymmetry problem

Consider what is happening. AI agents produce code at a rate that would have been inconceivable two years ago. A thousand PRs per week at one company. Multiply that across every engineering team now using AI coding tools. The global volume of new code being written and shipped has increased by an order of magnitude.

Now consider how that code gets security-tested. The answer, for most organizations, is: it mostly does not. Some companies run static analysis in CI &mdash; tools like Semgrep or CodeQL that check for known patterns. A smaller number run periodic penetration tests, typically quarterly. An even smaller number have dedicated security engineers who manually review high-risk changes.

The math does not work. You cannot have AI agents writing a thousand PRs per week and humans reviewing them for security at the rate of maybe twenty per week. The gap between code production and security review is growing every day.

## Static analysis is necessary but not sufficient

This is not an argument against static scanners. They catch real bugs. They belong in every CI pipeline. But they have a fundamental limitation: they match patterns, they do not understand intent.

Every CVE I found during my npm audit work was in code that would pass static analysis cleanly. The node-forge certificate forgery? The code was syntactically correct, followed the library's internal conventions, and had no pattern that a linter would flag. The bug was a *logical* error &mdash; checking a property only when its container was present, rather than treating absence as a failure. You cannot write a regex for that.

The mysql2 connection override? A URL parser that processes query parameters in the wrong order. The Uptime Kuma SSTI bypass? A fallback code path that skipped validation. The jsPDF XSS? String concatenation instead of DOM construction. Each one is a semantic issue that requires understanding what the code is supposed to do, not just what it does.

This is where AI agents change the game. An LLM-powered security agent can read the code, understand the intended behavior, trace the data flow, and identify where the implementation diverges from secure design. It does what a human security researcher does &mdash; but without the throughput constraint.

## Why verification changes everything

The biggest waste of time in security is not finding vulnerabilities. It is triaging false positives. Every static scanner produces a mountain of "possible" findings that turn out to be nothing. Security teams spend 80% of their time proving things are *not* broken. This is why most organizations do not run aggressive scanning &mdash; the signal-to-noise ratio is too low to be actionable.

Real attackers do not have this problem. They attempt to exploit something. If it works, it is real. If it does not, they move on. That is the workflow that should be automated.

This is why pwnkit runs an agentic pipeline, not a single scan. And it is why the third agent &mdash; the verification agent &mdash; is the most important.

<div class="grid grid-cols-2 gap-4 my-8">
  <div class="bg-night-lighter border border-white/5 rounded-lg p-4">
    <div class="text-xs font-mono text-emerald-400 mb-1">01 Discover</div>
    <p class="text-sm text-smoke m-0">Map the attack surface. Endpoints, system prompts, tool schemas, auth flows, data flows.</p>
  </div>
  <div class="bg-night-lighter border border-white/5 rounded-lg p-4">
    <div class="text-xs font-mono text-amber-400 mb-1">02 Attack</div>
    <p class="text-sm text-smoke m-0">Run systematic test cases against the target. Prompt injection, tool poisoning, data exfiltration, auth bypass.</p>
  </div>
  <div class="bg-night-lighter border border-white/5 rounded-lg p-4">
    <div class="text-xs font-mono text-blue-400 mb-1">03 Verify</div>
    <p class="text-sm text-smoke m-0">Independently re-exploit every finding. Different agent, fresh context. If it cannot reproduce, the finding dies.</p>
  </div>
  <div class="bg-night-lighter border border-white/5 rounded-lg p-4">
    <div class="text-xs font-mono text-purple-400 mb-1">04 Report</div>
    <p class="text-sm text-smoke m-0">Generate SARIF for GitHub Security, markdown for humans, JSON for automation. Full evidence chains.</p>
  </div>
</div>

The verification agent does not trust the attack agent. It re-runs each exploit independently, with its own analysis of the target. If the attack agent says "prompt injection found" but the verification agent cannot reproduce it, the finding is killed. If a finding only works with a contrived input that no real user would send, it gets flagged and downgraded.

This is what separates an agentic security tool from a scanner that produces a list of maybes. The output is not "these 47 things might be problems." The output is "these 6 things are confirmed vulnerabilities, here is the proof for each one, and here is how to fix them."

## The Stripe parallel

What Stripe built with Minions is instructive. Their agents do not just generate code &mdash; they operate within a structured pipeline. The agent produces a PR. A human reviews and approves. The system learns from feedback. The result is high-throughput, high-quality code production.

The same architecture applies to security testing. An AI agent produces a security assessment. A human reviews the findings. The system refines its approach based on what is confirmed versus what is noise. High-throughput, high-quality security analysis.

The critical difference is that in security, the verification step can be automated. You do not need a human to confirm that a vulnerability is real if you have a working proof of concept. The PoC *is* the confirmation. An agent that produces a working exploit has already done the verification that a human reviewer would do &mdash; and it has done it faster, more consistently, and with better documentation.

## What this means for the industry

I think we are about to see a fundamental shift in how security testing works. Here is what I expect:

- **Every PR gets a security review.** Not a linter pass. An actual security review by an AI agent that reads the diff, understands the context, and checks for vulnerability classes that static analysis cannot detect. The cost is low enough &mdash; cents per review &mdash; to run on every commit.
- **Continuous pentesting replaces quarterly assessments.** Instead of hiring a pentest firm once a quarter, organizations run AI agents against their own systems continuously. The agents adapt as the codebase changes. New endpoints get tested the day they ship.
- **Supply chain auditing becomes table stakes.** Right now, most teams blindly trust their npm dependencies. When an AI agent can audit a package in minutes for a few cents, there is no excuse for not checking what you are importing.
- **The false positive problem goes away.** Verification-based scanning means every reported finding comes with proof. Security teams stop spending 80% of their time on triage and start spending it on remediation.

## This is not hypothetical

I have already done this manually. Three weeks with Claude Opus, auditing npm packages. 73 findings. 7 CVEs. Packages with 40 million weekly downloads. The vulnerabilities were real &mdash; certificate forgery, connection hijacking, server-side template injection, PDF injection, XSS. Each one verified with a working proof of concept. Each one responsibly disclosed and fixed by the maintainers.

That is what an AI agent can do when pointed at source code with a security researcher's methodology. pwnkit is the open-source version of that workflow. Autonomous agents. Discover, attack, verify, report. Point it at a target and get back confirmed findings with evidence.

The age of agentic coding is here. Stripe's Minions are writing a thousand PRs a week. Other companies are doing the same. The volume of code being produced by AI agents is growing exponentially.

Agentic security needs to keep pace. Every AI-written PR should be AI-tested for security. Every dependency should be AI-audited before it enters the supply chain. Every LLM endpoint and MCP server should be AI-pentested before it goes to production.

The alternative is simple: the attackers will use AI agents too. And they will not bother with responsible disclosure.

```
npx pwnkit-cli scan --target https://your-app.com/api/chat
```
