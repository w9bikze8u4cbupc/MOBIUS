# MOBIUS Deployment Cheat Sheet

## Quick Reference

### 🚀 Production Deployment Commands

```bash
# 1. Create backup
./scripts/deploy/backup_dhash.sh --env production --components all

# 2. Run deployment
./scripts/deploy/deploy_dhash.sh --env production --mode production

# 3. Start monitoring
./scripts/deploy/monitor_dhash.sh --env production --duration 3600 --auto-rollback --backup-file backups/latest.zip

# 4. Run smoke tests
./scripts/deploy/smoke_tests.sh --env production --base-url https://api.mobius.com
```

### 🔄 Emergency Rollback Commands

```bash
# Quick rollback
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

## Pre-deployment Checklist

- [ ] **Backup Created**: `./scripts/deploy/backup_dhash.sh --env production --components all`
- [ ] **Backup Verified**: `sha256sum -c backups/latest.zip.sha256`
- [ ] **Pre-merge artifacts attached**: All required files from CI
- [ ] **CI Status**: All checks passing ✅
- [ ] **Approvals**: ≥2 approvers (≥1 Ops/SRE) ✅
- [ ] **Deploy operator sign-off**: @ops confirmed ✅
- [ ] **Monitoring ready**: T+60 window planned
- [ ] **Rollback plan**: Confirmed backup file path

## Deployment Process

### Phase 1: Pre-deployment (T-30min)
1. **Backup verification**
   ```bash
   LATEST_BACKUP=$(ls -1t backups/dhash_production_*.zip | head -n1)
   sha256sum -c "${LATEST_BACKUP}.sha256"
   ```

2. **Final pre-checks**
   ```bash
   ./scripts/deploy/premerge_orchestration.sh --env production --skip-smoke-tests
   ```

### Phase 2: Deployment (T-0)
1. **Execute deployment**
   ```bash
   ./scripts/deploy/deploy_dhash.sh \
     --env production \
     --mode production \
     --backup-file "$LATEST_BACKUP"
   ```

2. **Start monitoring**
   ```bash
   ./scripts/deploy/monitor_dhash.sh \
     --env production \
     --duration 3600 \
     --auto-rollback \
     --backup-file "$LATEST_BACKUP" &
   ```

### Phase 3: Validation (T+0 to T+15min)
1. **Smoke tests**
   ```bash
   ./scripts/deploy/smoke_tests.sh \
     --env production \
     --base-url https://api.mobius.com \
     --junit results/production-smoke-tests.xml
   ```

2. **Manual validation**
   - [ ] Health endpoint responding
   - [ ] Critical user paths working
   - [ ] No error spikes in logs

### Phase 4: Monitoring (T+15min to T+60min)
- **Automated monitoring**: Running via monitor script
- **Manual checks**: Every 15 minutes
- **Alert thresholds**: 3 consecutive failures = auto-rollback

## Environment URLs

| Environment | API URL | Status Page |
|-------------|---------|-------------|
| Production | https://api.mobius.com | https://status.mobius.com |
| Staging | https://staging-api.mobius.com | https://staging-status.mobius.com |

## Key Thresholds

| Metric | Threshold | Action |
|--------|-----------|--------|
| Response Time | >5000ms | Warning |
| Consecutive Failures | 3+ | Auto-rollback |
| Error Rate | >5% | Manual review |
| CPU Usage | >90% | Alert |
| Memory Usage | >90% | Alert |

## Notification Commands

```bash
# Deployment started
./scripts/deploy/notify.js template deploy-start production v1.2.3

# Deployment success
./scripts/deploy/notify.js template deploy-success production v1.2.3 "15m 30s"

# Deployment failed
./scripts/deploy/notify.js template deploy-failed production v1.2.3 "Database connection timeout"

# Rollback triggered
./scripts/deploy/notify.js template rollback-triggered production "3 consecutive health check failures"
```

## Emergency Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| Deploy Operator | @ops | #ops-oncall |
| SRE On-call | @sre-oncall | #sre-escalation |
| Engineering Lead | @eng-lead | #engineering |

## Troubleshooting

### Deployment Fails
1. Check deployment logs: `tail -f deploy-production-*.log`
2. Verify backup integrity: `sha256sum -c backups/latest.zip.sha256`
3. Manual rollback if needed: `./scripts/deploy/rollback_dhash.sh`

### Health Checks Fail
1. Check application logs: `tail -f monitor_logs/monitor-production-*.log`
2. Verify service status: `curl -i https://api.mobius.com/health`
3. Check system resources: `top`, `df -h`

### Auto-rollback Triggered
1. **Do not panic** - system is protecting itself
2. Check rollback logs: `tail -f rollback-*.log`
3. Verify rollback success: `curl https://api.mobius.com/health`
4. Investigate root cause before attempting re-deployment

## File Locations

```
backups/                    # Backup archives with SHA256
├── dhash_production_*.zip  # Production backups
├── dhash_production_*.zip.sha256
└── dhash_production_*.manifest

monitor_logs/              # Monitoring and test logs
├── monitor-production-*.log
├── postdeploy-smoketests-*.log
└── test_logging-*.log

scripts/deploy/           # Deployment scripts
├── backup_dhash.sh      # Backup creation
├── deploy_dhash.sh      # Main deployment
├── rollback_dhash.sh    # Emergency rollback
├── monitor_dhash.sh     # Post-deployment monitoring
├── smoke_tests.sh       # Smoke test suite
└── notify.js           # Notification tool
```

---

**⚠️ Remember**: Always verify backups before deployment. When in doubt, don't deploy.