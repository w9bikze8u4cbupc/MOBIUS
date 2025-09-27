# guarded-rollout(dhash): enterprise guarded production rollout — automation, monitoring, rollback & notifications

## Short description

Implements a complete guarded production rollout system for dhash: pre-merge validation, automated backups (SHA256), deploy & migration dry-runs, 60-minute post-deploy monitoring with configurable quality gates and automatic rollback, zero-dependency multi-channel notifications, CI integration, and operator runbooks.

## One-line merge instruction

**MERGE_NOW** approved with guarded rollout — use rebase-and-merge after all pre-merge gates pass and Deploy operator sign-off.

---

## Concise checklist (paste into PR description)

### 📦 Attach required artifacts:
- [ ] `backups/*.zip` + corresponding `.sha256`
- [ ] `deploy-dryrun.log`, `migrate-dryrun.log`
- [ ] `postdeploy-smoketests.log`, `test_logging.log`
- [ ] `premerge_artifacts/` (CI artifacts bundle)
- [ ] `monitor_logs/` (staging/canary dry-run if available)
- [ ] Links to CI runs (Ubuntu / macOS / Windows) and premerge-validation run

### 🔄 CI: premerge workflow passed (`.github/workflows/premerge.yml`)
- [ ] Branch protection: require CI status contexts and 2 approvers (≥1 Ops/SRE)

### 💾 Backups verified (example):
```bash
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
```

### 👨‍💻 Deploy operator (@ops) reviewed artifacts and provided explicit sign-off

### ⚙️ Confirm monitoring & auto-rollback defaults accepted or tuned:
- [ ] 60-minute monitoring window (poll cadence: 30s for first 5m, then 120s)
- [ ] Quality gates: health, extraction failure rate, p95 hash time, low-confidence queue

---

## Key components added

### Deployment scripts:
- `scripts/deploy_dhash.sh`, `scripts/migrate_dhash.sh`, `scripts/backup_dhash.sh` (all support `--dry-run`)

### Monitoring & quality gates:
- `scripts/monitor_dhash.js`, `quality-gates-config.json`

### Rollback:
- `scripts/rollback_dhash.sh` (verified restore + post-restore validation)

### Notifications:
- `scripts/notify.js`, `scripts/deploy/deploy-notify.js` (Slack/Teams/Discord/Email; retry/backoff; fallback)

### Tests & CI:
- `scripts/smoke_tests.sh`, `scripts/validate_logging.js`, `.github/workflows/premerge.yml`

### Docs & templates:
- `DEPLOYMENT_OPERATIONS_GUIDE.md`, `GUARDED_ROLLOUT_README.md`, `templates/notifications/`, `templates/PR_BODY.md`

---

## Production default quality-gate thresholds (configurable)

- **Health failures**: >2 consecutive non-OK checks
- **Extraction failure rate**: >5% over 10 minutes
- **P95 hash time**: >2000ms over 15 minutes
- **Low-confidence queue length**: >1000 items

*(See `quality-gates-config.json` for per-environment tuning.)*

---

## Quick rollback commands (operators)

### Identify latest backup:
```bash
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
```

### Verify backup integrity:
```bash
sha256sum -c "${LATEST_BACKUP}.sha256"
```

### Restore:
```bash
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

**Post-rollback**: require 3 consecutive OK health checks, re-run smoke tests, attach restore logs to the incident.

---

## Testing & validation (summary)

- [x] **Backup & SHA256 verification**: PASS
- [x] **Deploy & migration dry-runs**: PASS
- [x] **Smoke tests & logging validation**: PASS
- [x] **Monitor detection & auto-rollback simulation**: PASS
- [x] **Cross-platform CI validation (Ubuntu / macOS / Windows)**: PASS

---

## Owners & escalation

- **Release owner / PR author**: owns pre-merge run & artifact attachments
- **Deploy operator**: @ops — executes production deploy & monitors T+60
- **Media engineering**: @media-eng — golden validation & media QA
- **Triage lead / on-call**: Ops/SRE assigned — handles rollback & incident creation

---

## Network / firewall note

If CI runners cannot reach external webhook endpoints, run with `--dry-run` or configure a send-only proxy/NAT with allowlist for webhook destinations. Notification fallback (file-based) is enabled — see `DEPLOYMENT_OPERATIONS_GUIDE.md` troubleshooting section.

---

## 🚀 Ready for deployment

**Post-merge deployment command:**
```bash
./scripts/deploy_dhash.sh --env production --backup-first
node scripts/monitor_dhash.js --env production
```

**Emergency rollback command:**
```bash
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```