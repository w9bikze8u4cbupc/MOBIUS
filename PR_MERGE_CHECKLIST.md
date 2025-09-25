# PR Merge & Deploy Checklist

## Purpose
Ensure every merge and production deploy for the MOBIUS dhash system follows a repeatable, safe, and observable process.

## Preconditions (must be true before starting)
- Branch is rebased on main and working tree is clean.
- CI matrix configured for Ubuntu/macOS/Windows and Node 20+.
- scripts/backup_library.sh, scripts/deploy_dhash.sh, scripts/rollback_dhash.sh present and executable.
- A member of Ops/SRE is assigned as on-call for the window.

## Required approvers
- Minimum 2 approvals, one must be Ops/SRE (label reviewers in PR).

## Artifacts to attach to PR
- deploy-dryrun.log (from ./scripts/deploy_dhash.sh --dry-run --env staging)
- migrate-dryrun.log (from node scripts/migrate-dhash.js --dry-run)
- backup ZIP (.zip) and checksum (.zip.sha256)

## Pre-merge steps (T - 60 to T - 5)
- [ ] Rebase branch:
  - git fetch origin
  - git checkout <HEAD_BRANCH>
  - git rebase origin/main
- [ ] Create verified backup (attach backup and checksum):
  - BACKUP_FN="backups/dhash_$(date -u +%Y%m%dT%H%M%SZ).zip"
  - ./scripts/backup_library.sh --out "$BACKUP_FN"
  - sha256sum "$BACKUP_FN" > "$BACKUP_FN.sha256"
  - sha256sum -c "$BACKUP_FN.sha256"  # expect "OK"
- [ ] Run dry-run deploy & migration; attach logs:
  - ./scripts/deploy_dhash.sh --dry-run --env staging > deploy-dryrun.log 2>&1
  - node scripts/migrate-dhash.js --dry-run > migrate-dryrun.log 2>&1
- [ ] Run smoke tests (attach logs):
  - node scripts/test_logging.js > test_logging.log 2>&1
  - node scripts/smoke-tests.js --quick > smoke_quick.log 2>&1
- [ ] Confirm CI is green for full matrix (include ESLint job).
- [ ] Confirm artifact retention settings and that large golden files are managed.

## Merge & deploy (T0)
- Merge method: rebase-and-merge (preserves linear history).
  - gh pr merge --repo OWNER/REPO --head <HEAD_BRANCH> --merge-method rebase --delete-branch
- After merge, immediately run production deploy (Ops executes):
  - ./scripts/deploy_dhash.sh --env production
  - mv deploy.log deploy_production_$(date -u +%Y%m%dT%H%M%SZ).log

## Post-deploy smoke tests (immediate)
- node scripts/smoke-tests.js --quick > postdeploy-smoketests.log 2>&1
- node scripts/test_logging.js >> postdeploy-smoketests.log 2>&1

## Monitoring window (T0 → T+60)
- Active monitoring for 60 minutes. Poll every 30s for first 5 minutes, then every 2 minutes until T+60.
- Health endpoint: GET /health — expected "status": "OK"
- Metrics endpoint: GET /metrics/dhash — check:
  - avg_hash_time (ms)
  - p95_hash_time (ms)
  - extraction_failures_rate (%)
  - low_confidence_queue_length (count)
- Snapshot metrics at +5, +15, +30, +60 and attach to PR/incident if problems.

## Rollback triggers (immediate escalation and rollback)
- /health returns non-OK for > 2 consecutive checks.
- extraction_failures_rate > 10% OR > 3× baseline.
- p95_hash_time > 30,000 ms OR > 3× baseline for 3 consecutive checks.
- low_confidence_queue_length > 100 OR > 5× baseline.

## Rollback procedure
- Identify latest verified backup:
  - LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
  - Confirm sha: sha256sum -c "${LATEST_BACKUP}.sha256"
- Execute rollback:
  - ./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP"
- Verify health:
  - curl -fsS http://localhost:5000/health | jq .
- Collect artifacts:
  - tar -czvf rollback-artifacts_$(date -u +%Y%m%dT%H%M%SZ).tgz logs/ deploy_production_*.log postdeploy-smoketests.log "$LATEST_BACKUP" "${LATEST_BACKUP}.sha256"
- Open incident with artifacts and backup SHA256, notify Ops and media-eng.

## Post-deploy follow-up (T+60 → T+72h)
- Triage low-confidence queue exports (node scripts/lcm_export.js).
- Create tickets from TECH_DEBT.md entries and assign owners.
- Prepare release note with metrics snapshot and attach backup checksum.

## Environment variables & config (recommended)
- HEALTH_URL (default: http://localhost:5000/health)
- METRICS_URL (default: http://localhost:5000/metrics/dhash)
- ROLLBACK_SCRIPT (default: ./scripts/rollback_dhash.sh)
- BACKUP_DIR (default: backups/)
- LOG_DIR (default: logs/)
- MONITOR_INTERVAL (seconds; default 30/120)
- MONITOR_DURATION (seconds; default 3600)

## Contacts (example)
- Ops/SRE: @ops
- Media engineering lead: @media-eng
- Release owner: PR author

## Notes
- All checks that alter production state must be performed in staging dry-run mode first. Attach logs.
- Maintain conservative thresholds initially; tune baselines after 24–72h of production telemetry.