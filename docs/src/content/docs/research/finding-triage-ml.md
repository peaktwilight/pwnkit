---
title: Finding Triage ML
description: Research synthesis — ML-based finding triage to maximize accuracy of vulnerability classification.
---

## Problem

pwnkit's agent produces findings (potential vulnerabilities). Some are real, some are false positives. Currently a "blind verify agent" (full LLM call) re-tests each finding independently. This works but is a single-shot binary judgment. We want to maximize accuracy — catch every real vulnerability while eliminating false positives.

## Research Landscape (April 2026)

### What production systems do

Every production security triage system that discloses its architecture uses **LLM pipelines with structured decomposition**, not fine-tuned small models:

| System | Architecture | FP Reduction | Open-Source |
|--------|-------------|-------------|-------------|
| GitHub Security Lab taskflow-agent | GPT-4.1, 7+ YAML subtasks per alert | ~30 real vulns found | Yes |
| Semgrep Multimodal | LLM (OpenAI + Bedrock), per-finding context | 95%+ accuracy on FP classification | No |
| Endor Labs AI SAST | Rules + dataflow + LLM reasoning | 95% FP elimination | No |
| Snyk DeepCode AI | Symbolic AI + multiple fine-tuned models | 84% MTTR reduction | No |
| GitHub Copilot Autofix | GPT-5.1, SARIF + code context | Fix generation, not triage | No |

**Key insight from GitHub Security Lab:** The differentiator is **prompt specificity** — their prompts encode 200+ lines of domain-specific edge cases per vulnerability class. Generic "is this a real vulnerability?" prompts don't work well.

### What VulnBERT teaches us (hybrid approach)

VulnBERT (Guanni Qu, Pebblebed Ventures) predicts vulnerability-introducing commits in the Linux kernel.

**Architecture:** CodeBERT embeddings + 51 handcrafted features, fused via cross-attention.

**Ablation results:**
- Random Forest on handcrafted features alone: **76.8% recall / 15.9% FPR**
- CodeBERT embeddings alone: **84.3% recall / 4.2% FPR**
- Hybrid (features + CodeBERT): **92.2% recall / 1.2% FPR**

**The critical insight:** "Neither neural networks nor hand-crafted rules alone achieve the best results. The combination does." — Guanni Qu

### Open models with public weights

| Model | Size | HuggingFace | Best for |
|-------|------|-------------|----------|
| CodeBERT | 125M | `microsoft/codebert-base` | Code understanding backbone |
| VulBERTa | 125M | `claudios/VulBERTa-MLP-Devign` | Vulnerability classification |
| LineVul | 125M | `MickyMike/LineVul` | Line-level vuln localization |
| VulnBERT v8 | 493M | `pebblebed/vulnbert-v8` | Kernel commits (weights only, no model code) |

### Key datasets

- **D2A (IBM)** — static analyzer findings labeled as true/false positive via differential analysis. Closest to our use case. [github.com/IBM/D2A](https://github.com/IBM/D2A)
- **BigVul** — 188K labeled C/C++ functions from CVEs
- **pwnkit's own data** — XBOW benchmark runs with flag extraction as ground truth

## Our Approach: Hybrid Triage Model

Inspired by VulnBERT's hybrid architecture and GitHub Security Lab's structured triage pipelines.

### Layer 1: Feature Extraction (45 handcrafted features)

Pure regex/string operations on finding data. No LLM, no network calls. Produces a 45-element numeric vector per finding.

**Response features (13):**
- HTTP status code (numeric)
- Response contains SQL error patterns (boolean)
- Response contains stack trace (boolean)
- Response contains error message (boolean)
- Payload reflected in response — exact match (boolean)
- Payload reflected in response — partial match (boolean)
- Response contains sensitive data patterns (boolean)
- Response contains FLAG pattern (boolean)
- Response content-type matches expected (boolean)
- Response length (numeric)
- Response contains WAF/block signature (boolean)
- Response contains redirect (boolean)
- Response status is server error 5xx (boolean)

**Request features (10):**
- Request contains SQL syntax (boolean)
- Request contains XSS payloads (boolean)
- Request contains SSTI syntax (boolean)
- Request contains path traversal (boolean)
- Request contains command injection (boolean)
- Request uses encoding (URL, base64, etc.) (boolean)
- HTTP method (categorical: GET=0, POST=1, PUT=2, etc.)
- Request has authorization header (boolean)
- Number of parameters (numeric)
- Request body length (numeric)

**Metadata features (8):**
- Severity ordinal (0-4: info, low, medium, high, critical)
- Agent confidence score (0.0-1.0)
- Category is high-confidence type (boolean: sqli, ssti = high; logic, race = low)
- Category is injection-class (boolean)
- Category is access-control-class (boolean)
- Finding has template ID (boolean)
- Finding has CWE reference (boolean)
- Finding has CVE reference (boolean)

**Text quality features (10):**
- Description length (numeric)
- Description contains reproduction steps (boolean)
- Description contains impact statement (boolean)
- Description contains hedging language — "possible", "might", "could be" (boolean)
- Description contains verification language — "confirmed", "verified", "reproduced" (boolean)
- Analysis text length (numeric)
- Analysis contains code blocks (boolean)
- Evidence request is non-empty (boolean)
- Evidence response is non-empty (boolean)
- Evidence analysis is non-empty (boolean)

**Cross-field features (4):**
- Payload type matches category (boolean: e.g., SQL syntax + sqli category = consistent)
- Severity-confidence interaction (severity_ordinal * confidence)
- Response/request length ratio (numeric)
- Evidence completeness score (count of non-empty evidence fields / 3)

### Layer 2: Neural Classification (CodeBERT)

Fine-tune `microsoft/codebert-base` (125M params) on finding text:
- Input: concatenation of [title] [category] [description] [request] [response]
- Output: binary classification (true_positive / false_positive)
- Training: MLX on Apple Silicon (M4), QLoRA for efficient fine-tuning

### Layer 3: Cross-Attention Fusion (VulnBERT-style)

Fuse the 45-feature vector with CodeBERT embeddings via cross-attention:
- Feature vector → linear projection → attention with CodeBERT [CLS] token
- Final classification head on fused representation
- This is what gets VulnBERT from 76.8% (features alone) to 92.2% (hybrid)

### Layer 4: Structured LLM Verification (GitHub Security Lab-style)

For findings that the hybrid model classifies as "likely true positive" (high confidence), run a structured multi-step LLM verification:
1. **Reachability analysis** — can the vulnerability actually be triggered from user input?
2. **Payload validation** — does the PoC actually demonstrate the claimed vulnerability?
3. **Impact assessment** — what's the real-world impact? Information disclosure vs RCE?
4. **Exploit confirmation** — independently reproduce the exploit (current blind verify)

Each step uses domain-specific prompts with 100+ lines of edge cases per vulnerability class.

### Training Data Pipeline

1. **XBOW benchmark runs** — flag extraction provides ground truth (flag found = finding is real)
2. **Blind verify agent labels** — distill the verify agent's judgments across thousands of findings
3. **D2A dataset (IBM)** — static analysis finding labels for pre-training
4. **Accumulation** — every CI benchmark run with `--save-findings` adds to the training set

### Target Performance

| Metric | Features only (est.) | Hybrid (target) | With LLM verify |
|--------|---------------------|-----------------|-----------------|
| Recall | ~77% | ~92% | ~98% |
| FPR | ~16% | ~2% | ~0.5% |
| Latency | <1ms | ~50ms | ~10s |
| Cost | $0 | $0 | ~$0.05/finding |

## Related Work

- [VulnBERT blog post](https://pebblebed.com/blog/kernel-bugs) — Guanni Qu's analysis of 20 years of Linux kernel bugs
- [VulnBERT dataset](https://huggingface.co/datasets/quguanni/kernel-vuln-dataset) — 125K kernel bug-fix pairs
- [GitHub Security Lab taskflow-agent](https://github.com/GitHubSecurityLab/seclab-taskflow-agent) — open-source LLM triage pipeline
- [GitHub Security Lab taskflows](https://github.com/GitHubSecurityLab/seclab-taskflows) — YAML-defined triage workflows
- [IBM D2A dataset](https://github.com/IBM/D2A) — static analysis finding labels
- [Awesome-LLMs-for-Vulnerability-Detection](https://github.com/huhusmang/Awesome-LLMs-for-Vulnerability-Detection) — paper tracker
- [VulBERTa](https://github.com/ICL-ml4csec/VulBERTa) — RoBERTa for vulnerability classification

## Collaboration

Met Guanni Qu (Pebblebed Ventures) in Zurich, April 2026. Her VulnBERT pipeline (data collection, feature engineering, hybrid model training) maps directly to pwnkit's finding triage problem. Potential joint work on adapting the approach from kernel commits to web pentesting findings.
