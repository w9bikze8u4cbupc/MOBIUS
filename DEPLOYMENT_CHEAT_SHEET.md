# MOBIUS Deployment Cheat Sheet

## Quick Deploy Commands

### Pre-Deploy Setup
```bash
# Set environment variables
export RELEASE_TAG="v1.0.0"
export DEPLOY_LEAD="@ops"
export ENVIRONMENT="production"
```

### Merge & Release
```bash
# After 2+ approvals + CI green
gh pr merge --repo w9bikze8u4cbupc/MOBIUS --head feature/dhash-production-ready --merge-method rebase --delete-branch

# Create release tag (optional)
git tag -a $RELEASE_TAG -m "dhash release $RELEASE_TAG"
git push origin $RELEASE_TAG
```

### Production Deploy
```bash
# Start deployment
./scripts/deploy_dhash.sh --env production --tag "$RELEASE_TAG"

# Start monitoring (default 3600s)
./scripts/monitor_dhash.sh --env production --duration 3600
```

### Rollback (Emergency)
```bash
# Get latest backup
LATEST_BACKUP=$(ls -1 backups/dhash*.zip | sort -r | head -n1)

# Verify backup integrity
sha256sum -c "${LATEST_BACKUP}.sha256"

# Execute rollback
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

## Required Status Checks
- `CI / build-and-qa`
- `premerge-validation`  
- `premerge-artifacts-upload`

## Critical Monitoring T+60
- Health endpoint: non-OK >2 consecutive → rollback
- Error rate: >10% OR >3× baseline → alert
- p95_hash_time: >30s OR >3× baseline (3 checks) → alert  
- Queue length: >100 OR >5× baseline → alert
- System: CPU >85%, memory OOMs, disk I/O anomalies

## File Locations
- Quality gates: `quality-gates-config.json`
- Deploy logs: `deploy-dryrun.log`
- Monitor logs: `monitor_logs/`
- Smoke tests: `postdeploy-smoketests.log`
- Backups: `backups/dhash*.zip + .sha256`