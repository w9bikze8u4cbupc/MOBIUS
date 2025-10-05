# Add cross-platform MOBIUS verification scripts + GitHub Actions workflow

## Summary

Adds cross-platform verification orchestration (bash, Windows batch + PowerShell, and a Node orchestrator), port-management and consolidation utilities, a GitHub Actions workflow to run verification in CI, and full documentation and checklists.

## Why

Formalizes verification into repeatable cross-platform scripts and CI so the stack can be smoke-tested automatically before merges.

## How to test locally (quick)

### Install dependencies:
- Root: `npm ci`
- Client: `cd client && npm ci`

### Start verification locally:
- Unix: `npm run mobius:verify:unix` or `bash ./mobius-verify.sh`
- Windows: `npm run mobius:verify` or run `mobius-verify.cmd`
- Node orchestrator: `npm run mobius:verify:node` or `node mobius-verify.mjs`

### Check logs:
- Unix: `/tmp/mobius-backend.log` and `/tmp/mobius-frontend.log`
- Windows: `%TEMP%\mobius-backend.log` and `%TEMP%\mobius-frontend.log`

## Caveats

- Replace SMOKE_CMD in scripts if your smoke test script name differs.
- CI workflow expects headless-capable smoke tests (Playwright, curl-based checks, or similar). Update workflow if tests need additional setup.

## Files changed / added:

- `mobius-verify.sh`
- `mobius-verify.cmd`
- `mobius-verify.mjs`
- `scripts/kill-ports.sh`
- `scripts/kill-ports.ps1`
- `scripts/consolidate-mobius-folders.sh`
- `scripts/consolidate-mobius-folders.ps1`
- `scripts/run-full-verification.sh`
- `scripts/run-full-verification.ps1`
- `.github/workflows/mobius-verify.yml`
- `MOBIUS_SCRIPTS_SUMMARY.md`
- `MOBIUS_VERIFICATION_READY.md`
- `MOBIUS_SCRIPTS_PR.md`
- `CHANGELOG.md`
- `PR_CHECKLIST.md`
- `TEAM_ANNOUNCEMENT.md`
- `DEPLOYMENT_PLAYBOOK.md`

## QA checklist (must pass before merging)

- [ ] CI job (.github/workflows/mobius-verify.yml) completes on this branch
- [ ] Local verification runs successfully on Ubuntu/macOS/WSL
- [ ] Local verification runs successfully on Windows (PowerShell/CMD)
- [ ] Health endpoints return expected responses:
  - GET http://localhost:5001/health → status OK
  - GET http://localhost:3000 → page responds (200)
- [ ] Smoke tests pass (the SMOKE_CMD used by scripts)
- [ ] Reviewers sign off on scripts and CI config
- [ ] README / onboarding updated to reference verification scripts

## Post-merge tasks

- [ ] Delete branch after merge
- [ ] Announce in your team channel with the prepared TEAM_ANNOUNCEMENT.md (or tailor it)
- [ ] Update developer onboarding README to reference `npm run mobius:verify` (add example)

## Quick troubleshooting tips

- If scripts timeout waiting for services, inspect logs and ensure backend is binding to correct port (5001) and frontend to 3000.
- If port conflicts persist on CI, adjust workflow to run on fresh runner or add cleanup steps (already present in scripts).
- If Playwright is used, ensure the CI environment installs browsers (Playwright action or apt packages).# Add cross-platform MOBIUS verification scripts + GitHub Actions workflow

## Summary

Adds cross-platform verification orchestration (bash, Windows batch + PowerShell, and a Node orchestrator), port-management and consolidation utilities, a GitHub Actions workflow to run verification in CI, and full documentation and checklists.

## Why

Formalizes verification into repeatable cross-platform scripts and CI so the stack can be smoke-tested automatically before merges.

## How to test locally (quick)

### Install dependencies:
- Root: `npm ci`
- Client: `cd client && npm ci`

### Start verification locally:
- Unix: `npm run mobius:verify:unix` or `bash ./mobius-verify.sh`
- Windows: `npm run mobius:verify` or run `mobius-verify.cmd`
- Node orchestrator: `npm run mobius:verify:node` or `node mobius-verify.mjs`

### Check logs:
- Unix: `/tmp/mobius-backend.log` and `/tmp/mobius-frontend.log`
- Windows: `%TEMP%\mobius-backend.log` and `%TEMP%\mobius-frontend.log`

## Caveats

- Replace SMOKE_CMD in scripts if your smoke test script name differs.
- CI workflow expects headless-capable smoke tests (Playwright, curl-based checks, or similar). Update workflow if tests need additional setup.

## Files changed / added:

- `mobius-verify.sh`
- `mobius-verify.cmd`
- `mobius-verify.mjs`
- `scripts/kill-ports.sh`
- `scripts/kill-ports.ps1`
- `scripts/consolidate-mobius-folders.sh`
- `scripts/consolidate-mobius-folders.ps1`
- `scripts/run-full-verification.sh`
- `scripts/run-full-verification.ps1`
- `.github/workflows/mobius-verify.yml`
- `MOBIUS_SCRIPTS_SUMMARY.md`
- `MOBIUS_VERIFICATION_READY.md`
- `MOBIUS_SCRIPTS_PR.md`
- `CHANGELOG.md`
- `PR_CHECKLIST.md`
- `TEAM_ANNOUNCEMENT.md`
- `DEPLOYMENT_PLAYBOOK.md`

## QA checklist (must pass before merging)

- [ ] CI job (.github/workflows/mobius-verify.yml) completes on this branch
- [ ] Local verification runs successfully on Ubuntu/macOS/WSL
- [ ] Local verification runs successfully on Windows (PowerShell/CMD)
- [ ] Health endpoints return expected responses:
  - GET http://localhost:5001/health → status OK
  - GET http://localhost:3000 → page responds (200)
- [ ] Smoke tests pass (the SMOKE_CMD used by scripts)
- [ ] Reviewers sign off on scripts and CI config
- [ ] README / onboarding updated to reference verification scripts

## Post-merge tasks

- [ ] Delete branch after merge
- [ ] Announce in your team channel with the prepared TEAM_ANNOUNCEMENT.md (or tailor it)
- [ ] Update developer onboarding README to reference `npm run mobius:verify` (add example)

## Quick troubleshooting tips

- If scripts timeout waiting for services, inspect logs and ensure backend is binding to correct port (5001) and frontend to 3000.
- If port conflicts persist on CI, adjust workflow to run on fresh runner or add cleanup steps (already present in scripts).
- If Playwright is used, ensure the CI environment installs browsers (Playwright action or apt packages).