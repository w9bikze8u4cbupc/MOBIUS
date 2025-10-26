# Contributing to Mobius Documentation

Purpose: give every contributor a predictable, zero-surprises workflow for updating docs.

## Prerequisites

- Python 3.11+
- Node.js 18+
- `mkdocs` tooling: `pip install -r requirements-docs.txt`
- GitHub personal access token (if pushing from local)
- **Link checker**: Install `lychee` via your platform package manager:
  - **Windows**: `winget install lycheeverse.lychee` or `choco install lychee`
  - **macOS**: `brew install lychee`
  - **Linux**: `sudo apt install lychee` (Ubuntu/Debian) or download from [releases](https://github.com/lycheeverse/lychee/releases)

## Local Workflow

1. **Sync**: `git checkout main && git pull`
2. **Branch**: `git switch -c docs/<short-topic>`
3. **Install deps** (first run): `pip install -r requirements-docs.txt`
4. **Preview**: `mkdocs serve --strict`
5. **Lint**: `npm run docs:lint` (will configure below)
6. **Commit**: `git commit -m "docs(topic): concise summary"`
7. **Push & PR**: `git push origin docs/<short-topic>`, open PR to `main`

## Style Guide

- Heading levels start at H1 per page; no skipped levels.
- Use imperative verbs for procedural headings (e.g., "Configure Secrets").
- Cross-link related guides using relative paths (`../operations/monitoring.md`).
- Code blocks: triple backticks, language tag.
- Dates in ISO format (`2025-01-15`).

## Review Checklist

- `mkdocs build --strict` passes locally.
- No TODO placeholders left.
- Screenshots stored under `docs/assets/<section>/`.
- Added entry in navigation (or confirmed auto-nav covers it).
- Updated changelog entry (Appendix → changelog.md).

## Escalation

- Build failures: ping #mobius-docs or mention @docs-on-call.
- Secrets or access issues: follow Ops runbook in `docs/operations/access-controls.md`.