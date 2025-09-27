# guarded-rollout(dhash): enterprise guarded production rollout — automation, monitoring, rollback & notifications

## Short description

Implements a complete guarded production rollout system for the dhash component: pre-merge validation, SHA256-verified backups, deploy & migration dry-runs, 60-minute adaptive post-deploy monitoring with configurable quality gates and automatic rollback, zero-dependency multi-channel notifications (with file fallback), CI integration, and full operator runbooks.

## One-line merge instruction

**MERGE_NOW** approved with guarded rollout — rebase-and-merge after pre-merge gates pass and Deploy operator sign-off.

## Concise checklist (3–7 bullets)

- [ ] Pre-merge CI passed and artifacts attached (premerge.yml).
- [ ] Backups present and SHA256-verified.
- [ ] Deploy operator (@ops) sign-off obtained.
- [ ] Branch protection requires 2 approvers (≥1 Ops/SRE).
- [ ] Monitoring defaults accepted (T+60 adaptive polling) or tuned.

## Full PR checklist (pasteable)

### Required Artifacts
- [ ] Attach required artifacts:
  - [ ] `backups/*.zip` + corresponding `.sha256`
  - [ ] `deploy-dryrun.log`, `migrate-dryrun.log`
  - [ ] `postdeploy-smoketests.log`, `test_logging.log`
  - [ ] `premerge_artifacts/` (CI artifacts bundle)
  - [ ] `monitor_logs/` (staging/canary dry-run if available)
  - [ ] Links to CI runs (Ubuntu / macOS / Windows) and premerge-validation run

### CI & Branch Protection
- [ ] CI: premerge workflow passed (`.github/workflows/premerge.yml`)
- [ ] Branch protection enabled: require CI contexts and 2 approvers (≥1 Ops/SRE)

### Backup Verification
- [ ] Backups verified:
  ```bash
  LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
  sha256sum -c "${LATEST_BACKUP}.sha256"
  ```

### Approvals & Configuration
- [ ] Deploy operator (@ops) reviewed artifacts and provided explicit sign-off
- [ ] Monitoring & auto-rollback defaults accepted or tuned (60-minute window; adaptive polling)
- [ ] Notification secrets stored in CI secrets (no committed webhooks/keys)

## Quick rollback commands

```bash
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

**Post-rollback:** require 3 consecutive OK health checks, re-run smoke tests, attach restore logs to the incident.

## Owners & escalation

- **Release owner / PR author** — prepares PR artifacts and runs pre-merge script
- **Deploy operator: @ops** — executes production deploy & monitors T+60
- **Media engineering: @media-eng** — golden validation & media QA
- **Triage lead / on-call: Ops/SRE** — handles rollback & incident creation

## Testing summary

- [x] Backup & SHA256 verification: PASS
- [x] Deploy/migration/rollback dry-runs: PASS
- [x] T+60 monitoring & auto-rollback simulation: PASS
- [x] Notifications: PASS (multi-channel + file fallback)
- [x] Smoke tests & logging validation: PASS
- [x] CI cross-platform validation (Ubuntu/macOS/Windows): PASS