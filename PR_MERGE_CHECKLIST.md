# MOBIUS dhash Production Merge Checklist

Use this checklist for the production-ready dhash deployment PR merge process.

## Pre-Merge Requirements

### Code Quality
- [ ] Branch rebased on main: `git fetch && git rebase origin/main`
- [ ] CI: All matrix jobs passing (Ubuntu/macOS/Windows) + ESLint job (warnings OK)
- [ ] No merge conflicts
- [ ] Code review completed by 2 approvers including Ops/SRE

### Backup & Verification
- [ ] Backup created & verified:
  ```bash
  ./scripts/backup_library.sh --out backups/dhash_YYYYMMDDTHHMMSSZ.zip
  sha256sum backups/dhash_...zip > backups/dhash_...zip.sha256
  sha256sum -c backups/dhash_...zip.sha256 → OK
  ```
- [ ] Backup SHA256 file attached to PR
- [ ] Backup file size reasonable (< 100MB recommended)

### Dry-Run Testing
- [ ] Dry-run artifacts attached:
  ```bash
  ./scripts/deploy_dhash.sh --dry-run --env staging > deploy-dryrun.log
  node scripts/migrate-dhash.js --dry-run > migrate-dryrun.log
  ```
- [ ] Deploy dry-run log attached to PR
- [ ] Migration dry-run log attached to PR
- [ ] No errors in dry-run logs

### Smoke Testing
- [ ] Smoke tests passing (attach logs):
  ```bash
  node scripts/test_logging.js
  node scripts/smoke-tests.js --quick
  ```
- [ ] Logging test results attached
- [ ] Quick smoke test results attached
- [ ] All critical endpoints responding (health, metrics)

### Review & Approval
- [ ] **Reviewers**: 2 approvals including Ops/SRE (assigned: media-eng, ops)
- [ ] PR description contains:
  - [ ] Summary of changes
  - [ ] Risk assessment
  - [ ] Rollback plan
  - [ ] Links to all required artifacts
- [ ] Security review completed (if applicable)
- [ ] Performance impact assessed

## Merge Process
- [ ] **Merge method**: rebase-and-merge
- [ ] Delete feature branch after merge
- [ ] Confirm CI passes on main branch after merge

## Post-Merge Deployment

### Deployment Execution
- [ ] Deploy to production:
  ```bash
  ./scripts/deploy_dhash.sh --env production
  mv deploy.log deploy_production_$(date -u +%Y%m%dT%H%M%SZ).log
  ```
- [ ] Production deploy log saved with timestamp

### Post-Deploy Verification
- [ ] Post-deploy smoke & logging tests:
  ```bash
  node scripts/smoke-tests.js --quick > postdeploy-smoketests.log 2>&1
  node scripts/test_logging.js >> postdeploy-smoketests.log 2>&1
  ```
- [ ] Health endpoint returns OK: `curl http://localhost:5001/health`
- [ ] Metrics endpoint accessible: `curl http://localhost:5001/metrics/dhash`
- [ ] Logging system functional (check log files in `logs/` directory)
- [ ] Post-deploy test logs saved

### Monitoring Window (60 minutes)
Monitor the following metrics and collect snapshots at +5, +15, +30, +60 minutes:

- [ ] **T+5 minutes**: System health check and metrics snapshot
  - [ ] avg_hash_time: _____ ms
  - [ ] p95_hash_time: _____ ms  
  - [ ] extraction_failures_rate: _____ %
  - [ ] low_confidence_queue_length: _____

- [ ] **T+15 minutes**: Second health check
  - [ ] avg_hash_time: _____ ms
  - [ ] p95_hash_time: _____ ms
  - [ ] extraction_failures_rate: _____ %
  - [ ] low_confidence_queue_length: _____

- [ ] **T+30 minutes**: Mid-monitoring check
  - [ ] avg_hash_time: _____ ms
  - [ ] p95_hash_time: _____ ms
  - [ ] extraction_failures_rate: _____ %
  - [ ] low_confidence_queue_length: _____

- [ ] **T+60 minutes**: Final monitoring check
  - [ ] avg_hash_time: _____ ms
  - [ ] p95_hash_time: _____ ms
  - [ ] extraction_failures_rate: _____ %
  - [ ] low_confidence_queue_length: _____

## Rollback Triggers (Immediate Action Required)

If ANY of these conditions are met during the 60-minute monitoring window, **IMMEDIATELY ESCALATE & ROLLBACK**:

- [ ] `/health` endpoint non-OK for >2 consecutive checks
- [ ] `extraction_failures_rate` > 3× baseline OR > 10%
- [ ] `p95_hash_time` > 30s OR > 3× baseline (persisting >5 minutes)
- [ ] `low_confidence_queue_length` > 100 OR > 5× baseline

### Rollback Process
If rollback is triggered:
- [ ] Execute rollback immediately:
  ```bash
  ./scripts/rollback_dhash.sh --backup backups/dhash_YYYYMMDDTHHMMSSZ.zip
  ```
- [ ] Create incident report
- [ ] Attach rollback artifacts and logs
- [ ] Notify stakeholders via established channels
- [ ] Post-rollback verification completed

## Communication Checkpoints

### T-30 (30 minutes before merge)
- [ ] Reminder sent to #deployments, @ops, @media-eng:
  > "Reminder: MOBIUS dhash production deploy in 30 minutes. Backup created & verified, dry-run logs attached to PR. Owners: Release owner, Deploy operator (@ops), Media engineer (@media-eng)."

### T-5 (5 minutes before merge)  
- [ ] Final call sent:
  > "Final call: merging & deploying MOBIUS dhash in 5 minutes. Backups verified. CI green. Post-deploy monitoring for 60 minutes. @ops stand by."

### T0 (Deploy start)
- [ ] Deploy started notification:
  > "Deploy STARTED for MOBIUS dhash. PR: [PR_LINK]. Deploy logs: [DEPLOY_LOG_LINK]. Monitoring /health & /metrics. Updates at +5, +15, +30, +60."

### T+15 (15 minutes post-deploy)
- [ ] Status update:
  > "Status +15: avg_hash_time=[VAL], p95_hash_time=[VAL], extraction_failures_rate=[VAL], low_confidence_queue_length=[VAL]. No rollback triggers observed."

### T+60 (Deploy complete)
- [ ] Final status:
  > "Deploy COMPLETE: Monitoring window closed. Final status: OK / Issues: [link to artifacts]."

## Final Sign-off
- [ ] **Release Manager**: _________________________ Date: _______
- [ ] **Operations Lead**: _________________________ Date: _______  
- [ ] **Engineering Lead**: ________________________ Date: _______

---
**Emergency Contacts**: @ops, @media-eng  
**Rollback Decision Authority**: Release Manager + Operations Lead  
**Maximum Monitoring Window**: 60 minutes (no exceptions)