# Operator Commands

Pre-merge:
./scripts/deploy/premerge_orchestration.sh --env staging --output premerge_artifacts

Rollback:
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
./scripts/deploy/rollback_dhash.sh --backup "${LATEST_BACKUP}" --env production
