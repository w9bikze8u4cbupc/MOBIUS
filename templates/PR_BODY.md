# DHhash Guarded Production Rollout - PR Template

**PR Title:** guarded-rollout(dhash): [brief description] — [merge instruction]

**One-line merge instruction:**
MERGE_NOW approved with guarded rollout — rebase-and-merge after pre-merge gates pass and Deploy operator sign-off.

## Short Description
[Provide a concise description of the changes and their purpose]

## Concise Checklist (3–7 bullets)
- [ ] Pre-merge CI passed and artifacts attached (premerge.yml)
- [ ] Backups present and SHA256-verified
- [ ] Deploy operator (@ops) sign-off obtained
- [ ] Branch protection requires 2 approvers (≥1 Ops/SRE)
- [ ] Monitoring defaults accepted (T+60, adaptive polling, auto-rollback thresholds) or tuned

## Key Components Added/Modified

### Deployment Automation
- `scripts/deploy_dhash.sh` — orchestrator with env validation, health checks, backup integration, --dry-run
- `scripts/migrate_dhash.sh` — migration runner with forward/rollback support and dry-run
- `scripts/backup_dhash.sh` — timestamped backups + SHA256 generation/verification + retention
- `scripts/rollback_dhash.sh` — verified rollback flow with pre-rollback snapshot and post-restore validation
- `quick-deploy.sh` — convenience wrapper for production runs

### Monitoring & Quality Gates
- `scripts/monitor_dhash.js` — T+60 monitoring loop with adaptive polling (30s initial → 120s regular)
- `quality-gates-config.json` — per-environment thresholds and tuning guidance

**Production default thresholds (configurable):**
- Health failures: >2 consecutive non-OK checks → auto-rollback
- Extraction failure rate: >5% over 10 minutes → auto-rollback
- P95 hash time: >2000 ms over 15 minutes → auto-rollback
- Low-confidence queue: >1000 items → auto-rollback

### Notifications & Auditability
- `scripts/notify.js` & `scripts/deploy/deploy-notify.js` — zero-dependency Node CLI for Slack, Teams, Discord, Email; exponential backoff + jitter and file-based fallback
- `templates/notifications/` — template-driven lifecycle messages
- Full audit trail: timestamped notification delivery logs

### Testing & CI
- `scripts/smoke_tests.sh` — multi-tier post-deploy smoke tests (critical/standard separation)
- `scripts/validate_logging.js` — logging validation including redaction & concurrency tests
- `.github/workflows/premerge.yml` — cross-platform pre-merge validation (Ubuntu/macOS/Windows), artifact upload, PR comment integration

### Documentation & Runbooks
- `DEPLOYMENT_OPERATIONS_GUIDE.md` — operator runbook & troubleshooting
- `GUARDED_ROLLOUT_README.md` — quick-start and architecture overview
- `templates/PR_BODY.md` — standardized PR template for future rollouts

## Required PR Artifacts (attach before merge)

### Backup Artifacts
- [ ] `backups/*.zip` + corresponding `.sha256` files
- [ ] Backup integrity verification: `sha256sum -c backups/dhash_*.zip.sha256`

### Dry-run Logs
- [ ] `deploy-dryrun.log` - Deployment dry-run output
- [ ] `migrate-dryrun.log` - Migration dry-run output  
- [ ] `postdeploy-smoketests.log` - Smoke tests results
- [ ] `test_logging.log` - Logging validation results

### CI Artifacts
- [ ] `premerge_artifacts/` (CI artifacts bundle from premerge.yml)
- [ ] `monitor_logs/` (staging/canary dry-run if available)

### CI Validation Links
- [ ] Ubuntu pre-merge validation: [Link to run]
- [ ] macOS pre-merge validation: [Link to run]
- [ ] Windows pre-merge validation: [Link to run]
- [ ] Integration test run: [Link to run]

## PR Checklist (pasteable)

```bash
# Verify backup integrity
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
```

- [ ] Attach required artifacts (see list above)
- [ ] CI: premerge workflow passed (`.github/workflows/premerge.yml`) for all OSes
- [ ] Branch protection enabled: require CI contexts + 2 approvers (≥1 Ops/SRE)
- [ ] Backups verified with command above
- [ ] Deploy operator (@ops) reviewed artifacts and provided explicit sign-off
- [ ] Monitoring & auto-rollback defaults accepted or tuned (60-minute window; adaptive polling)
- [ ] Notification secrets stored in CI secrets (no committed webhooks/keys)

## Quick Rollback Commands (operators)

### Find latest backup:
```bash
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
```

### Verify backup integrity:
```bash
sha256sum -c "${LATEST_BACKUP}.sha256"
```

### Execute rollback:
```bash
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

### Post-rollback verification:
Require 3 consecutive OK health checks, re-run smoke tests, attach restore logs to incident.

## Testing & Validation Summary

### Automated Testing
- [x] Backup & SHA256 verification: PASS (cross-platform tests)
- [x] Deploy/migration/rollback dry-runs: PASS (staging & CI simulations)
- [x] T+60 monitoring & auto-rollback simulation: PASS
- [x] Notifications: PASS (multi-channel + file fallback)
- [x] Smoke tests & logging validation: PASS (concurrency and redaction checks)
- [x] CI cross-platform validation (Ubuntu/macOS/Windows): PASS

### Manual Validation Required
- [ ] Staging environment deployment test
- [ ] Production backup verification
- [ ] Webhook endpoint connectivity test
- [ ] Operator runbook walkthrough

## Owners & Escalation

- **Release owner / PR author** — owns pre-merge run & artifact attachments
- **Deploy operator: @ops** — executes production deploy & monitors T+60
- **Media engineering: @media-eng** — golden validation & media QA  
- **Triage lead / on-call: assigned Ops/SRE** — handles rollback & incident creation

## Network / Firewall Considerations

If CI runners or staging cannot reach webhook endpoints:

- Use `--dry-run` for CI tests
- Configure a send-only proxy/NAT allowlist for webhook destinations
- File-fallback notifications are enabled to provide an audit trail until connectivity is restored
- Document firewall/proxy troubleshooting steps in `DEPLOYMENT_OPERATIONS_GUIDE.md`

## Safety Notes

- All state-changing scripts have `--dry-run` — use for CI and pre-merge validations
- Secrets must be stored in GitHub Actions secrets — never commit webhooks/keys
- Default thresholds are conservative; tune after 24–72h of production telemetry
- Cross-platform caveats (e.g., poppler on Windows) are documented in the runbook; include helper installers in runner images if needed

## Deployment Commands Quick Reference

### Deployment
```bash
# Production deployment with full monitoring
./quick-deploy.sh --env production

# Staging deployment  
./scripts/deploy_dhash.sh --env staging

# Validate deployment without executing
./scripts/deploy_dhash.sh --env production --dry-run
```

### Monitoring
```bash
# Monitor deployment progress
tail -f deploy_logs/monitor.log

# Check system health
curl -s ${DHASH_PRODUCTION_URL}/health | jq .

# Run critical smoke tests
./scripts/smoke_tests.sh --env production --level critical
```

### Emergency Operations
```bash
# Find and verify latest backup
LATEST_BACKUP=$(ls -t backups/dhash_*.zip | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"

# Emergency rollback
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production

# Stop monitoring if needed
kill $(cat deploy_logs/monitor.pid)
```

---

**Ready for Review:** @ops @media-eng 

**Post-merge:** This PR enables guarded production rollouts with comprehensive monitoring, auto-rollback, and multi-channel notifications. Follow the deployment operations guide for production use.