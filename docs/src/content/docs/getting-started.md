---
title: Getting Started
description: Install pwnkit, set up your API key, and run your first scan.
---

pwnkit is a general-purpose autonomous pentesting framework. It scans LLM endpoints, web applications, npm packages, and source code using an agentic pipeline that discovers, attacks, verifies, and reports -- with blind verification to kill false positives. It ships as an npm package. You can run it directly with `npx` or install it globally.

## Installation

```bash
# Run directly (no install)
npx pwnkit-cli scan --target https://your-app.com/api/chat

# Or install globally
npm i -g pwnkit-cli
```

**Requirements:** Node.js 20+ and pnpm 8+ (for development).

## Set up an API key

pwnkit needs an LLM provider to power its agentic pipeline. Set one of these environment variables:

```bash
# Recommended — one key, many models
export OPENROUTER_API_KEY="sk-or-..."

# Or use a direct provider
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
```

pwnkit checks for keys in this order: **OpenRouter > Anthropic > Azure OpenAI > OpenAI**. If none are set, the `api` runtime will not work, but you can still use `--runtime claude`, `--runtime codex`, or `--runtime gemini` if those CLIs are installed and authenticated.

See [API Keys](/api-keys/) for full details on supported providers.

## Your first scan

### Scan an LLM endpoint

```bash
npx pwnkit-cli scan --target https://your-app.com/api/chat
```

This discovers the attack surface, launches targeted attacks (prompt injection, jailbreaks, data exfiltration), verifies every finding, and generates a report -- typically in under 5 minutes.

### Scan a web application

```bash
npx pwnkit-cli scan --target https://your-app.com --mode web
```

Runs autonomous pentesting against a web application -- probing for CORS misconfigurations, exposed files, SSRF, XSS, and other traditional web vulnerabilities.

### Audit an npm package

```bash
npx pwnkit-cli audit lodash
```

Installs the package in a sandbox, runs static analysis (semgrep), and performs an AI-powered code review.

### Review a codebase

```bash
# Local directory
npx pwnkit-cli review ./my-app

# GitHub URL (clones automatically)
npx pwnkit-cli review https://github.com/user/repo
```

### Auto-detect

You can skip the subcommand entirely. pwnkit figures out what to do:

```bash
pwnkit-cli express              # audits npm package
pwnkit-cli ./my-repo            # reviews source code
pwnkit-cli https://github.com/user/repo  # clones and reviews
pwnkit-cli https://example.com/api/chat  # scans LLM endpoint
pwnkit-cli https://example.com --mode web  # pentests web app
```

## Scan depth

Control how thorough the scan is:

| Depth     | Test Cases | Time     |
|-----------|-----------|----------|
| `quick`   | ~15       | ~1 min   |
| `default` | ~50       | ~3 min   |
| `deep`    | ~150      | ~10 min  |

```bash
# Quick scan for CI
npx pwnkit-cli scan --target https://api.example.com/chat --depth quick

# Deep audit before launch
npx pwnkit-cli scan --target https://api.example.com/chat --depth deep
```

## Next steps

- [Commands](/commands/) — full reference for every CLI command
- [Configuration](/configuration/) — runtime modes, depth settings, and options
- [Architecture](/architecture/) — how the 4-stage pipeline works
