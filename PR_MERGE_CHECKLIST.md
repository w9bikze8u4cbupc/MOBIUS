# PR Merge Checklist — MOBIUS DHash / Media Pipeline

**Purpose:** Ensure every merge into protected branches meets MOBIUS quality, cross-platform, and operational safety gates for the DHash/media pipeline.

## How to use

1. Fill required fields in the PR template. Complete all Pre-merge items before requesting final approvals.
2. Mark checkboxes as items complete; attach CI links / artifact IDs where requested.
3. If a step is not applicable, explain why in the PR.

## Pre-merge — CI, Tests & Build

- [ ] **CI:** All matrix jobs passing (Ubuntu / macOS / Windows) for Node.js 20+ (link: [CI run URL])
  - Node.js LTS targets listed in `.github/workflows/ci.yml` must be green.
- [ ] **JavaScript/Node.js:** `npm test` passes with no errors (no test skips without justification)
- [ ] **Linting:** ESLint/Prettier run and fixes applied (or document style exceptions)
- [ ] **Unit tests:** 100% of unit tests pass (or documented acceptable regressions)
- [ ] **Integration & synthetic e2e tests:** pass (include artifacts/logs)
- [ ] **Deterministic hashing tests:** hashing unit tests and migration compatibility tests pass
- [ ] **Golden-file gates:** golden regression tests for any media changes pass and artifacts attached:
  - Video frame SSIM >= 0.995 using `npm run golden:check`
  - Audio LUFS and True Peak within ±1.0 dB of baseline
  - Commands: `npm run golden:check:sushi && npm run golden:check:loveletter`
- [ ] **FFmpeg pipeline verification test(s):** pass using scripts in `scripts/check_golden.js`
- [ ] **Smoke tests (quick):** pass in CI (attach smoke logs)
- [ ] **Cross-platform smoke:** confirm at least one successful macOS and Windows smoke run if affecting native or extraction code

## Pre-merge — Extraction / Native Dependencies

- [ ] **Extraction strategy validated for change:** lossless-first pdfimages (poppler) → pdftoppm → pdf-to-img fallback verified
- [ ] **Native dependency checks in CI:** poppler (pdftoppm/pdfimages) present in runner images or installed in workflow
- [ ] **Windows paths & packaging documented and verified** if new native binaries added

## Pre-merge — Data & Migration Safety

- [ ] **Backup plan documented** for data-affecting changes (link to runbook)
- [ ] **Migration scripts have dry-run mode;** dry-run executed with artifacts attached (scripts/migrate-dhash.js — dry-run logs)
- [ ] **Dual-hash compatibility verified** (blockhash → dhash migration tests)
- [ ] **Low-confidence queue detection tested;** exported sample attached if migration impacts matching behavior

## Pre-merge — Artifacts, Metadata & Outputs

- [ ] **PNG masters produced and preserved** in test run
- [ ] **Web derivatives (1920px JPEG) and 300px thumbnails generation verified**
- [ ] **images.json / library.json metadata produced** with hash metadata fields and node_module_version
- [ ] **SHA256 checksums of backup artifacts** produced and verified in CI artifacts

## Documentation & Runbooks

- [ ] **README / README_DHASH.md updated** for functional changes
- [ ] **DEPLOYMENT_COMPLETE.md or DEPLOYMENT_CHECKLIST.md updated** if deploy steps changed
- [ ] **MIGRATION_RUNBOOK.md updated** if migration or matching behaviors changed
- [ ] **PR description includes:** summary, risk assessment, rollout plan, rollback link, and monitoring checklist
- [ ] **CHANGELOG entry included** where appropriate

## Security & Config

- [ ] **New secrets / keys:** documented and added to repo secrets; no secrets in code
- [ ] **Config defaults safe** (env toggles for opt-in features like OCR/CLIP)
- [ ] **Any third-party services/embeddings documented** and secret values validated

## Review & Approvals

- [ ] **Assign reviewers:** (required approvals: 2) — reviewers: @[username1], @[username2], @[username3]
- [ ] **At least one reviewer from Ops/SRE assigned** for deployment-impacting PRs
- [ ] **Author addressed all review comments** and re-ran CI where changes were made
- [ ] **Label(s) applied:** e.g., `media/pipeline`, `migration`, `release-blocker`

## Merge Execution (final steps)

- [ ] **Confirm branch is up-to-date** with target branch; rebase (preferred) or merge latest target branch
- [ ] **Confirm no force-pushes** after final approval unless reviewers re-approve
- [ ] **Merge strategy:** rebase-and-merge (or squash merge per repo policy) — confirm chosen strategy in PR
- [ ] **Create timestamped backup** before production deploy: run `scripts/backup_library.sh` (attach checksum & artifact link)
- [ ] **Run deploy dry-run** (`scripts/deploy_dhash.sh --dry-run`) and attach logs
- [ ] **Run migration dry-run** if applicable (`scripts/migrate-dhash.js --dry-run`)

## Post-merge — Deploy & Verify

- [ ] **Execute deploy** (`scripts/deploy_dhash.sh`) during scheduled maintenance window; record start time
- [ ] **Post-deploy smoke-tests:** run `scripts/smoke-tests.js` (quick and full); attach logs
- [ ] **Monitor metrics & health endpoints** for 30–60 minutes:
  - `/health`: OK
  - `/metrics/dhash`: `avg_hash_time`, `p95_hash_time`, `extraction_failures_rate`, `low_confidence_queue_length` — verify within expected thresholds
- [ ] **Confirm backups integrity:** verify SHA256 checks for latest backup
- [ ] **Post-merge migration:** run migrate (non-dry-run) if planned and monitor low-confidence queue export
- [ ] **Close or update related issues/epics;** tag release or note in changelog

## Rollback / Emergency Procedure

- [ ] **Rollback runbook confirmed and accessible** (link)
- [ ] **Confirm rollback script works:** `scripts/rollback_dhash.sh` (test in staging or runbook dry-run)
- [ ] **If an incident:** immediately run rollback script, collect artifacts, notify on-call and open incident ticket with logs and SHA256 backup reference
- [ ] **Post-rollback:** attach rollback artifacts and root-cause next steps

## Metrics & Observability

- [ ] **Alerting thresholds confirmed** for metrics (example thresholds documented)
- [ ] **Dashboards / runbooks referenced** for triage
- [ ] **Ensure logs/artifacts upload** to CI artifact storage for triage

## PR Metadata (mandatory fields)

- [ ] **PR title follows convention:** `(scope): short description`
- [ ] **PR description includes:**
  - Summary of change
  - CI run links & artifact IDs
  - Migration impact (yes/no). If yes, attach dry-run artifacts.
  - Rollout plan and maintenance window
  - Reviewers & approvers requested
- [ ] **Checklist completed** in PR body (link to this checklist)
- [ ] **Labels applied:** (example) `media/pipeline`, `migration`, `release-blocker`, `ci-ready`

---

## Quick Acceptance Criteria (for reviewers: TL;DR)

- [ ] **CI green on all platforms** (Ubuntu/macOS/Windows) ✅
- [ ] **JavaScript build + lint** ✅
- [ ] **Golden-file checks:** SSIM ≥ 0.995 and audio ±1 dB ✅
- [ ] **Backup created & SHA256 verified** prior to deploy ✅
- [ ] **Migration dry-run artifacts attached** if data changes ✅
- [ ] **2 approvals including Ops** for deployment-impacting PRs ✅

---

## Repository-Specific Notes

### NPM Scripts Reference
- Golden file validation: `npm run golden:check`
- Individual game checks: `npm run golden:check:sushi`, `npm run golden:check:loveletter`
- Golden file generation: `npm run golden:update`
- JUnit reporting: `npm run golden:check-with-junit`

### CI Workflow Integration
The checklist aligns with the existing `.github/workflows/ci.yml` which:
- Tests on Ubuntu, macOS, Windows
- Uses Node.js 20
- Installs FFmpeg via FedericoCarboni/setup-ffmpeg@v2
- Generates preview renders and runs audio/container compliance checks
- Uploads artifacts to GitHub Actions

### Golden File Testing Details
Golden files are managed via:
- **Generation:** `scripts/generate_golden.js` 
- **Validation:** `scripts/check_golden.js`
- **Thresholds:** SSIM ≥ 0.995, LUFS/TP ±1.0 dB tolerance
- **Platforms:** Cross-platform support with `--perOs` flag
- **Output:** JUnit XML for CI integration