# pwnkit Roadmap

This roadmap is opinionated. It prioritizes product leverage over surface-area creep.

The current thesis is:

1. Make the core agentic pipeline trustworthy.
2. Make the outputs operationally useful for real teams.
3. Then add orchestration and control-plane UX on top.

## Current Shape

pwnkit already has the foundation for a real agentic security platform:

- multi-stage prepare → analyze → research → verify → report pipeline
- blind verification to kill false positives
- local scan history, findings, pipeline events, and agent session persistence
- local operations shell for attack-thread workflow, evidence review, runtime health, and scan provenance
- CLI output, HTML reports, JSON, Markdown, and SARIF
- GitHub Action support and CI-safe runtime paths

What is still missing is not "more scanning modes" as much as stronger workflow, replay, and control-plane ergonomics.

## Now

These are the highest-leverage next steps.

### 1. Resumable scans

Goal: if a long review or scan dies, resume from stored state instead of restarting.

Why:

- the repo already persists `agent_sessions` and `pipeline_events`
- long-running agentic workflows are expensive to restart
- this makes pwnkit feel like infrastructure instead of a disposable CLI run

Deliverables:

- `pwnkit-cli resume <scan-id>`
- stage-level checkpointing
- partial-result recovery after crash or timeout
- resume-safe report generation

### 2. Finding inbox and triage workflow

Goal: make findings manageable across repeated runs.

Why:

- "found a thing" is not enough for teams
- repeated findings need dedupe, suppression, and audit history

Deliverables:

- finding fingerprinting across scans
- statuses such as `new`, `accepted`, `suppressed`, `needs-human`, `regression`
- suppression rules with reason + expiration
- comments/notes on findings
- diff view between scans

### 3. Diff-aware PR scanning

Goal: make the GitHub Action and CI path fast enough to use on every PR.

Why:

- full deep review on every pull request is too expensive
- most teams want "changed files first, expand when suspicious"

Deliverables:

- changed-file targeting for `review`
- priority scoring for touched paths, auth, secrets, network, tool-use, eval-like sinks
- optional fallback to full review on high-risk deltas
- PR summary output tuned for reviewer action

### 4. Deterministic replay for every finding

Goal: every confirmed finding should be reproducible on demand.

Why:

- replay is how the tool earns trust
- it is the bridge between "AI said so" and "I can see it myself"

Deliverables:

- replay command from finding ID
- saved exploit inputs/requests/prompts
- verifier transcript and verdict trace
- artifact bundle for share/export

## Next

These become much more valuable once the items above are solid.

### 5. Multi-target orchestration

Goal: scan many repos, packages, or endpoints as one campaign.

This is where subagents actually matter.

Good use of subagents:

- fan out research across many targets
- parallel blind verification
- aggregate results into one campaign view

Bad use of subagents:

- navigation gimmicks
- vague "AI assistant" behavior with no task boundary

Deliverables:

- campaign runs
- worker pool / concurrency controls
- queueing and retry policy
- shared target inventory and cross-target clustering

### 6. Local dashboard / operations shell

Goal: expose the stored scan state as a real operator interface for running the autonomous control plane, working the review inbox, and inspecting runtime failures.

This should start as a local web dashboard, not a bloated hosted SaaS surface.

Status:

- baseline shipped: grouped findings, thread-level workflow, quick filtering, scan dossiers
- next cut: operations-first home, active run stage progress, replay launch, and better provenance links between threads and runs

Core views:

- operations control as the primary home
- review inbox for operator decisions and blocked automation
- scan dossiers and pipeline timelines as supporting provenance views
- replay/evidence viewer
- target inventory
- scan history and trend charts

### 7. Fuzzy navigation

Goal: make it trivial to jump around accumulated scan state.

Worth building:

- fuzzy find scans
- fuzzy find findings
- fuzzy find targets
- fuzzy find templates / attack payloads

Not worth overcomplicating:

- "fuzzy find with subagents"

That is a UX feature, not an orchestration model.

## Later

These are valuable, but they should not outrank the workflow/control-plane work above.

### 8. Policy packs and organization presets

- suppressions as code
- severity gates by environment
- org-level runtime/model defaults
- approved attack template sets

### 9. Richer target inventory and trend analysis

- first-seen / last-seen attack surface changes
- recurring finding families
- regression alerts
- "what changed since last green run"

### 10. Distributed workers / remote execution

- remote queue workers
- large campaign execution
- shared artifact store
- eventually a hosted control plane if adoption justifies it

## Non-Goals Right Now

Things that sound flashy but should stay below the line for now:

- a giant SaaS dashboard before the local workflow is excellent
- "chat with your findings" before replay, dedupe, and triage are strong
- adding lots of new scan modes without stronger replay and campaign ergonomics
- subagents used as UI magic instead of bounded workers

## Product Direction

The best version of pwnkit is:

- a sharp local CLI for one-off deep work
- a reliable CI primitive for PRs and repos
- a persistent evidence store for findings and agent runs
- a local operations shell on top of that state
- eventually a separate distributed agentic security control plane for campaigns and remote workers

That is more compelling than being "yet another scanner with more templates."
