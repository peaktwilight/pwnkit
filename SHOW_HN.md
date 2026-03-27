# Show HN Draft: Real Story Version

## Primary Title

Show HN: I found 7 CVEs with Claude Opus - now I'm open-sourcing the framework

## Safer Alternative Title

Show HN: Nightfang - Open-source AI security scanner built from 7 real CVEs

## Submission Body

Hi HN,

For the last few weeks I have been using Claude Opus 4.6 as a security research assistant to audit real npm packages the way a human researcher would: read source code, trace untrusted input, write proof-of-concept exploits, and throw away anything that does not reproduce.

That workflow led to 73 findings and 7 published CVEs, including:

- `node-forge` - certificate forgery bypass (`CVE-2026-33896`)
- `mysql2` - 4 vulnerabilities including connection override and prototype pollution
- `Uptime Kuma` / `LiquidJS` - SSTI bypass (`CVE-2026-33130`)
- `picomatch` - ReDoS (`CVE-2026-33671`)
- `jsPDF` - PDF injection + XSS (2 CVEs)

The important part is not "AI found bugs." The important part is that a very methodical workflow found bugs in production packages with millions of weekly downloads, and every serious finding had to survive verification with a working exploit before it counted.

Nightfang is the open-source version of that workflow.

It is a CLI that can:

- scan LLM endpoints and MCP servers
- audit npm packages
- review source code repos
- re-exploit findings to eliminate false positives
- output SARIF / Markdown / JSON reports

The pipeline is:

1. discover the attack surface
2. attack it with targeted prompts / payloads / code review
3. verify each finding independently
4. report only what reproduces

That verification step is the whole point. Most AI security tools generate a lot of "maybe" output. I wanted something closer to confirmed issues with evidence.

The broader reason I built this: software teams are moving toward agent-generated work at much higher volume. If code generation scales up, security review has to scale up too. Nightfang is my attempt at the security side of that equation.

A few example commands:

```bash
npx nightfang scan --target https://your-app.com/api/chat
npx nightfang audit node-forge
npx nightfang review ./my-repo
```

It is MIT licensed and live on npm.

Repo: https://github.com/peaktwilight/nightfang
Website: https://nightfang.dev
npm: https://www.npmjs.com/package/nightfang

I would especially value skepticism from people who do security work for a living. If the workflow looks noisy, over-claimed, or too agent-dependent, I want to hear that.

## First Author Comment

Posting this immediately after launch is recommended.

```md
Hi HN - a clarification because the title is easy to misread:

I am not claiming that an untouched open-source tool autonomously discovered all 7 CVEs end-to-end with no human judgment. The original results came from a real research workflow where I used Claude Opus as a methodical code-auditing assistant, then verified findings with PoCs and went through disclosure.

What I am open-sourcing is the framework and operating model that came out of that work.

The core idea is simple:

- use agents for the boring but high-volume part of security review
- force verification before a finding is reported
- make the output useful in normal engineering workflows instead of a red-team demo

Nightfang currently has three practical entry points:

- `scan` for LLM endpoints and MCP servers
- `audit` for npm packages
- `review` for source repos

If you want to tear it apart, the most useful feedback would be:

- where the claims are too broad
- where the verification logic is still weak
- what attack classes are missing
- whether the CLI / output format is actually usable

I expect skepticism here, which is fair. That is also why I wanted the launch hook to be real disclosed bugs instead of a theoretical benchmark.
```

## Hour-By-Hour Launch Checklist

### T-2 Hours

- Re-run `npx nightfang scan`, `audit`, and `review` from a clean shell to confirm the README path still works.
- Verify npm package metadata, GitHub repo visibility, homepage, and demo assets.
- Prepare one terminal screenshot and one short terminal output snippet that can be pasted into replies.
- Re-read the HN title and first comment for overclaiming. Remove anything that sounds like autonomous magic.

### T-30 Minutes

- Open HN submit page, repo, npm page, website, and this draft in separate tabs.
- Make sure the maintainer account is logged in and can comment immediately.
- Have the first author comment copied and ready.
- Confirm someone can watch GitHub issues during the first two hours.

### Hour 0: Submit

- Submit with the primary title unless it feels too aggressive at the last minute.
- If HN strips the body or it renders poorly, post the first author comment within the first minute.
- Do not share the HN link widely for votes.
- Only send it to people who already tried the product and have real feedback.

### Hour 1: Stay In Thread

- Reply quickly to the first technical questions.
- Prioritize questions about false positives, disclosure workflow, "did AI really find these?", and comparison to promptfoo / garak / semgrep.
- Be explicit about what was manual in the original CVE work versus what Nightfang automates now.
- If the same confusion appears twice, update the first comment or README wording immediately.

### Hour 2: Tighten Messaging

- Watch for the strongest skeptical objection. It will probably become the headline objection everywhere else too.
- Patch the repo README if the HN thread reveals confusing phrasing or missing caveats.
- Add one grounded reply with concrete examples from `node-forge` or `mysql2` if the discussion is drifting into abstraction.

### Hour 3: Expand Distribution Carefully

- Post the X thread after the HN thread has stabilized.
- Reuse the strongest HN phrasing, not the original draft, if the thread surfaced a better explanation.
- Do not split attention into Reddit yet unless HN momentum is clearly flat.

### Hour 4: Convert Curiosity Into Action

- Reply to any "how do I try this on my stack?" comments with the shortest possible command.
- Point people to one demo path: endpoint scan, package audit, or repo review.
- Log repeated feature requests or objections in the repo while they are fresh.

### Hour 5-6: Decide On Reddit And Follow-Ons

- If HN response is strong, prepare a Reddit post using the objections and clarifications from the thread.
- If HN response is mixed, fix the weak messaging first and delay Reddit until the story is tighter.
- Publish follow-up replies only if they add evidence, not defensiveness.

### End Of Day

- Summarize what resonated, what people distrusted, and what broke.
- Update README / website copy to match the language that actually worked.
- Save the best HN questions as input for docs, FAQ, and future launch copy.

## Talking Points To Keep Handy

- "The proof is not that AI can hallucinate vulns. The proof is that a disciplined workflow produced 7 disclosed CVEs."
- "Nightfang is the open-source productization of that workflow, not a retroactive claim that the current OSS release found all 7 by itself."
- "Verification is the product, not just attack generation."
- "If agent-generated code volume rises, agent-assisted security review has to rise too."
