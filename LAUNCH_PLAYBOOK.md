# Nightfang Show HN Playbook

## Recommendation

Launch Nightfang on **Tuesday at 9:05am ET**.

Why this slot:
- It matches the strongest recurring Show HN timing guidance from current HN/launch studies.
- It lands at **6:05am PT** for SF/West Coast builders and **2:05pm Zurich** for the team, so the first 3-4 hours are still fully coverable from Europe.
- It avoids Friday/weekend drop-off and late-day competition.

Fallback: **Wednesday 9:05am ET**.

## What Nightfang Should Be On HN

Do **not** position Nightfang as a broad "AI security platform."

Position it as:
- an **open-source CLI**
- for **scanning LLM endpoints, MCP servers, npm packages, and repos**
- with a sharp differentiator: **every finding is re-exploited to kill false positives**

That framing is stronger for HN because it is:
- concrete
- testable in minutes
- legible to developers without a sales pitch
- easy to compare against existing tools like promptfoo, garak, semgrep, nuclei, and trufflehog

## What Worked In Comparable HN Launches

### 1. Clear, narrow utility beats broad vision
The strongest comparable security/AI launches explain the tool in one sentence and one command.

Working pattern:
- "CLI for testing prompts"
- "scanner for MCP servers"
- "offline analyzer for AI skills"

Weak pattern:
- "platform for securing the AI era"
- "comprehensive AI security solution"

### 2. Open source + local-first matters
HN is much more receptive when the tool:
- runs locally
- avoids signup walls
- has a GitHub repo immediately visible
- shows actual output formats like SARIF / JSON / Markdown

Nightfang already has this advantage. Lean into it.

### 3. Builders win when they explain why they built it
The strongest Show HN threads seed discussion with:
- the pain that triggered the build
- the technical design choice
- what is different from existing tools
- where it is still incomplete

### 4. Specific numbers increase credibility
Nightfang should use real product numbers that are already in the README, such as:
- 5 commands
- 4-agent pipeline
- OWASP LLM Top 10 coverage
- verified findings instead of raw detections
- scan depth / cost ranges

### 5. Security launches are crowded right now
Recent HN security scanner posts are getting published constantly. That means Nightfang cannot rely on category novelty alone. It needs a sharper hook:

**"verified AI security findings, not another noisy scanner"**

## Research On The Named Reference Launches

### promptfoo
This is the cleanest direct comparable.

What it did right:
- CLI framing immediately visible in the title
- specific use case, not abstract vision
- easy to try without enterprise setup
- discussion naturally moved to evaluation details and use cases

Lesson for Nightfang:
- present the command first
- show one high-signal use case immediately
- make the discussion about technique, not category definition

### Supabase
Supabase launches consistently work when they package a sharp developer job-to-be-done inside a trusted open-source brand.

What they do right:
- concrete utility first
- excellent docs / README polish
- familiar workflow integration
- obvious reason to try it today

Lesson for Nightfang:
- the README is part of the launch
- CI/GitHub Action integration should appear in the post and first comment
- make adoption feel like "I can add this in 10 minutes"

### TruffleHog and Nuclei
I could not verify a canonical breakout Show HN thread for either tool quickly enough to treat it as a proven single-thread playbook. Their HN footprint appears more distributed across repeated discussions, references, and ecosystem adoption than one legendary Show HN moment.

Useful lesson anyway:
- both tools became defaults because they are dead simple to explain
- each owns a specific security job
- each is scriptable and operationally useful, not just interesting

Lesson for Nightfang:
- own one memorable sentence: **"Nightfang scans AI systems and proves findings are real."**
- avoid looking like a bundle of disconnected features

## Title Strategy

Rules:
- keep it under 80 characters
- start with the product name
- say exactly what it does
- avoid hype words like "best", "first", or "platform"

## Recommended Title

**Show HN: Nightfang - Open-source AI security scanner with verified findings**

This is the strongest balance of:
- clarity
- credibility
- differentiation

## 5 Title Options

1. **Show HN: Nightfang - Open-source AI security scanner with verified findings**
2. **Show HN: Nightfang - Scan LLM apps and prove every vuln is real**
3. **Show HN: Nightfang - Security scanner for LLM apps, MCP servers, and npm**
4. **Show HN: Nightfang - AI pentesting CLI for APIs, MCP, packages, and repos**
5. **Show HN: Nightfang - Open-source scanner for AI apps with SARIF output**

My ranking:
- #1 is best for HN
- #2 is best if you want a slightly more aggressive security hook
- #3 is best if broad target coverage matters more than the verification angle

## First Author Comment

Post this immediately if the body text does not render, or keep it ready to add within the first minute.

```md
Hi HN - I built Nightfang because most AI security tools either stop at generic prompt tests or dump a pile of noisy findings that someone still has to triage manually.

Nightfang is an open-source CLI that scans LLM endpoints, MCP servers, npm packages, and codebases. The core idea is simple: it does not just detect a possible issue, it tries to reproduce every finding again in a separate verification step so false positives get killed before the report is written.

Right now it supports five commands (`scan`, `audit`, `review`, `history`, `findings`), outputs SARIF/Markdown/JSON, and can run quick API scans or deeper source-backed reviews using local agent runtimes.

I wanted something that felt closer to `npx nightfang scan --target ...` than a security platform demo. If you have an LLM endpoint, MCP server, or a repo that would be a good torture test, I'd love to know where the scanner is too noisy, too shallow, or misses obvious attack paths.
```

Why this works:
- starts with builder motivation
- explains what it is in one sentence
- introduces the differentiator fast
- asks for substantive feedback instead of praise

## What The Submission Body Should Do

If the HN text field is available, keep it short and technical.

Suggested structure:
1. what Nightfang is
2. why it exists
3. what makes it different
4. one command example
5. GitHub link
6. one honest limitation

Suggested body:

```md
Hi HN - I built Nightfang, an open-source CLI for scanning LLM endpoints, MCP servers, npm packages, and repos for security issues.

The main thing I wanted to fix was scanner noise. Nightfang runs a discover -> attack -> verify -> report pipeline and tries to reproduce each finding before it reports it, so the output is closer to "confirmed issue with evidence" than "possible problem, go investigate."

It currently ships as `npx nightfang` with commands for live endpoint scans, npm package audits, and deeper repo reviews, plus SARIF output for GitHub code scanning.

Repo + examples: <GitHub repo>
```

## How Many People To Seed In The First Hour

**Do not organize upvotes. Do not ask friends to upvote. Do not pass around the HN link with a "please boost" message.**

Operationally, the right answer is:
- **0 people asked to upvote**
- **8-12 trusted technical peers** pre-briefed to try the repo / demo and optionally comment if they genuinely have something real to say

How to organize it:
- the night before, send the GitHub repo, screenshot, and 2-sentence explanation
- ask for honest feedback, not support
- once the post is live, only send the HN link to people who actually engaged with the product already
- the ask should be: **"if you have real feedback after trying it, feel free to post it"**

Avoid:
- Slack blasts asking for upvotes
- multiple votes from the same office/network
- fake "independent" comments from teammates
- paid communities or voting rings

## Time Zones That Matter

Primary audience windows:
- **US East Coast**: 8-11am ET
- **US West Coast**: 5-8am PT still matters because HN power users are active early
- **Europe**: afternoon visibility helps, but HN momentum is still driven mostly by US hours

For this team specifically:
- **9:05am ET = 6:05am PT = 2:05pm Zurich**

That is good enough to cover the HN core audience without forcing the Swiss side into an evening launch.

## Reddit: Simultaneous Or Wait?

**Wait.**

Recommendation:
- launch on HN first
- watch the first 4-6 hours
- adapt based on objections/questions
- post to Reddit later the same day or the next day in a more tailored format

Why:
- HN and Reddit reward different copy
- simultaneous posting splits attention during the only window that really matters on HN
- the HN thread will tell you what skeptics attack first; use that to improve the Reddit post

Best sequence:
1. HN at 9:05am ET Tuesday
2. X/Twitter post after the HN thread is live
3. Reddit after work hours or next day with a more narrative/security-community angle

## Launch Day Checklist

### T-24 hours
- confirm npm package install works from a clean machine
- confirm README quick start works exactly as written
- confirm one vulnerable demo target is ready for screenshots / gif / terminal output
- prepare GitHub repo link, one screenshot, one terminal output snippet
- pre-write title, body, first comment, X post, and Reddit draft
- make sure maintainer account has HN history and is not brand new if possible

### T-2 hours
- run final install + smoke test
- verify GitHub Action snippet still works
- verify examples and output paths in README
- have one teammate ready to monitor GitHub issues / repo stars / npm install problems

### T-15 minutes
- open the submission tab
- open repo, README, and demo links
- have the first comment copied and ready
- mute everything non-essential

### Launch: 9:05am ET
- submit with the final title
- if HN body text disappears, post the first author comment immediately
- do not post multiple follow-up comments unless questions require it

### First 30 minutes
- answer every substantive comment quickly and calmly
- lead with curiosity, not defense
- if someone points out a bug or unclear copy, fix README immediately
- never argue about whether the category matters; bring it back to what Nightfang actually does

### 30-120 minutes
- keep replying fast
- add clarification comments only when multiple people are confused about the same thing
- watch for repeated objections such as:
  - "how is this different from promptfoo / garak / semgrep / nuclei?"
  - "is this just another AI wrapper?"
  - "what does verify actually prove?"

### 2-4 hours
- patch docs based on thread feedback
- publish the X post with screenshot + repo link + one sentence about verified findings
- do **not** celebrate too early; stay in the thread

### 4-6 hours
- if the HN thread has traction, post a Reddit version tailored for security/dev audiences
- if traction is weak, do not panic-repost HN; improve docs and keep harvesting feedback

### End of day
- summarize top objections, best questions, and README fixes
- save great user comments for future landing page / FAQ copy
- decide whether to write a follow-up post on what the launch taught you

## Expected Objections And Recommended Answers

### "How is this different from promptfoo?"
Answer:
- promptfoo is excellent for LLM evals and prompt testing
- Nightfang is trying to own the security scanning workflow across endpoints, MCP, packages, and repos
- the core differentiator is verified findings rather than raw eval output

### "How is this different from garak / semgrep / nuclei?"
Answer:
- Nightfang is specifically for the AI application attack surface
- it combines live probing, repo review, and verification in one CLI workflow
- it complements, not replaces, traditional scanners

### "Is this just another AI wrapper?"
Answer:
- point to the concrete pipeline, target coverage, and verification logic
- point to local usage and machine-readable output
- avoid marketing abstractions; stay on implementation and workflow value

## Final Positioning Line

Use this line everywhere on launch day:

**Nightfang is an open-source AI security scanner that re-tests every finding before it reports it.**

That is the line most likely to make developers understand the product in one pass.
