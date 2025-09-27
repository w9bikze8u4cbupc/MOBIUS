# guarded-rollout(dhash): deployment automation, monitoring, rollback, CI & notification system

## Short Description (pasteable)

This PR introduces the guarded production rollout for dhash: pre-merge automation, backup & migration dry-runs, deploy scripts with --dry-run support, 60-minute T+60 monitoring with auto-rollback triggers, verified rollback scripts, zero-dependency Node notification CLI + CI wrappers, and operator runbooks/templates.

Merging this PR enables a guarded, rebase-and-merge rollout once pre-merge gates pass and required approvals are obtained. See the PR checklist below — do not merge until all items are complete.

## One-line Merge Instruction

**MERGE_NOW approved with guarded rollout** — use rebase-and-merge after pre-merge gates pass and Deploy operator sign-off.

## PR Checklist (copy into PR description)

### Required Artifacts
- [ ] **backups/*.zip + corresponding .sha256** files attached
- [ ] **deploy-dryrun.log, migrate-dryrun.log** attached
- [ ] **postdeploy-smoketests.log, test_logging.log** attached  
- [ ] **premerge_artifacts/** (CI artifacts bundle) attached
- [ ] **monitor_logs/** (from staging/canary dry-run if available) attached
- [ ] **Links to CI runs** (Ubuntu / macOS / Windows) and premerge-validation run

### CI & Validation
- [ ] **CI: premerge GitHub Actions workflow passed** (status: `.github/workflows/premerge.yml`)
- [ ] **Branch protection enabled**: require CI status contexts and 2 approvers (≥1 Ops/SRE)
- [ ] **Backups verified**: latest backup exists and SHA256 validated
  ```bash
  LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
  sha256sum -c "${LATEST_BACKUP}.sha256"
  ```

### Approval & Sign-off
- [ ] **Deploy operator (@ops) has reviewed artifacts** and given explicit sign-off for guarded rollout
- [ ] **Confirm monitoring & auto-rollback settings** are acceptable (defaults applied):
  - 60-minute monitoring window (poll cadence: 30s for first 5m, then 120s)
  - Auto-rollback triggers: health non-OK (>2 checks), extraction_failures_rate, p95_hash_time, low_confidence_queue_length (see quality-gates-config.json)
- [ ] **Update PR reviewers**: add @ops, @media-eng, on-call Ops/SRE + at least one additional approver

## Testing & Validation Summary (short)

- **Backup creation & SHA256 verification**: PASS (test runs)
- **Dry-run deploys & migration dry-runs**: PASS (logs attached)
- **Smoke tests & logging validation**: PASS
- **Monitor script threshold detection**: PASS (simulated triggers)
- **Premerge workflow validation**: YAML validated; CI simulations produced artifacts

## Rollback Quick Commands (include in PR for reviewers)

### Identify latest backup:
```bash
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
```

### Verify backup:
```bash
sha256sum -c "${LATEST_BACKUP}.sha256"
```

### Restore:
```bash
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

### Post-rollback verification:
Require 3 consecutive OK health checks, then re-run smoke tests and attach restore logs to incident.

## Owners & Escalation

- **Release owner / PR author**: owns pre-merge run & artifact attachments
- **Deploy operator**: @ops (executes production deploy + monitors T+60)
- **Media engineering**: @media-eng (golden test validation & media QA)
- **Triage lead / on-call**: Ops/SRE assigned (handles rollback / incident creation)

## Notes / Small Print

- **Merge strategy**: rebase-and-merge for linear history.
- **CI secrets** (webhooks) must remain in GitHub Actions secrets — do not commit keys.
- If **platform dependencies** (e.g., poppler on Windows) are required, ensure helper installer steps are documented in DEPLOYMENT_OPERATIONS_GUIDE.md before merge.

---

## Implementation Details

This PR implements a complete guarded rollout system for dhash deployments with the following components:

### 🚀 Deployment Automation
- **`scripts/deploy_dhash.sh`**: Main deployment script with --dry-run support
- **`scripts/migrate_dhash.sh`**: Database migration with rollback capability
- **`scripts/backup_dhash.sh`**: Automated backup creation with SHA256 verification

### 📊 Monitoring & Quality Gates
- **`scripts/monitor_dhash.js`**: 60-minute monitoring with auto-rollback triggers
- **`quality-gates-config.json`**: Configurable thresholds and environments
- **Real-time metrics collection**: health checks, error rates, performance metrics

### ⏪ Rollback System
- **`scripts/rollback_dhash.sh`**: Verified rollback with integrity checks
- **Automatic rollback**: Triggered by quality gate violations
- **Manual rollback**: Support for emergency intervention

### 🔔 Notification System
- **`scripts/notify.js`**: Zero-dependency notification CLI
- **Multi-platform support**: Slack, Discord, Teams, email
- **Event-driven alerts**: Deploy, rollback, monitoring status

### 🧪 Testing & Validation
- **`scripts/smoke_tests.sh`**: Post-deployment smoke tests
- **`scripts/validate_logging.js`**: Logging system validation
- **`.github/workflows/premerge.yml`**: Comprehensive pre-merge validation

### 📚 Documentation & Operations
- **`DEPLOYMENT_OPERATIONS_GUIDE.md`**: Complete operator runbook
- **Cross-platform compatibility**: Linux, macOS, Windows support
- **Emergency procedures**: Incident response and escalation

### Key Features

✅ **Guarded rollouts** with automatic quality gate monitoring  
✅ **Zero-downtime deployments** with verified backups  
✅ **Multi-environment support** (production, staging, canary)  
✅ **Cross-platform CI/CD** (Ubuntu, macOS, Windows)  
✅ **Real-time notifications** across multiple channels  
✅ **Comprehensive logging** and audit trails  
✅ **Emergency rollback** procedures with verification  

### Quality Gates Configuration

The system monitors these key metrics:
- **Health checks**: Auto-rollback after >2 consecutive failures
- **Extraction failure rate**: Auto-rollback if >5% over 10min window
- **P95 hash time**: Auto-rollback if >2000ms over 15min window  
- **Queue length**: Auto-rollback if low confidence queue >1000 items

### Usage Examples

```bash
# Deploy to production with monitoring
./scripts/deploy_dhash.sh --env production

# Manual rollback if needed
./scripts/rollback_dhash.sh --env production --reason "performance-issue"

# Run smoke tests
./scripts/smoke_tests.sh --env production

# Send notification
node scripts/notify.js --type deploy --env production --message "Deployment complete"
```

This implementation provides a production-ready, enterprise-grade deployment system with comprehensive monitoring, automated rollback capabilities, and extensive operational tooling.