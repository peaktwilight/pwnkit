# pwnkit GitHub Action

Run pwnkit in CI from the repo root action, generate JSON + SARIF artifacts, update a single PR comment on reruns, and fail builds on a configurable finding threshold.

## Usage

```yaml
name: AI Security Scan
on: [push, pull_request]

permissions:
 contents: read
 issues: write
 security-events: write

jobs:
 pwnkit:
  runs-on: ubuntu-latest
  steps:
   - uses: actions/checkout@v4

   - name: Run pwnkit
    uses: peaktwilight/pwnkit@main
    with:
     mode: review
     path: .
     depth: default
     runtime: api
     format: sarif
     severity-threshold: high
     threshold: 0
```

## Endpoint Scan Example

Use `mode: scan` for URLs and choose a scanner sub-mode with `scan-mode`.

```yaml
jobs:
 pwnkit-scan:
  runs-on: ubuntu-latest
  steps:
   - uses: actions/checkout@v4

   - name: Run pwnkit scan
    uses: peaktwilight/pwnkit@main
    with:
     mode: scan
     target: ${{ secrets.STAGING_API_URL }}
     scan-mode: probe
     runtime: api
     format: sarif
     threshold: 0
```

## Inputs

- `mode` (optional, default `review`): `review`, `audit`, or `scan`.
- `path` (optional, default `.`): local path to review when `mode=review`.
- `package` (optional): npm package spec to audit when `mode=audit`.
- `target` (optional): target URL or `mcp://` endpoint when `mode=scan`.
- `scan-mode` (optional, default `probe`): `probe`, `deep`, `mcp`, or `web` when `mode=scan`.
- `depth` (optional, default `default`): `quick`, `default`, or `deep`.
- `runtime` (optional, default `api`): `api`, `claude`, `codex`, `gemini`, `opencode`, or `auto`.
- `timeout` (optional, default `300000`): Request/runtime timeout in milliseconds.
- `format` (optional, default `json`): `json` or `sarif`.
- `severity-threshold` (optional, default `high`): `critical`, `high`, `medium`, `low`, `info`, or `none`.
- `threshold` (optional, default `0`): allowed number of findings at or above `severity-threshold` before failing.
- `report-dir` (optional, default `pwnkit-report`): Output directory for reports.
- `comment-pr` (optional, default `true`): update a single PR comment with the current findings summary.
- `pwnkit-version` (optional, default `latest`): npm version of pwnkit-cli to install.

## Outputs

- `report-file`: Primary report file path.
- `json-report-file`: Absolute path to generated JSON report.
- `sarif-report-file`: Absolute path to generated SARIF report.
- `total-findings`: Number of findings in the report.
