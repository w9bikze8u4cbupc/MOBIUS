# Rollback Runbook

Emergency rollback steps:
1. Identify latest backup: LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
2. Verify: sha256sum -c "${LATEST_BACKUP}.sha256"
3. Execute rollback: ./scripts/deploy/rollback_dhash.sh --backup "${LATEST_BACKUP}" --env production
4. Post-rollback: require 3 consecutive OK health checks and re-run smoke tests
