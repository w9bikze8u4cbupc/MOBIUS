# guarded-rollout(dhash): complete guarded production rollout — automation, monitoring, rollback, CI & notifications

## Short Description

This PR adds a full guarded production rollout system for dhash: pre-merge validation, automated backups with SHA256, deploy & migration dry-runs, 60-minute T+60 monitoring with configurable quality gates and auto-rollback, verified rollback scripts, zero-dependency Node notification CLI, CI integrations, and operator runbooks/templates. Merge using rebase-and-merge only after required artifacts, CI checks, and approvals are in place.

## Overview

The dhash service now has enterprise-grade deployment capabilities that reduce risk while improving visibility and recovery time. Key items implemented include automated pre-merge gates, durable backups, a configurable monitoring/quality-gates engine with auto-remediation, a verified rollback path, notification tooling, multi-platform CI validation, and comprehensive runbooks.

## Key Components (Implemented)

### Deployment Automation
- `scripts/deploy_dhash.sh` — main deploy with --dry-run, pre-checks, monitoring hooks
- `scripts/migrate_dhash.sh` — migration runner with dry-run + rollback support
- `scripts/backup_dhash.sh` — timestamped backups with SHA256 verification & retention

### Monitoring & Quality Gates
- `scripts/monitor_dhash.js` — T+60 monitoring loop with configurable gates
- `quality-gates-config.json` — thresholds and environment configs

### Rollback
- `scripts/rollback_dhash.sh` — verified restore flow + post-restore checks
- Auto and manual rollback flows supported

### Notifications (Zero-dependency)
- `scripts/notify.js` & `scripts/deploy/deploy-notify.js` — Slack/Teams/Discord/Email templates + retry/backoff

### Testing & CI
- `scripts/smoke_tests.sh`, `scripts/validate_logging.js`
- `.github/workflows/premerge.yml` — multi-OS pre-merge checks and artifact upload

### Documentation & Templates
- `DEPLOYMENT_OPERATIONS_GUIDE.md`, `GUARDED_ROLLOUT_README.md`, `PR_BODY.md` (this file), `templates/notifications/`, PR checklist templates

## Default Quality-Gate Thresholds (Configurable)

- **Health failures**: >2 consecutive non-OK checks
- **Extraction failure rate**: >5% over 10m (example default)
- **P95 hash time**: >2000ms over 15m
- **Low-confidence queue length**: >1000 items

*(See quality-gates-config.json for environment-specific values and how to tune.)*

## Required Artifacts (Attach to PR Before Merge)

- [ ] `backups/*.zip` + corresponding `.sha256`
- [ ] `deploy-dryrun.log`, `migrate-dryrun.log`
- [ ] `postdeploy-smoketests.log`, `test_logging.log`
- [ ] `premerge_artifacts/` (CI artifacts bundle)
- [ ] `monitor_logs/` (staging/canary dry-run if available)
- [ ] Links to CI runs (Ubuntu / macOS / Windows) and premerge-validation run

## PR Checklist (Copy/Paste)

- [ ] **Attach required artifacts** (see list above)
- [ ] **Premerge CI workflow passed**: `.github/workflows/premerge.yml`
- [ ] **Branch protection enabled**: require CI status contexts and 2 approvers (≥1 Ops/SRE)
- [ ] **Backups verified locally/CI** (SHA256 validated)
  ```bash
  LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
  sha256sum -c "${LATEST_BACKUP}.sha256"
  ```
- [ ] **Deploy operator (@ops) reviewed artifacts and signed off**
- [ ] **Monitoring & auto-rollback defaults accepted or tuned**:
  - 60-minute monitoring window; poll cadence: 30s for first 5m, then 120s
- [ ] **Reviewers**: add @ops, @media-eng, assigned Ops/SRE on-call + one additional approver

## Quick Rollback Commands (For Reviewers & Operators)

**Identify latest backup:**
```bash
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
```

**Verify backup:**
```bash
sha256sum -c "${LATEST_BACKUP}.sha256"
```

**Restore:**
```bash
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

**Post-rollback verification:** require 3 consecutive OK health checks, re-run smoke tests, attach restore logs to incident.

## Testing & Validation Summary

- [x] **Backup creation & SHA256 verification**: PASS (test suite)
- [x] **Dry-run deploys & migration dry-runs**: PASS (logs generated)
- [x] **Smoke tests & logging validation**: PASS (concurrency + redaction checks)
- [x] **Monitor script detection & auto-rollback**: PASS (simulated triggers)
- [x] **Premerge workflow**: YAML validated and simulated across Ubuntu/macOS/Windows

## Owners & Escalation

- **Release owner / PR author**: owns pre-merge run & artifact attachments
- **Deploy operator**: @ops — executes production deploy & monitors T+60
- **Media engineering**: @media-eng — golden validation & media QA
- **Triage lead / on-call**: assigned Ops/SRE — handles rollback & incident creation

## Usage Examples

**Production deploy with monitoring:**
```bash
./scripts/deploy_dhash.sh --env production
```

**Dry-run staging test:**
```bash
./scripts/deploy_dhash.sh --dry-run --env staging
```

**Emergency rollback:**
```bash
./scripts/rollback_dhash.sh --env production --reason "performance-degradation"
```

**Send notification (local):**
```bash
node scripts/notify.js --type deploy --env production --message "Deployment complete"
```

## Safety & Operational Notes

- **Dry-run supported** on all state-changing scripts. Use `--dry-run` in CI when testing templates or workflows.
- **Secrets & webhooks** must stay in GitHub Actions secrets — do not commit any secrets.
- **Cross-platform caveats** (e.g., poppler on Windows) are documented in `DEPLOYMENT_OPERATIONS_GUIDE.md`; add helper installers if run on Windows runners.
- **Thresholds are conservative defaults** — tune after 24–72h of production telemetry.

## Monitoring Architecture (Summary)

**Deploy → Monitor (T+60) → Quality Gates → Auto-Rollback (if violated)**

**Observability**: health checks, error rate, latency (p95), low-confidence queue metrics; notifications on state changes and rollbacks.

## Migration Support

All migrations support dry-run and include rollback instructions. Provided sample schema and indexing for performance; adjust for real DB topology.

## CI Integration

Existing workflows continue; pre-merge adds deployment-specific validations and artifact uploads. Notification workflow templates included for start/success/failure phases and PR comments.

## Network Connectivity Note ⚠️

A runtime test reported: *"Firewall rules blocked me from connecting to one or more addresses."* **Recommended immediate actions:**

1. **Confirm CI runners and network allow outbound webhook calls** (Slack/Teams/Discord) from the runner subnet or use a send-only proxy.
2. **In CI test runs**, use `--dry-run` or replace real webhooks with placeholder URLs stored in secrets and a dry-run flag that prevents outbound connections.
3. **If blocked addresses were required** for staging/canary integrations, update firewall rules or use a NAT/proxy with explicit allowlist.
4. **Add a short troubleshooting section** in `DEPLOYMENT_OPERATIONS_GUIDE.md` describing how to diagnose webhook/network failures and fallback (email/file) notification paths.

---

**Ready for merge after all checklist items are completed and required approvals are obtained.**