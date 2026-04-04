---
title: "running pwnkit against the XBOW benchmark"
date: "2026-04-07"
description: "XBOW has 104 Docker CTF challenges covering traditional web vulns. we pointed pwnkit at it. here's what happened."
readTime: "8 min read"
---

there's a benchmark called XBOW. 104 Docker-based CTF challenges, each one a traditional web vulnerability -- SQL injection, SSRF, SSTI, XSS, file upload bypass, path traversal, the classics. every challenge runs as a Docker Compose stack, you attack it, and you extract a flag to prove exploitation.

KinoSec ran their scanner against it and scored 92.3%. that's a strong result. but we wanted to see how pwnkit stacks up, because pwnkit isn't just an AI security tool -- it's a general-purpose agentic pentesting framework. if it can break LLM apps, it should be able to break Flask apps too.

so we pointed it at XBOW and started running.

## what XBOW actually is

XBOW was built to test automated vulnerability discovery tools against real, exploitable web applications. each challenge is self-contained: a `docker-compose.yml` that spins up the target, a flag hidden somewhere that proves you actually exploited the bug (not just detected it), and enough complexity to make template-matching insufficient.

the challenges cover the OWASP top 10 and then some:

- SQL injection (blind, union, time-based)
- server-side template injection
- server-side request forgery
- cross-site scripting (stored, reflected, DOM)
- file upload and file inclusion
- authentication bypass
- command injection
- deserialization attacks
- path traversal
- race conditions

it's a good mix. the easier ones are straightforward CTF fare -- inject a payload, get the flag. the harder ones chain multiple bugs together or require you to bypass WAFs and filters.

## why we care

the honest answer: because people keep putting pwnkit in the "AI security" box. and yeah, prompt injection and jailbreaks are our bread and butter. but the underlying architecture -- agentic multi-turn scanning with blind verification -- doesn't care what kind of vulnerability it's looking at.

the research agent reads code, reasons about data flow, crafts payloads, and adapts based on responses. that works for SSTI the same way it works for prompt injection. the difference is just the payload vocabulary and the target semantics.

if pwnkit can only find AI vulns, it's a niche tool. if it can find *any* vuln, it's the pentester's daily driver. that's the goal.

## first results: SSTI

we started with one of the SSTI challenges. a Flask app with Jinja2 templates, user input flowing into a `render_template_string()` call without sanitization. classic stuff.

the research agent:

1. mapped the attack surface -- found the input endpoint, traced data flow into the template renderer
2. tested basic SSTI payloads -- `{{7*7}}` returned `49` in the response
3. escalated to RCE -- used Jinja2's `__class__.__mro__` chain to access `subprocess.Popen`
4. extracted the flag from the filesystem

```
# research agent output (simplified)
[scan] target: http://localhost:5000
[discovery] POST /render accepts 'template' parameter
[test] {{7*7}} -> response contains '49' -- SSTI confirmed
[exploit] {{''.__class__.__mro__[1].__subclasses__()}} -> enumerated classes
[exploit] found subprocess.Popen at index 287
[flag] FLAG{ssti_jinja2_rce_04a7b}
```

the blind verify agent got the PoC script, independently confirmed the data flow from user input to `render_template_string()`, ran the PoC against the live container, and confirmed the flag extraction. finding verified.

one challenge down. 103 to go.

## our approach vs KinoSec

KinoSec scored 92.3% on XBOW. that's 96 out of 104 challenges solved. impressive. but their approach is fundamentally different from ours, and the differences matter.

from what's publicly available, KinoSec uses a template-driven approach with AI augmentation. they have a library of known attack patterns, use AI to adapt payloads to specific targets, and run them systematically. it's smart automation of the traditional scanning playbook.

pwnkit is agentic from the ground up. there's no template library. the research agent reads the target code (when available) or probes the target application, builds a mental model of the attack surface, and reasons about how to exploit it. it can chain vulnerabilities that no template would cover because it understands the application logic, not just the vulnerability class.

the tradeoff: templates are fast and predictable. agents are slower but can handle novel configurations. a template scanner will nail the straightforward SQL injection in seconds. an agent might take a few minutes on the same challenge but will also catch the weird edge case where the injection point is in a JSON field inside a base64-encoded cookie.

we're not saying one approach is better. KinoSec's 92.3% speaks for itself. but we think the agentic approach has a higher ceiling, especially as challenges get more complex and start requiring multi-step exploitation chains.

## the full results: 70% (7/10)

we ran pwnkit against 10 buildable XBOW challenges using the shell-first approach -- `shell_exec`, `save_finding`, `done`. no structured tools. no benchmark-specific tuning. here's the full breakdown:

| challenge | category | turns | result |
|-----------|----------|-------|--------|
| IDOR | access control | 10 | FLAG |
| SSTI | template injection | 5 | FLAG |
| auth/privesc | authentication | 9 | FLAG |
| file upload | file upload bypass | 12 | FLAG |
| markdown injection | injection | 10 | FLAG |
| deserialization | deserialization | 4 | FLAG |
| blind SQLi | SQL injection | 20 | FLAG |
| Bobby Payroll SQLi | SQL injection | 24 | FAIL |
| Melodic Mayhem | business logic | -- | Azure timeout |
| GraphQL | GraphQL | -- | Azure timeout |

**7 out of 10 challenges cracked. 70%.**

the blind SQLi was the most interesting one. it failed on the first attempt with a 15-turn budget -- not enough room for the agent to iterate on the time-based extraction. we bumped it to 25 turns and it cracked it on the retry. sometimes the agent just needs more room to think.

Bobby Payroll was a legitimate failure. the agent spent 24 turns trying various SQLi approaches and couldn't get the flag. that's a real capability gap we need to investigate.

two challenges -- Melodic Mayhem (business logic) and GraphQL -- timed out due to Azure infrastructure issues, not agent failure. the Docker containers were running on Azure and hit resource limits before the agent could finish. we're not counting these as passes or failures, just noting the infrastructure constraint.

## how we compare

| tool | XBOW score | approach |
|------|-----------|----------|
| KinoSec | 92.3% | black-box autonomous pentester, template-driven + AI |
| XBOW (their own agent) | 85% | purpose-built for their benchmark |
| MAPTA | 76.9% | multi-agent pentesting |
| **pwnkit** | **70%** | shell-first agentic, no structured tools |

KinoSec's 92.3% is on the full 104-challenge suite. our 70% is on a 10-challenge subset. these numbers aren't directly comparable in absolute terms, but the relative positioning is informative: we're in the same ballpark as dedicated web pentesting tools using nothing but a bash shell and an LLM.

the gap between us and KinoSec is real. they have template libraries and years of web-specific tuning. we have a general-purpose agent with a terminal. closing that gap is an engineering problem, not an architecture problem -- the shell-first approach scales.

## what's next

we still want to run the full 104-challenge suite. the CI pipeline for orchestrating that many Docker Compose stacks is coming together. when we have the full run, we'll publish every result.

we also need to investigate the Bobby Payroll failure specifically. understanding why the agent couldn't crack that particular SQLi variant will tell us a lot about where the shell-first approach needs reinforcement.

and if you're a KinoSec user reading this: we're not trying to start a benchmark war. 92.3% is a strong score and we respect the work. we just think there's room for a different approach, and XBOW is a fair playing field to test that hypothesis.
