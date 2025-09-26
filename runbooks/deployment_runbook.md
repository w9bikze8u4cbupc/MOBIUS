# MOBIUS Deployment Runbook

## Overview

This runbook covers the complete deployment process for MOBIUS, including guarded rollouts, monitoring, and rollback procedures.

## Prerequisites

- [ ] PR has passed pre-merge validation workflow
- [ ] 2+ approvals obtained (≥1 Ops/SRE)
- [ ] Deploy operator sign-off received
- [ ] All required artifacts attached to PR
- [ ] Branch protection requirements met

## Pre-Deployment Steps

### 1. Environment Validation

```bash
# Verify target environment
export TARGET_ENV="production"  # or "staging"

# Check current system status
./scripts/deploy/smoke_tests.sh --env $TARGET_ENV --quick

# Verify deployment readiness
./scripts/deploy/deploy_dryrun.sh --env $TARGET_ENV
```

### 2. Create Backup

```bash
# Create SHA256-verified backup
./scripts/deploy/backup.sh --env $TARGET_ENV

# Verify backup integrity
LATEST_BACKUP=$(ls -1 backups/dhash_${TARGET_ENV}_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"

echo "Backup verified: $LATEST_BACKUP"
```

### 3. Pre-deployment Orchestration

```bash
# Run complete pre-merge automation
./scripts/deploy/premerge_orchestration.sh --env $TARGET_ENV

# Verify all artifacts are generated
ls -la premerge_artifacts/
```

## Deployment Process

### 1. Deploy Application

```bash
# Install dependencies
npm ci --production

# Apply configuration changes
cp config/${TARGET_ENV}/* /path/to/config/

# Restart services (customize per environment)
systemctl restart mobius-api
systemctl restart mobius-worker
```

### 2. Run Database Migrations

```bash
# Dry-run migrations first
./scripts/deploy/migration_dryrun.sh --env $TARGET_ENV

# Apply migrations (if any)
npm run migrate:$TARGET_ENV
```

### 3. Post-deployment Verification

```bash
# Run smoke tests
./scripts/deploy/smoke_tests.sh --env $TARGET_ENV

# Start monitoring with auto-rollback
MONITOR_DURATION=3600 AUTO_ROLLBACK=true \
  ./scripts/deploy/monitor.sh \
  --env $TARGET_ENV \
  --auto-rollback \
  --backup "$LATEST_BACKUP" &

MONITOR_PID=$!
echo "Monitoring started with PID: $MONITOR_PID"
```

## Monitoring Phase (T+60 minutes)

### Monitoring Dashboard

Monitor the following metrics for 60 minutes:

- **Health Checks**: Must maintain >95% success rate
- **Response Times**: P95 latency <5000ms
- **Error Rates**: <5% error rate
- **System Resources**: CPU, memory, disk usage

### Auto-rollback Triggers

The monitoring system will automatically trigger rollback if:

- 3 consecutive health check failures
- Overall success rate <70% after ≥5 checks  
- P95 latency >5000ms consistently
- Error rate >5% for 5+ consecutive checks

### Manual Monitoring Commands

```bash
# Check monitoring status
ps aux | grep monitor.sh

# View monitoring logs
tail -f monitor_logs/monitor_${TARGET_ENV}_*.log

# Check current health
curl -f http://localhost:3000/health
```

## Success Criteria

Deployment is considered successful when:

- [ ] All smoke tests pass
- [ ] Health endpoint returns 200 OK
- [ ] No critical errors in logs
- [ ] Performance metrics within acceptable ranges
- [ ] 60-minute monitoring period completes without auto-rollback
- [ ] Manual verification confirms functionality

## Post-Deployment Tasks

### 1. Update Documentation

- [ ] Update deployment log
- [ ] Document any configuration changes
- [ ] Update monitoring baselines if needed

### 2. Stakeholder Communication

```bash
# Send deployment success notification
# (Use templates/notifications/slack-success.json)
```

### 3. Cleanup

```bash
# Archive deployment artifacts
./scripts/deploy/lcm_export.sh --env $TARGET_ENV

# Clean up old logs and temporary files
find monitor_logs/ -mtime +30 -delete
find premerge_artifacts/ -mtime +7 -delete
```

## Emergency Procedures

### Immediate Rollback

If critical issues are detected:

```bash
# Stop monitoring
kill $MONITOR_PID

# Emergency rollback
./scripts/deploy/rollback_dhash.sh \
  --backup "$LATEST_BACKUP" \
  --env $TARGET_ENV \
  --force
```

### Manual Health Verification

After rollback:

```bash
# Verify rollback success
./scripts/deploy/smoke_tests.sh --env $TARGET_ENV

# Require 3 consecutive OK health checks
for i in {1..3}; do
  echo "Health check $i/3:"
  curl -f http://localhost:3000/health && echo " ✅" || echo " ❌"
  sleep 10
done
```

## Troubleshooting

### Common Issues

1. **Health checks failing**
   - Check service status: `systemctl status mobius-*`
   - Review application logs: `journalctl -u mobius-api -f`
   - Verify configuration: `ls -la config/$TARGET_ENV/`

2. **High latency**
   - Check system resources: `htop`, `df -h`
   - Review database connections
   - Check network connectivity

3. **Deployment script errors**
   - Verify file permissions: `ls -la scripts/deploy/`
   - Check required environment variables
   - Ensure all dependencies installed

### Recovery Procedures

1. **Service won't start**
   ```bash
   # Check logs
   journalctl -u mobius-api --since "10 minutes ago"
   
   # Restart with backup config
   systemctl stop mobius-api
   cp config/backup/* config/current/
   systemctl start mobius-api
   ```

2. **Database issues**
   ```bash
   # Rollback migrations
   npm run migrate:rollback
   
   # Restore database from backup
   # (Database-specific commands)
   ```

## Contacts

- **Primary Deploy Operator**: @ops
- **SRE On-call**: @sre-oncall  
- **Engineering Lead**: @eng-lead
- **Emergency Escalation**: @incident-commander

## Automation

- **Pre-merge**: `.github/workflows/premerge-validation.yml`
- **Backup**: `scripts/deploy/backup.sh`
- **Deploy**: `scripts/deploy/deploy_dryrun.sh`
- **Monitor**: `scripts/deploy/monitor.sh`
- **Rollback**: `scripts/deploy/rollback_dhash.sh`
- **Tests**: `scripts/deploy/smoke_tests.sh`

---

**Last Updated**: $(date --iso-8601)  
**Document Version**: 1.0  
**Review Cycle**: Monthly