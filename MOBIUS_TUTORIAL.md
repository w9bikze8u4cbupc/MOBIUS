# Guarded dhash Rollout — Operator Quick Reference

## Purpose

Safe, one-command guarded rollouts for dhash with pre-merge validation, backup verification, T+60 monitoring with quality gates, auto-rollback, manual rollback, and notification usage.

## Prerequisites

- Deploy operator credentials and GitHub permissions.
- CI passing for the PR (premerge.yml artifacts available).
- Backups present in `backups/` with matching `.sha256` files.
- Secrets (SLACK_WEBHOOK, TEAMS_WEBHOOK, EMAIL creds) stored in GitHub Actions secrets.
- Local tools: bash (POSIX), Node 18+ for notify.js, sha256sum (or equivalent).

## Quick safety checklist

- [ ] Attach artifacts: `backups/*.zip` + `.sha256`, `deploy-dryrun.log`, `migrate-dryrun.log`, `postdeploy-smoketests.log`, `test_logging.log`, `premerge_artifacts/`, `monitor_logs/`, CI links.
- [ ] Premerge CI green on all platforms.
- [ ] Branch protection in place (2 approvers, ≥1 Ops/SRE).
- [ ] Deploy operator (@ops) signs off.

## Create PR

1. Paste `PR_BODY.md` content as the PR description.
2. Add explicit merge note: **MERGE_NOW** approved with guarded rollout — rebase-and-merge after gates pass.

## Merge strategy

- Use **rebase-and-merge** for a linear history.
- Do not merge until checklist items and @ops sign-off are complete.

## One-command production deploy

```bash
./quick-deploy.sh --env production
```

**What it does:**
Pre-deploy validation → SHA256 backup → optional migrations → deploy → activates T+60 monitor.

## Dry-run / staging testing

```bash
./scripts/backup_dhash.sh --env staging --dry-run
./scripts/deploy_dhash.sh --env staging --dry-run
./scripts/migrate_dhash.sh --env staging --dry-run
```

## T+60 monitoring (behavior)

- **Window:** 60 minutes (default).
- **Poll cadence:** 30s for first 5m, then 120s.
- **Signals:** health checks, extraction failure rate, p95 latency, low-confidence queue, CPU/memory/disk.
- **Notifications** on state changes and anomalies.

## Default quality gates (production defaults)

- **Health non-OK:** >2 consecutive checks → auto-rollback.
- **Extraction failure rate:** >5% over 10 minutes → auto-rollback.
- **P95 hash time:** >2000 ms over 15 minutes → auto-rollback.
- **Low-confidence queue length:** >1000 items → auto-rollback.

*(Adjust in `quality-gates-config.json`.)*

## Auto-rollback flow

Monitor detects violation → verifies backup integrity (`.sha256`) → executes rollback → post-rollback verification (3 OK health checks) → re-run smoke tests → notifications and incident created.

## Manual rollback (emergency)

### Find and verify latest backup:
```bash
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
```

### Execute:
```bash
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force
```

**Post-rollback:** wait for 3 OK health checks, re-run smoke tests, attach logs to incident.

## Notifications examples

### Dry-run:
```bash
node scripts/deploy/deploy-notify.js start --env staging --dry-run
```

### Send real success:
```bash
SLACK_WEBHOOK="..." TEAMS_WEBHOOK="..." node scripts/deploy/deploy-notify.js success --env production --duration "5m 30s"
```

**If webhooks blocked:** notifications written to `notifications_out/` for audit.

## Troubleshooting

- **Webhook/network blocked:** use `--dry-run` in CI or configure proxy/NAT allowlist. Use file-fallback notifications.
- **Missing platform dependency** (e.g., poppler on Windows): use runbook helper or Linux runner.
- **Missing artifacts:** re-run `premerge.yml` with artifact upload enabled.

## Post-deploy tasks

- Collect 24–72h telemetry for threshold tuning.
- Verify artifact retention (backups/CI artifacts).
- If rollback occurred: create incident, collect logs, RCA, and update runbook.

## Runbook snippets

### Verify latest backup:
```bash
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
```

### Start monitor:
```bash
node scripts/monitor_dhash.js --env production
```

### Force rollback:
```bash
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force
```