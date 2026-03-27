## Update

Completed the live GitHub market map on **March 27, 2026**.

### Fast take

- **Promptfoo is the clear market leader right now**: **18,632 stars**, **+8,012 stars in the last 30 days**, pushed today, easiest CLI/CI story, and it already ships **explicit MCP security docs, an MCP plugin, and MCP red-team examples**.
- Among **security-first OSS** tools, current momentum is: **promptfoo >> garak > llm-guard > PyRIT > rebuff**.
- The adjacent eval giants are real distribution threats but not direct security scanners: **DeepEval (14,315 / +543)**, **OpenAI Evals (18,089 / +194)**, **Giskard OSS (5,204 / +75)**.
- The original wedge needs refinement: **"nobody tests MCP" is now too broad**. Better wedge: **nobody owns deep, deterministic, MCP-first protocol security + auth regression + CI-grade exploit replay**.

### Leaderboard

| Tool | Stars | 30d stars | Last push | CLI / CI | MCP security |
| --- | ---: | ---: | --- | --- | --- |
| promptfoo | 18,632 | 8,012 | 2026-03-27 | Strong / strong | **Yes, shipped** |
| OpenAI Evals | 18,089 | 194 | 2026-03-26 | Medium / medium | No |
| DeepEval | 14,315 | 543 | 2026-03-27 | Strong / strong | **Metrics only, not security scanning** |
| garak | 7,390 | 345 | 2026-03-26 | Strong / medium | No |
| ART | 5,902 | 64 | 2025-12-12 | Library-first / weak | No |
| Giskard OSS | 5,204 | 75 | 2026-03-27 | Medium / medium | No |
| PyRIT | 3,618 | 147 | 2026-03-27 | Medium / medium | Not shipped |
| LLM Guard | 2,741 | 165 | 2025-12-15 | Library-first / medium | Not shipped |
| Rebuff | 1,455 | 35 | 2024-08-07 | Narrow / weak | No |

### Tool-by-tool

- **promptfoo**: strongest all-around OSS package for app-layer AI security. I counted **68 red-team plugin docs**, **31 red-team strategy docs**, **77 provider docs**, plus explicit **MCP security** docs/plugin/examples. Best coverage today is prompt injection, prompt extraction, data exfiltration, PII, BOLA/BFLA, SQLi, SSRF, shell injection, RAG poisoning, memory poisoning, excessive agency, hallucination, and MCP/tool abuse. Biggest weakness is not breadth; it is **fast-moving complexity**. The recurring complaint pattern is provider/config/API edge-case breakage because the surface area is huge.
- **garak**: most scanner-like competitor to a security CLI. I counted **36 probe files**, **27 detector files**, **21 generator files**. Strong on jailbreaks, prompt injection, leakage, package hallucination, misinformation, malwaregen, web injection. Weak on app authz, CI ergonomics, and MCP today. Complaint pattern: **provider/API compatibility and environment friction** as model APIs change.
- **PyRIT**: richest attack-framework / research-workbench shape. I counted **12 attack strategy modules**, **77 prompt converters**, **165 jailbreak templates**. Strong on jailbreaks, persuasion/deception, multimodal attacks, leakage, cyber, long attack workflows. Weak on one-command scanner DX, CI ergonomics, and shipped MCP coverage. Complaint pattern: **heavyweight framework / docs / setup burden** rather than lightweight scanner usability.
- **ART**: still big and respected, but mainly for classical adversarial ML. Good brand, weak relevance for practical LLM app security. Best viewed as adjacent research infra, not a modern LLM red-team CLI competitor.
- **LLM Guard**: guardrail/filter toolkit, not a true offensive scanner. I counted **16 input scanners**, **22 output scanners**, and **94 secrets plugins**. Strong for prompt scanning, secrets/PII, toxicity, regex, policy-style enforcement. Weak for exploit generation, multi-turn adversarial flows, authz/tool abuse, and end-to-end red teaming. Complaint pattern: **dependency/install/memory friction**.
- **Rebuff**: focused prompt-injection detector with **3 Python detection paths** and **3 TS tactics**. Narrow coverage, older/staler repo, and still-open issues around local deployment, SDK correctness, validation, and prompt-length handling. Complaint pattern: **immature operational surface**.
- **Giskard OSS**: important adjacent player, but current README explicitly says **v3 is a rewrite** and that **v2 scan remains the legacy vulnerability scanner**. That makes it relevant, but not the cleanest direct competitor for a new security CLI.
- **DeepEval**: massive momentum, excellent eval DX, explicit MCP metrics, but it is still primarily an **evaluation framework**, not a focused security scanner. Strong distribution risk, weaker security specialization.

### Direct answers to the ticket questions

- **Which tools are growing fastest right now?** Promptfoo by a huge margin. Then, in the adjacent eval layer, DeepEval. Among security-first tools, garak is the next strongest mover.
- **What is the #1 complaint about each tool?**
- promptfoo: too much config/provider/API edge-case churn for a tool with this much surface area.
- garak: provider/model compatibility and setup friction.
- PyRIT: heavyweight framework complexity and slower time-to-first-scan.
- ART: wrong abstraction for modern LLM app security work.
- LLM Guard: install/dependency/runtime overhead and scanner operational friction.
- Rebuff: narrow scope plus stale / fragile SDK and deployment path.
- **Does anyone test MCP servers?** **Yes.** Promptfoo already does. It now has an MCP security guide, an MCP plugin, and MCP red-team examples. Also important: other projects are clearly reacting. Fresh open issues this week show the market sees the gap: promptfoo `#8276`, garak `#1639`, PyRIT `#1470`, llm-guard `#330`.
- **What attack category has no good OSS coverage yet?** The strongest unmet need is **deterministic MCP/tool security**, especially protocol-level misuse, permission-boundary regression, stateful approval/auth flows, cross-server tool poisoning, and cheap CI replay against real tool schemas. Current tools mostly stop at prompt-level simulation or broad evals.
- **What would make a developer choose a new tool over promptfoo?**
- a truly **MCP-first** product instead of a general AI eval platform
- **deterministic findings** instead of heavy dependence on LLM-as-judge everywhere
- **single-binary / low-friction install**
- **cheap CI mode** with stable diffs and exploit replay
- deeper **tool auth / permission / state regression** checks
- opinionated **security baseline packs** for agent + tool stacks

### Here is what nobody covers yet

- **Real MCP protocol abuse testing as a first-class product**, not just a plugin or roadmap issue.
- **Permission-boundary regression for tools**: “can this agent call this tool / object / action after a config change?”
- **Cross-server poisoning and tool shadowing** with reproducible CI fixtures.
- **Stateful memory + approval-flow abuse** over longer multi-turn agent runs.
- **Deterministic exploit replay** against tool schemas and server contracts with low token burn.
- **MCP-first developer experience**: one install, one scan command, one report, one GitHub Action.

### V1 implication

If we build here, the cleanest V1 is **not** “another general red-team framework.” It is:

**an MCP-first security CLI for agent/tool systems** with deterministic protocol checks, authz regression, exploit replay, and CI-native reporting.
