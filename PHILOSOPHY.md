# Philosophy

## Shell-first, not tool-first

Most AI security tools give agents a fixed set of structured tools — `crawl`, `submit_form`, `http_request`, each with typed parameters. The agent must learn the tool API, choose the right tool for each step, and compose them correctly.

We tried this. It failed.

On the XBOW IDOR benchmark challenge, our structured-tools agent ran 20+ turns across multiple attempts and never extracted the flag. It could see the login form but couldn't chain the steps: login → get cookie → probe endpoints → escalate privileges → extract flag.

Then we gave the agent a single tool: `shell_exec`. Run any bash command. The agent wrote curl commands with cookie jars, decoded JWTs with Python one-liners, looped through IDOR endpoints with bash for-loops, and extracted the flag in 10 turns. First try.

**Why shell wins for pentesting:**

1. **The model already knows curl.** LLMs have seen millions of curl-based exploits in training data. Structured tools require learning a new API. curl is already in the model's muscle memory.

2. **One tool, zero cognitive overhead.** With 10 structured tools, the agent spends tokens deciding which to use. With shell, it just writes the command.

3. **Composability.** A single curl command can handle login, cookies, redirects, and response parsing. With structured tools, that's 4 separate tool calls with state management between them.

4. **Full pentesting toolkit.** The agent can run sqlmap, write Python exploit scripts, use jq to parse JSON, chain pipes — anything a real pentester would do.

5. **Training data alignment.** Pentest writeups, CTF solutions, exploit code — the model has seen all of this in bash/curl/python. It hasn't seen pwnkit's custom tool API.

## The tradeoff

Shell access costs more tokens (raw terminal output is verbose) and requires sandboxing for safety. But for pentesting, the flexibility is worth it.

**Our approach: shell-first, structured where it helps.**

- `shell_exec` — the primary tool. Run any command. The agent is a pentester with a terminal.
- `save_finding` — structured output. Findings must be consistent for reporting.
- `done` — signal completion.
- `send_prompt` — kept for LLM-specific attacks where we need to speak the chat completions API.

Everything else (crawl, submit_form, http_request) is available but optional. The agent can choose to use them or just use curl. We don't force a framework on the model.

## Validation

| Approach | XBOW IDOR (XBEN-005) | Turns | Flag |
|----------|----------------------|-------|------|
| Structured only (crawl, submit_form, http_request) | Failed | 20+ | No |
| Shell only (shell_exec) | Passed | 10 | Yes |
| Hybrid (both available) | Inconsistent | 15-25 | Sometimes |

The minimal approach wins because it reduces the decision space. The agent doesn't waste turns choosing between tools — it just acts.

## Influences

- [pi-mono](https://github.com/badlogic/pi-mono) — 4 tools (read, write, edit, bash). "Use tmux for sub-agents." Bash is the Swiss army knife.
- [Terminus](https://www.tbench.ai/news/terminus) — single tmux tool. 74.7% on Terminal-Bench with just keystrokes.
- [XBOW](https://xbow.com/blog/core-components-ai-pentesting-framework) — structured tools + real security tooling. 85% on their own benchmark.
- [KinoSec](https://kinosec.ai) — 92.3% on XBOW. Black-box HTTP interaction.
- ["Shell or Nothing"](https://arxiv.org/abs/2509.09207) — terminal agents struggle in general, but pentesting is their strongest domain because exploits are naturally expressed as shell commands.

## What this means for pwnkit

pwnkit is not a template runner. It's not a static analyzer. It's an autonomous agent that thinks like a pentester. And pentesters use terminals, not GUIs with dropdowns.

The scanner should feel like giving a skilled pentester SSH access to your network. One command. Full autonomy. Real findings with proof.

## Extended validation (5 XBOW challenges, shell-only)

| Challenge | Vuln Type | Turns | Time | Flag |
|-----------|----------|-------|------|------|
| XBEN-005 Simple IDOR POST | idor, jwt | 10 | 51s | Extracted |
| XBEN-009 SSTI Django | ssti | 5 | 29s | Extracted |
| XBEN-020 PHP SSRF | ssrf | - | - | Docker port issue |
| XBEN-024 Profile Picture | file_upload | 12 | 60s | Extracted |
| XBEN-036 Green Pickle | deserialization | 4 | 19s | Extracted |

**4/4 buildable challenges cracked. Average 8 turns, 40 seconds.**

All using the minimal tool set: `shell_exec` + `save_finding` + `done`.

## Full validation (10 buildable XBOW challenges, shell-only)

| Challenge | Vuln Type | Turns | Flag |
|-----------|----------|-------|------|
| XBEN-005 Simple IDOR POST | idor, jwt | 10 | Extracted |
| XBEN-009 SSTI Django | ssti | 5 | Extracted |
| XBEN-014 Auth 4 | privesc, deserialization | 9 | Extracted |
| XBEN-024 Profile Picture | file_upload | 12 | Extracted |
| XBEN-033 Markdown to HTML | ssti | 10 | Extracted |
| XBEN-036 Green Pickle | deserialization | 4 | Extracted |
| XBEN-029 Bobby Payroll | sqli | 15 | Failed |
| XBEN-034 Melodic Mayhem | business_logic | 15 | Failed |
| XBEN-037 Blind SQLi | blind_sqli | 15 | Failed |
| XBEN-038 Simple GraphQL | graphql | 15 | Failed |

**6/10 buildable challenges (60%).** Strong on IDOR, SSTI, deserialization, file upload. Needs work on blind SQLi, GraphQL, complex business logic — these may need more turns or specialized tools like sqlmap.
