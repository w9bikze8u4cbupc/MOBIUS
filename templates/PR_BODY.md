## PR Title Template

guarded-rollout(dhash): [brief description] — automation, monitoring, rollback & notifications

## Short Description

[Provide a concise description of the changes and their impact on the dhash component]

## One-line Merge Instruction

MERGE_NOW approved with guarded rollout — use rebase-and-merge after pre-merge gates pass and Deploy operator sign-off.

## Concise Checklist (3–7 bullets)

- [ ] Pre-merge automation passed (CI + premerge.yml) and artifacts attached
- [ ] Backups present and SHA256-verified
- [ ] Deploy operator (@ops) sign-off obtained
- [ ] Branch protection requires 2 approvers (≥1 Ops/SRE)
- [ ] Monitoring defaults accepted (T+60, auto-rollback thresholds) or tuned

## Full PR Checklist

### Required Artifacts
- [ ] **backups/*.zip** + corresponding **.sha256** files
- [ ] **deploy-dryrun.log**, **migrate-dryrun.log** from pre-merge validation
- [ ] **postdeploy-smoketests.log**, **test_logging.log** from validation
- [ ] **premerge_artifacts/** (CI artifacts bundle from workflow)
- [ ] **monitor_logs/** (staging/canary dry-run if available)
- [ ] Links to CI runs (Ubuntu / macOS / Windows) and premerge-validation run

### Pre-merge Validation
- [ ] **CI**: premerge workflow passed (`.github/workflows/premerge.yml`)
- [ ] **Branch protection enabled**: require CI status contexts and 2 approvers (≥1 Ops/SRE)

### Backup Verification
- [ ] **Backups verified**:
  ```bash
  LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
  sha256sum -c "${LATEST_BACKUP}.sha256"
  ```

### Approvals & Sign-offs
- [ ] **Deploy operator (@ops)** reviewed artifacts and provided explicit sign-off
- [ ] **Monitoring & auto-rollback defaults** accepted or tuned:
  - 60-minute monitoring window; poll cadence: 30s for first 5m, then 120s
  - Default gates: health, extraction failure rate, p95 hash time, low-confidence queue

### Security & Compliance
- [ ] **Confirm notification secrets are stored in CI secrets** (no committed webhooks)
- [ ] **All state-changing scripts support --dry-run** for safe testing

## Production Quality Gate Thresholds

These are the **default conservative thresholds**. Tune after 24–72h of production telemetry if needed:

| Gate | Threshold | Window | Action |
|------|-----------|---------|---------|
| **Health failures** | >2 consecutive non-OK checks | 5 min | → auto-rollback |
| **Extraction failure rate** | >5% | 10 min | → auto-rollback |
| **P95 hash time** | >2000 ms | 15 min | → auto-rollback |
| **Low-confidence queue** | >1000 items | instant | → auto-rollback |

*(See `quality-gates-config.json` for per-environment tuning and rationale.)*

## Quick Rollback Commands (for operators)

```bash
# Find latest backup
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)

# Verify backup
sha256sum -c "${LATEST_BACKUP}.sha256"

# Emergency rollback
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production

# Post-rollback verification: require 3 consecutive OK health checks
./scripts/smoke_tests.sh --env production --post-rollback
```

## Testing & Validation Summary

- [ ] **Backup & SHA256 verification**: PASS (cross-platform tests)
- [ ] **Deploy & migration dry-runs**: PASS (staging and CI simulations)
- [ ] **Monitoring & auto-rollback simulation**: PASS (T+60 simulated triggers)
- [ ] **Notifications**: PASS (multi-channel + file fallback)
- [ ] **Smoke tests & logging validation**: PASS (concurrency, redaction, critical/standard separation)
- [ ] **CI cross-platform validation** (Ubuntu/macOS/Windows): PASS

## Owners & Escalation

- **Release owner / PR author**: owns pre-merge run & artifact attachments
- **Deploy operator**: @ops — executes production deploy & monitors T+60
- **Media engineering**: @media-eng — golden validation & media QA
- **Triage lead / on-call**: Ops/SRE assigned — handles rollback & incident creation

## Usage Examples

### Production deploy with monitoring:
```bash
./scripts/backup_dhash.sh --env production
./scripts/deploy_dhash.sh --env production
# monitoring starts automatically
```

### Dry-run deploy (staging):
```bash
./scripts/deploy_dhash.sh --dry-run --env staging
```

### Emergency rollback:
```bash
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force
```

### Send notification (dry-run supported):
```bash
node scripts/notify.js --type deploy --env production --message "Deployment complete" --dry-run
```

## Network / Firewall Note

If CI runners cannot reach webhook endpoints, use `--dry-run` for CI tests or configure a send-only proxy/NAT allowlist for webhook destinations. The notification system supports file-based fallback for auditability; see `DEPLOYMENT_OPERATIONS_GUIDE.md` troubleshooting section.

## Safety & Operational Notes

- **All state-changing scripts support --dry-run**. Use it for CI and pre-merge validations.
- **Secrets must be stored in GitHub Actions secrets**; do not commit webhooks/keys.
- **Thresholds are conservative defaults**; tune after 24–72h of production telemetry.
- **Cross-platform caveats** (e.g., poppler on Windows) are documented in `DEPLOYMENT_OPERATIONS_GUIDE.md`; include helper installers on runners if needed.

---

**Deploy Operator Sign-off Required**: @ops team member must review artifacts and approve before merge.

**Documentation**: See `GUARDED_ROLLOUT_README.md` and `DEPLOYMENT_OPERATIONS_GUIDE.md` for complete operational procedures.