---
title: Competitive Landscape
description: Competitor analysis, evidence-based improvement techniques, and research papers driving pwnkit's roadmap.
---

Synthesis of competitive intelligence and published research on autonomous pentesting agents, benchmarked against the [XBOW validation suite](https://github.com/xbow-engineering/validation-benchmarks) (104 Docker CTF challenges). Data current as of April 2026.

For pwnkit's own benchmark scores, see the [Benchmark](/benchmark/) page. For the Shannon-specific gap analysis, see [XBOW Analysis](/research/xbow-analysis/).

## Competitor breakdown

| Agent | Score | Model | Approach | Cost | Key differentiator |
|-------|-------|-------|----------|------|--------------------|
| [Shannon](https://github.com/KeygraphHQ/shannon) | 96.15% (100/104) | Claude Opus/Sonnet/Haiku 3-tier | White-box, multi-agent | ~$50/scan | Source-to-sink taint analysis |
| [KinoSec](https://kinosec.ai) | 92.3% (96/104) | Claude Sonnet 4.6 | Black-box only | Unknown (proprietary) | 50-turn hard cap, pure HTTP |
| [Cyber-AutoAgent](https://medium.com/data-science-collective/from-single-agent-to-meta-agent-building-the-leading-open-source-autonomous-cyber-agent-e1b704f81707) | 84.62% (88/104) | Not disclosed | Single meta-agent | Unknown | Self-rewriting prompts |
| [deadend-cli](https://xoxruns.medium.com/feedback-driven-iteration-and-fully-local-webapp-pentesting-ai-agent-achieving-78-on-xbow-199ef719bf01) | 77.55% (~76/98) | Kimi K2.5 | Single-agent CLI | $122/104 challenges | ADaPT recursive decomposition |
| [MAPTA](https://arxiv.org/abs/2508.20816) | 76.9% (80/104) | GPT-5 | 3-role multi-agent | $21.38 total | Evidence-gated branching |

### Shannon (96.15%)

13-agent Temporal workflow system. Runs 5 parallel vulnerability+exploit agent pairs (injection, XSS, auth, authz, SSRF), each with 200-400 line domain-specific prompts. The white-box pipeline starts with source-to-sink taint analysis -- 6 pre-recon sub-agents scan architecture, entry points, security patterns, XSS sinks, SSRF sources, and data security before any exploit agent fires. Structured exploitation queues route findings between agents. The 3-tier model strategy uses Opus for planning, Sonnet for exploitation, and Haiku for classification. At ~$50 per scan and 10,000 max turns, Shannon buys accuracy with compute.

### KinoSec (92.3%)

Proprietary black-box agent. Uses Claude Sonnet 4.6 with a hard 50-turn budget. No source code access, no Playwright, pure HTTP. The score is remarkable given the constraints -- it implies near-perfect exploitation efficiency on every challenge it attempts. Closed-source, so architecture details are limited, but the 50-turn cap suggests extremely focused prompt engineering and tool selection.

### Cyber-AutoAgent (84.62%)

The biggest leap on the leaderboard: 46% to 84.62% through architecture changes alone. Single meta-agent with self-rewriting prompts -- the agent modifies its own system prompt based on challenge feedback. Uses a tool router hook to dynamically select tools and mem0 vector memory to persist knowledge across turns. No multi-agent coordination overhead. The self-rewriting prompt mechanism is the standout innovation: the agent literally edits its instructions mid-run.

### deadend-cli (77.55%)

Single-agent CLI using ADaPT (Adaptive Decomposition and Planning for Tasks) recursive decomposition. Breaks complex challenges into sub-tasks, solves them sequentially, and backtracks on failure. Custom Playwright integration with RFC-bypass for browser-based challenges. Runs on Kimi K2.5 at $122 for all 104 challenges ($1.17/challenge). Notable for solving blind SQLi challenges that trip up most agents. Proves you don't need multi-agent to reach 78%.

### MAPTA (76.9%)

Academic 3-role system: coordinator, sandbox executor, and validator. The coordinator plans attack strategy, the sandbox runs exploits in isolation, and the validator checks whether output constitutes a real flag. Evidence-gated branching means the system only pursues exploitation paths backed by concrete evidence from prior steps -- no speculative tool calls. Runs on GPT-5 for $21.38 total across all 104 challenges ($0.21/challenge). Published as a research paper with full methodology.

## The meta-finding

Architecture matters less than tools + memory + search.

Shannon's 13-agent system scores 96%. Cyber-AutoAgent's single agent with self-rewriting prompts scores 84.62%. MAPTA's 3-agent academic system scores 76.9%. deadend-cli's single agent scores 77.55%.

The common thread across top performers is not agent count. It is:

1. **Tool quality** -- real security tools (sqlmap, Playwright, curl) beat structured wrappers
2. **Memory** -- persisting context across turns (mem0, relay, checkpoints) prevents repeated work
3. **Search** -- exploring multiple exploit paths (tree search, parallel pairs, backtracking) catches what linear execution misses

Shell + external memory can match multi-agent at 7.4% of the cost. Context quality drops past 40% fill -- relay or reset is the fix.

## Evidence-based improvement techniques

Ranked by expected impact and implementation complexity. Estimates based on challenge-level gap analysis against the XBOW benchmark.

| Rank | Technique | Expected impact | Cost multiplier | Status |
|------|-----------|----------------|-----------------|--------|
| 1 | Early-stop + retry at turn 20 | +3-5 flags | 1x | **Shipped** |
| 2 | Blind SQLi script templates | +2-4 flags | 1x | **Shipped** |
| 3 | Patched fork for all 104 challenges | +10-15 flags | 1x | **Shipped** |
| 4 | Context relay at 30k tokens | +3-5 flags | 1x | Planned |
| 5 | Dynamic playbooks after recon | +3-5 flags | 1x | Planned |
| 6 | EGATS tree search | +5-9 flags | 2-3x | Planned |
| 7 | Best-of-3 racing | +5-8 flags | 3x | Evaluating |
| 8 | External working memory | +2-3 flags | 1x | Planned |
| 9 | Confidence-gated spawn_agent | +2-4 flags | 1.5x | Planned |
| 10 | RAG from prior solves | +2-4 flags | 1x | Planned |

### Shipped

**Early-stop + retry at turn 20.** When the agent has not made progress by turn 20, kill the run and restart with a fresh context window. Prevents the agent from burning 80 turns on a dead-end approach. Based on MAPTA's finding that 40 tool calls is the sweet spot -- if you're halfway through with nothing, reset.

**Blind SQLi script templates.** Pre-built exploitation scripts for time-based and boolean-based blind SQL injection. The agent injects these into the shell rather than trying to write sqlmap commands from scratch. deadend-cli's blind SQLi solves motivated this -- the challenge type has high variance without templates.

**Patched XBOW fork for all 104 challenges.** Several XBOW challenges had environment bugs (broken Docker configs, missing dependencies, timing issues). The patched fork fixes these so the agent isn't fighting infrastructure. This is the single highest-impact change: +10-15 flags from challenges that were previously unsolvable due to benchmark bugs.

### Planned

**Context relay at 30k tokens.** When the context window hits 30k tokens (~40% of a 75k window), extract key findings and relay them to a fresh context. Prevents the quality degradation observed past 40% fill. The agent loses ability to connect earlier findings to current state as context grows. Relay resets this.

**Dynamic playbooks after recon.** After the initial recon phase, generate a challenge-specific playbook based on what the agent found (tech stack, endpoints, auth mechanism). Replaces the generic 25-line prompt with targeted instructions. Cyber-AutoAgent's self-rewriting prompts are the extreme version of this.

**EGATS tree search.** Explore-Generate-Assess Tree Search. Instead of linear turn-by-turn execution, branch at decision points and explore multiple exploit paths in parallel. Prune low-confidence branches early. Based on the EGATS paper's application to code generation, adapted for exploit generation. Expected 5-9 flag improvement at 2-3x cost.

**Best-of-3 racing.** Run 3 independent attempts at each challenge, take the best result. Simple but expensive (3x cost). Effective because pentesting has high variance -- the same agent with the same prompt solves different challenges on different runs. Diminishing returns past 3 attempts.

**External working memory.** Persist structured notes (discovered endpoints, credentials, observed behaviors) in a memory store the agent can query. Prevents the agent from re-discovering information it already found. Inspired by Cyber-AutoAgent's mem0 integration.

**Confidence-gated spawn_agent.** When the primary agent is stuck, spawn a sub-agent for a specific sub-task (e.g., "decode this JWT" or "find the admin endpoint"). Only spawn when the primary agent's confidence is low. Avoids the coordination overhead of always-on multi-agent while getting the benefit when needed.

**RAG from prior solves.** Build a vector index of successful exploit chains from prior runs. When the agent encounters a similar challenge, retrieve relevant prior solves as context. Bootstraps experience without increasing the model's context window.

## Key research papers

| Paper | Reference | Key finding for pwnkit |
|-------|-----------|----------------------|
| Meta-analysis of AI pentesting agents | arXiv:2602.17622 | Architecture matters less than tools + memory + search |
| MAPTA | arXiv:2508.20816 | 3-role system with evidence-gated branching, 40 tool calls is the sweet spot, $0.21/challenge |
| Co-RedTeam | Published 2025 | Multi-agent red teaming with shared memory improves coverage |
| TermiAgent | Published 2025 | Terminal-native agents outperform structured-tool agents on security tasks |
| CurriculumPT | Published 2025 | Curriculum learning for penetration testing -- easy challenges first improves hard-challenge performance |
| CHAP | NDSS 2026 | Challenge-aware heuristic attack planning, presented at top security venue |

The meta-analysis (arXiv:2602.17622) is the most directly relevant. Its core claim -- that the combination of tool quality, memory persistence, and search breadth predicts performance better than agent count or model choice -- aligns with pwnkit's shell-first philosophy. The paper surveyed all major agents on the XBOW benchmark and found that single-agent systems with good tools consistently outperform multi-agent systems with mediocre tools.

MAPTA's evidence-gated branching is the clearest academic validation of "don't speculate, verify." Their system refuses to pursue an exploitation path unless prior steps produced concrete evidence. This is the principle behind pwnkit's early-stop mechanism: if you haven't found evidence of progress by turn 20, you're speculating.

CHAP at NDSS 2026 introduces challenge-aware heuristic planning -- the agent classifies the challenge type before attacking and selects a heuristic attack plan. This is the academic version of pwnkit's planned dynamic playbooks feature.

## What we've shipped

| Feature | Based on | Impact |
|---------|----------|--------|
| Early-stop + retry | MAPTA turn budget data | +3-5 flags |
| Blind SQLi templates | deadend-cli blind SQLi solves | +2-4 flags |
| Patched XBOW fork | Challenge-level bug analysis | +10-15 flags |
| Shell-first architecture | TermiAgent, meta-analysis | Foundation -- 7.4% cost of multi-agent |

## What's next

**Near-term (next 2 weeks):**
- Context relay at 30k tokens -- the single highest-impact unshipped technique
- Dynamic playbooks after recon -- leverage the agent's own recon to specialize its prompt

**Medium-term (next month):**
- EGATS tree search -- the highest expected flag improvement (+5-9) of any planned technique
- External working memory -- prevents re-discovery, enables cross-run learning

**Longer-term:**
- RAG from prior solves -- requires a corpus of successful runs to bootstrap
- Confidence-gated sub-agents -- requires reliable confidence estimation, which is an open research problem
