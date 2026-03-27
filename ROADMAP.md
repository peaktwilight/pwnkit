# Nightfang Roadmap — Viral Features

## Launch Day: Tuesday March 31, 3:05pm CET (9:05am ET)

### DONE
- [x] npm published (v0.1.0)
- [x] GitHub public (peaktwilight/nightfang)
- [x] Website deployed (nightfang.dev)
- [x] Demo GIF in README (28s animated scan)
- [x] Remotion demo video (MP4)
- [x] Blog: "Why I Built Nightfang"
- [x] Blog: "How AI Agents Found 7 CVEs"
- [x] Blog: "The Age of Agentic Security"
- [x] Blog on doruk.ch: "Open-sourcing the framework that found 7 CVEs"
- [x] Interactive first run (npx nightfang → demo menu)
- [x] Attack replay terminal (--verbose, --replay)
- [x] Self-scan README badge (GitHub Action, needs workflow push)
- [x] Show HN post drafted
- [x] Twitter thread drafted
- [x] Reddit posts drafted (r/netsec, r/cybersecurity, r/programming, r/selfhosted)
- [x] Product Hunt draft
- [x] Launch playbook (hour-by-hour checklist)
- [x] Competitive intel (promptfoo 18.6K, garak 7.4K landscape)
- [x] Dock-style floating nav with nightfang icon
- [x] Outfit + Space Mono fonts
- [x] E2E tests passing (20/20)

### Viral Features — Priority Order

#### 1. Attack Replay Terminal (BUILT — needs polish)
Animated kill chain in CLI with box-drawing characters.
Each agent gets its own visual lane. `--verbose` shows live, `--replay` replays past scans.
WHY VIRAL: Nobody has done this. People will screen-record it.
STATUS: Built in packages/cli/src/formatters/replay.ts (487 lines)

#### 2. Self-Scan README Badge (BUILT — needs workflow push)  
GitHub Action scans demo target on every push, updates README with live results.
Embeddable badge: `Nightfang Verified: A+`
WHY VIRAL: Meta — "this security scanner attacks itself." Badge = billboard.
STATUS: .github/workflows/self-scan.yml created, needs workflow scope to push

#### 3. "Holy Shit" First Run (BUILT)
`npx nightfang` with no args → interactive menu → scans demo target in 30 seconds.
WHY VIRAL: Zero friction. Instant wow. Every "I just tried this" tweet starts here.
STATUS: Built with @clack/prompts in packages/cli/src/index.ts

#### 4. Shareable HTML Reports (PLANNED — v0.2)
`nightfang.dev/r/abc123` — beautiful dark-themed report with attack graphs.
WHY VIRAL: Every shared report is a Nightfang demo. Bug bounty hunters share these.
STATUS: Planned for post-launch

#### 5. Animated Nightfang Icon (TODO)
The fang icon animated as a GIF — could be the favicon, README badge, loading indicator.
WHY VIRAL: Memorable brand moment. Like GitHub's Octocat but for security.

### HN Launch
- Title: "Show HN: I found 7 CVEs with Claude Opus — now I'm open-sourcing my security framework"
- First comment: personal story, methodology, what's different from promptfoo/garak
- Timing: Tuesday 9:05am ET / 3:05pm CET
- Pre-brief 8-12 peers for honest feedback (NOT vote coordination)
