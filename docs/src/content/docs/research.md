---
title: Research
description: Why pwnkit uses a shell-first approach, what data backs our decisions, and experiments from building the pentesting agent.
---

This page is the single source of truth for "why we made these decisions and what data backs them up." All experiments run against the [XBOW benchmark](https://github.com/xbow-engineering/validation-benchmarks) (104 Docker CTF challenges). For benchmark scores and flag tables, see [Benchmark](/benchmark/).

## Topics

### [Shell-First Rationale](/research/shell-first/)

Why bash beats structured tools for pentesting. Includes A/B test data on prompt length, reasoning effort, sub-agent spawning, tool routing, and multi-checkpoint budgets.

### [Model Comparison](/research/model-comparison/)

Head-to-head testing of gpt-5.4, Kimi K2.5, Qwen3 Coder, DeepSeek, GLM, and free OpenRouter models. Cost, speed, and flag extraction across multiple XBOW challenges.

### [XBOW Analysis](/research/xbow-analysis/)

Shannon gap analysis (why 96% vs our 73%), competitor verification, what moves the score, white-box vs black-box results, critical bugs found, and future benchmark targets (AutoPenBench, HarmBench, JailbreakBench).

### [Competitive Landscape](/research/competitive-landscape/)

Full competitor breakdown (Shannon 96%, KinoSec 92%, Cyber-AutoAgent 84%, deadend-cli 78%, MAPTA 77%), 10 ranked improvement techniques with expected impact, key research papers, and what we've shipped vs what's next.

## The big picture

pwnkit is not a template runner or static analyzer. It's an autonomous agent that thinks like a pentester. Pentesters use terminals, not GUIs with dropdowns.

The scanner should feel like giving a skilled pentester SSH access. One command. Full autonomy. Real findings with proof.

**The conclusion:** the framework should get out of the model's way. 3 tools, a 25-line prompt, and let the model's training do the work. The ceiling is the model, not the framework.
