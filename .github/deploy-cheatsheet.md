# Deploy Operator Quick Cheat Sheet — MOBIUS dhash

## Essential roles
- Release owner: PR author
- Deploy operator: @{{DEPLOY_LEAD}}
- Media QA: @media-eng
- Ops/SRE on-call: @{{OPS_ONCALL}}

## Quick commands
```bash
# Pre-merge artifact generation (local)
ARTIFACT_DIR=premerge_artifacts ./scripts/premerge_run.sh

# Merge after approvals + CI green (rebase)
gh pr merge --repo {{OWNER}}/{{REPO}} --head {{BRANCH}} --merge-method rebase --delete-branch

# Production deploy
export RELEASE_TAG="{{RELEASE_TAG}}"
./scripts/deploy_dhash.sh --env production --tag "$RELEASE_TAG"

# Monitor (T+60 default or pass seconds)
./scripts/monitor_dhash.sh --env production --duration 3600

# Emergency rollback
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

## Important file locations
- Scripts: scripts/{premerge_run.sh,deploy_dhash.sh,monitor_dhash.sh,rollback_dhash.sh}
- Backups: backups/*.zip, backups/*.zip.sha256
- Artifacts: premerge_artifacts/ , monitor_logs/
- Logs: deploy-dryrun.log, migrate-dryrun.log, postdeploy-smoketests.log, test_logging.log

## Monitoring thresholds (quick reference)
- Health: >2 consecutive non-OK checks → investigate / consider rollback
- Error rate: >10% OR >3× baseline → alert (auto-rollback configurable)
- p95 latency: >30s OR >3× baseline for 3 checks → alert
- Low-confidence queue: >100 OR >5× baseline → alert
- CPU: sustained >85% → investigate

## Timestamps / timeline
- T-30: prepare notifications, ensure backups present, final premerge check
- T-5: confirm deploy operator ready, last smoke test green
- T0: start deploy, announce in Slack/Teams
- T+15: quick verification, smoke tests run, early alerting
- T+60: final status, either mark stable or initiate rollback

## Rollbacks — fast checklist
- Verify backup sha256
- Run rollback script with --backup
- Wait for 3 consecutive OK health checks
- Re-run smoke tests
- Attach logs: restore.log, rollback_backups/, monitor_logs/post-rollback

## Contacts & escalation
- Primary deploy: {{DEPLOY_LEAD}} (@{{DEPLOY_LEAD_HANDLE}})
- Ops/SRE: @ops
- Media QA: @media-eng