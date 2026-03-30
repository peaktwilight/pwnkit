---
title: "i vibe-coded 3 tools for the vibe coding era"
date: "2026-03-30"
description: "i built vibechecked, unfcked, and whatdiditdo — three open-source tools for the problems vibe coding creates. here's what i learned shipping all three in a week."
readTime: "6 min read"
---

everyone's vibe coding now. cursor, copilot, aider, windsurf — pick your agent, type a prompt, ship it. the code works. mostly.

but "mostly" is doing a lot of heavy lifting. i've been building [pwnkit](https://pwnkit.com), an autonomous pentesting framework, and while doing AI security research i kept running into the same three problems that vibe-coded projects create. so i built a tool for each one.

## problem 1: every landing page looks the same

you've seen it. purple-to-blue gradient hero. glassmorphism cards. three-column feature grid. "trusted by" logo bar. dark mode with neon accents. the vibe-coded aesthetic is so consistent it's become a meme.

so i built **[vibechecked](https://vibechecked.doruk.ch)** — a brutal AI design reviewer that scores your landing page and calls out every generic pattern it finds. it captures a screenshot, runs vision analysis, and gives you a score, a roast, and a list of red flags.

```bash
npx vibechecked https://your-app.vercel.app
```

it detects 11 specific patterns that scream "an AI designed this." we ran it on its own landing page. verdict: **GENERIC AF** with a 72% vibe-coded probability and the roast "this site has 'I prompted it in 20 minutes' energy." the irony of vibe-coding a tool that judges vibe-coded design is not lost on me.

## problem 2: the last 20% is where things break

AI gets you 80% of the way there. the app works, it looks fine, you deploy it. then someone finds the hardcoded API key on line 42, the missing meta tags that make your links look broken on twitter, the `console.log` statements you forgot to remove, and the error boundary that doesn't exist so one bad API response nukes the whole page.

**[unfcked](https://unfcked.doruk.ch)** runs 45+ static checks on your project in seconds. no AI, no API keys — pure static analysis. it catches security issues, SEO problems, production readiness gaps, and code quality smells. auto-detects your framework (next.js, react, vue, svelte) and adjusts checks accordingly.

```bash
npx unfcked /path/to/your/project
```

scores you 0-100 with verdicts ranging from "CERTIFIED CLEAN" to "DUMPSTER FIRE." we pointed it at vibechecked's own codebase — 73/100, MOSTLY GOOD. it caught the missing tests, 197 console.log statements, and a dev dependency in the wrong section. fair enough.

## problem 3: you don't know what your AI agent actually did

you let cursor cook for 20 minutes on a refactor. it touched 15 files. what actually changed? did it add dependencies? did it leave any API keys in the code? did it modify your `.env`?

**[whatdiditdo](https://whatdiditdo.doruk.ch)** is one command that shows you everything your AI coding agent changed. files touched, lines added/removed, new dependencies, security flags for secrets and keys, plus an AI-generated plain-English summary.

```bash
npx whatdiditdo
```

it even generates PR descriptions and HTML reports. works with any AI tool that uses git.

## the meta-irony

all three tools were vibe-coded. vibechecked roasts vibe-coded designs — and was vibe-coded itself. unfcked catches vibe-coding mistakes — and we ran it on itself. whatdiditdo audits AI agent work — and was built by an AI agent.

it's turtles all the way down and i wouldn't have it any other way.

## what i actually learned

**ship the obvious tool.** all three of these solve problems i personally had. i didn't do market research or competitive analysis. i hit a pain point, built the fix, and shipped it. the vibe coding wave means millions of developers are hitting these exact same problems right now.

**make it zero-config.** every tool is one `npx` command. no config files, no setup wizards, no twelve-step onboarding flows. you run it, it works. this matters more than features.

**the ecosystem compounds.** vibechecked reviews your design. unfcked reviews your code. whatdiditdo reviews your AI agent's work. together they cover the full vibe-coding workflow — and they all funnel attention back to [pwnkit](https://pwnkit.com), which handles the security side that none of these tools touch.

## try them

- **[pwnkit](https://pwnkit.com)** — autonomous AI pentesting. finds, exploits, and verifies real vulnerabilities.
- **[vibechecked](https://github.com/peaktwilight/vibechecked)** — brutal design review for your landing page.
- **[unfcked](https://github.com/peaktwilight/unfcked)** — find every production-breaking issue in your vibe-coded app.
- **[whatdiditdo](https://github.com/peaktwilight/whatdiditdo)** — see everything your AI coding agent changed.

all open source. all MIT licensed. all one `npx` command away.
