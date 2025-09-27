# Mobius Tutorial — Guarded dhash Rollout (operator quick reference)

## Purpose

This guide walks operators through safe, one-command guarded rollouts for the dhash component, including pre-merge validation, backup verification, T+60 monitoring with quality gates, automatic rollback triggers, manual rollback, and notification usage.

## Prerequisites

- Deploy operator credentials and GitHub permissions.
- CI passing for the PR (premerge.yml artifacts available).
- Backups present in `backups/` with matching `.sha256` files.
- Secrets (`SLACK_WEBHOOK`, `TEAMS_WEBHOOK`, EMAIL creds) stored in GitHub Actions secrets — no secrets in repo.
- Local tools: bash (POSIX), Node 18+ for `notify.js`, `sha256sum` (or equivalent).

## Quick safety checklist (before creating/merging PR)

- [ ] Attach artifacts: `backups/*.zip` + `.sha256`, `deploy-dryrun.log`, `migrate-dryrun.log`, `postdeploy-smoketests.log`, `test_logging.log`, `premerge_artifacts/`, `monitor_logs/` and CI links.
- [ ] Premerge CI green on all platforms.
- [ ] Branch protection in place (2 approvers, ≥1 Ops/SRE).
- [ ] Deploy operator (@ops) signs off.

## Create PR — recommended PR body

Use the standardized `PR_BODY.md` content (PR checklist already prepared).

Include explicit note: **MERGE_NOW approved with guarded rollout** — rebase-and-merge after gates pass.

## Merge strategy

- Use **rebase-and-merge** for a linear history (required).
- Do not merge until all checklist items above are complete and @ops sign-off is present.

## One-command production deploy

Run the production wrapper (recommended):

```bash
./quick-deploy.sh --env production
```

This runs:
- Pre-deploy validation
- Timestamped SHA256 backup creation
- Migration dry-run/confirmation (if required)
- Deployment (or no-op with `--dry-run`)
- Activates T+60 monitoring automatically

## Dry-run / staging

Test everything first in staging:

```bash
./scripts/backup_dhash.sh --env staging --dry-run
./scripts/deploy_dhash.sh --env staging --dry-run
./scripts/migrate_dhash.sh --env staging --dry-run
```

## T+60 monitoring behavior (what it does)

- **Monitoring window**: 60 minutes by default.
- **Poll cadence**: 30s for the first 5 minutes, then 120s thereafter.
- **Monitored signals**: health checks, extraction failure rate, p95 hash time, low-confidence queue length, core resource usage (CPU/memory/disk).
- Notifications are emitted for state changes and anomalies.

## Default quality gate thresholds (production defaults — configurable)

- **Health non-OK**: >2 consecutive checks → auto-rollback.
- **Extraction failure rate**: >5% over 10 minutes → auto-rollback.
- **P95 hash time**: >2000 ms over 15 minutes → auto-rollback.
- **Low-confidence queue length**: >1000 items → auto-rollback.

(See `quality-gates-config.json` to tune per environment.)

## Auto-rollback behavior

If any configured gate is violated:

1. The monitor triggers an automatic rollback using the latest verified backup.
2. Rollback uses backup integrity verification (`.sha256`) before restore.
3. Post-rollback verification requires 3 consecutive OK health checks and re-run smoke tests.
4. All actions are logged and notifications are emitted.

## Manual rollback (emergency)

1. **Find and verify the latest backup**:
```bash
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
```

2. **Execute rollback**:
```bash
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force
```

3. **Post-rollback**:
   - Wait for 3 consecutive OK health checks: `./health-check.sh` in loop or monitor dashboard.
   - Re-run smoke tests and attach restore logs to the incident.

## Notifications — usage examples

**Local dry-run**:
```bash
node scripts/deploy/deploy-notify.js start --env staging --dry-run
```

**Send real deploy success**:
```bash
SLACK_WEBHOOK="https://hooks.slack.com/..." \
TEAMS_WEBHOOK="https://outlook.office.com/..." \
node scripts/deploy/deploy-notify.js success --env production --duration "5m 30s"
```

If network/webhooks blocked, notifications are written to `notifications_out/` for audit.

## Common troubleshooting

- **Webhook/network blocked**: run CI with `--dry-run` or configure a send-only proxy/NAT allowlist. Use file-based fallback notifications.
- **Missing poppler on Windows**: follow runbook helper to install poppler or use Linux runner image for that job.
- **CI artifacts missing**: re-run `premerge.yml` with artifact upload enabled and ensure retention policy keeps artifacts long enough.
- **Threshold tuning**: collect 24–72 hours telemetry, then update `quality-gates-config.json` and redeploy monitor config.

## Post-deploy tasks

- Collect 24–72h telemetry and flag for thresholds tuning.
- Confirm artifact retention policy for backups and CI artifacts (recommended external durable storage if needed).
- If auto-rollback triggered, create incident, collect logs, perform RCA, and update runbook with new mitigations.

## Runbook snippets to copy

**Verify latest backup**:
```bash
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
```

**Start monitor manually**:
```bash
node scripts/monitor_dhash.js --env production
```

**Force rollback (emergency)**:
```bash
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force
```

## Escalation & owners

- **Release owner / PR author**: prepares PR artifacts and runs pre-merge script.
- **Deploy operator**: @ops — executes production deploy and monitors T+60.
- **Media engineering**: @media-eng — validates golden tests / media QA.
- **Triage lead / on-call**: Ops/SRE — handles incident/rollback and postmortem.

---

*This tutorial is ready for use with the Mobius tutorial generator or as standalone operator documentation.*