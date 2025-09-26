# Pull Request — Deployment Readiness Checklist

## Summary
This PR updates the dhash deployment pipeline and operator templates.

**Reference(s):** https://example.issue/123
**Release target:** v1.2.3

## Required approvals & reviewers
- [ ] 2x code reviewers (>=1 Ops/SRE required) — reviewers: @ops, @media-eng
- [ ] Release owner / Deploy operator acknowledged: @ops

## Pre-merge validation (must pass before merging)
- [ ] CI: all platform builds green (Ubuntu / macOS / Windows)
- [ ] premerge-validation workflow passed (attach links)
- [ ] premerge_artifacts uploaded (attach artifact links)

## Artifacts (attach to PR)
- [ ] backups/dhash_v1.2.3.zip + backups/dhash_v1.2.3.zip.sha256
- [ ] deploy-dryrun.log
- [ ] migrate-dryrun.log
- [ ] postdeploy-smoketests.log
- [ ] test_logging.log
- [ ] monitor_logs/ (staging/canary)

## Quality & functional checks
- [ ] FFmpeg validation (renders without error)
- [ ] Audio compliance (EBU R128): LUFS within -23.0 ±1.0 dB
- [ ] Video quality: SSIM >= 0.995 for golden tests
- [ ] Golden tests: all golden artifacts present under tests/golden/
- [ ] Smoke tests passing (local run: `./scripts/smoke-tests.sh`)
- [ ] Migration dry-run validated (`node scripts/migrate-dhash.js --dry-run`)
- [ ] Placeholder validation: RELEASE_TAG, DEPLOY_LEAD, OPS_ replaced or documented

## Security & compliance
- [ ] CodeQL scan: no high/critical findings (attach report link)
- [ ] No new secrets in diffs
- [ ] Dependency scan: no critical vulnerabilities

## Docs & runbook
- [ ] DEPLOYMENT_CHEAT_SHEET.md referenced and up-to-date
- [ ] DEPLOYMENT_OPERATIONS_GUIDE.md reviewed for this change
- [ ] NOTIFICATION_TEMPLATES.md prepared for release communications

## Merge & deploy readiness
- [ ] Branch protection contexts present:
  - CI / build-and-qa
  - premerge-validation
  - premerge-artifacts-upload
- [ ] Final sign-off from Deploy operator: @ops
- [ ] Post-merge rollback plan attached (rollback steps + latest backup link)

## How to run the pre-merge locally
```bash
ARTIFACT_DIR=premerge_artifacts ./scripts/premerge_run.sh
```