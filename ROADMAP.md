# Nightfang Roadmap — Viral Features Sprint

## Launch Day: Tuesday March 31, 3:05pm Zürich (9:05am ET)

### v0.1.1 — Pre-Launch Polish (by Monday)

#### Feature 1: CVE Author Credibility
- Link 7 published CVEs to attack templates
- README section: "Why trust this scanner?"
- CLI output references real CVEs that inspired each template
- Status: TODO

#### Feature 2: Self-Scan README Badge
- GitHub Action that scans demo target on every push
- Updates README with live results between sentinel comments
- Embeddable badge: `Nightfang Verified: A+`
- SVG badge endpoint on nightfang.dev
- Status: TODO

#### Feature 3: "Holy Shit" First Run
- `npx nightfang` with no args → interactive demo
- Scans demo.nightfang.dev (hosted vulnerable target)
- 30 seconds to "wow"
- Status: TODO

#### Feature 4: Dock-style Bottom Nav
- Rapitranslate-style floating dock at bottom
- Active section detection, animated labels
- Status: IN PROGRESS (agent building)

### v0.2.0 — Post-Launch (week after)

#### Feature 5: Attack Replay Terminal
- Animated kill chain in CLI with box-drawing
- Each agent gets its own visual lane
- `--replay` flag to re-watch past scans
- Status: PLANNED

#### Feature 6: Shareable HTML Reports
- `nightfang.dev/r/abc123`
- Dark-themed report with attack graphs
- Encrypted, self-contained HTML
- "Scan your own target" CTA
- Status: PLANNED

## HN Launch
- Title: "Show HN: I have 7 published CVEs — I built an AI security scanner that uses my exploit research to write its own attacks"
- Timing: Tuesday 9:05am ET / 3:05pm CET
- Materials: SHOW_HN.md, TWITTER_THREAD.md, PRODUCT_HUNT.md
