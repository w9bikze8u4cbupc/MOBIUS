# MOBIUS Rollback Runbook

## Overview

This runbook covers emergency rollback procedures for MOBIUS deployments, including automated and manual rollback scenarios.

## When to Rollback

### Automatic Rollback Triggers

The monitoring system triggers automatic rollback when:

- **Health Failures**: 3 consecutive health check failures
- **Success Rate**: Overall success <70% after ≥5 checks
- **High Latency**: P95 response times >5000ms consistently  
- **Error Rate**: >5% error rate for 5+ consecutive checks

### Manual Rollback Indicators

Consider manual rollback when:

- Critical functionality is broken
- Data corruption is detected
- Security vulnerabilities are exposed
- Performance degradation affects user experience
- Stakeholder requests immediate rollback

## Pre-Rollback Assessment

### 1. Impact Analysis

```bash
# Check current system status
./scripts/deploy/smoke_tests.sh --env production --quick

# Review monitoring metrics
tail -100 monitor_logs/monitor_production_*.log

# Assess user impact
curl -s http://localhost:3000/health | jq .
```

### 2. Identify Latest Backup

```bash
# Find latest verified backup
LATEST_BACKUP=$(ls -1 backups/dhash_production_*.zip | sort -r | head -n1)
echo "Latest backup: $LATEST_BACKUP"

# Verify backup integrity  
sha256sum -c "${LATEST_BACKUP}.sha256"
```

### 3. Communication

- [ ] Notify incident commander
- [ ] Alert stakeholders via Slack/Teams
- [ ] Update status page if applicable
- [ ] Document rollback decision

## Rollback Execution

### Automated Rollback

If monitoring detects critical issues:

```bash
# Monitoring will automatically execute:
./scripts/deploy/rollback_dhash.sh \
  --backup "$LATEST_BACKUP" \
  --env production \
  --force
```

### Manual Rollback

For manual rollback execution:

```bash
# Set environment
export TARGET_ENV="production"
export BACKUP_FILE="backups/dhash_production_YYYYMMDD_HHMMSS.zip"

# Verify backup exists and is valid
ls -la "$BACKUP_FILE"
sha256sum -c "${BACKUP_FILE}.sha256"

# Execute rollback
./scripts/deploy/rollback_dhash.sh \
  --backup "$BACKUP_FILE" \
  --env $TARGET_ENV \
  --force
```

## Post-Rollback Verification

### 1. Service Status Check

```bash
# Verify services are running
systemctl status mobius-api
systemctl status mobius-worker

# Check process health
ps aux | grep node.*mobius
```

### 2. Health Verification

Run 3 consecutive health checks as required:

```bash
for i in {1..3}; do
  echo "Health check $i/3 ($(date)):"
  if curl -f -s -m 10 http://localhost:3000/health; then
    echo " ✅ PASSED"
  else
    echo " ❌ FAILED"
    echo "   Rollback may have failed - investigate immediately"
  fi
  sleep 10
done
```

### 3. Functionality Testing

```bash
# Run smoke tests
./scripts/deploy/smoke_tests.sh --env $TARGET_ENV

# Test critical user flows
curl -f http://localhost:3000/api/version
curl -f http://localhost:3000/api/health/detailed
```

### 4. Data Integrity Check

```bash
# Verify database connectivity
# (Database-specific commands)

# Check configuration files
diff -r config/backup config/$TARGET_ENV

# Verify file permissions
ls -la scripts/deploy/
```

## Rollback Failure Recovery

If rollback fails:

### 1. Emergency Stop

```bash
# Stop all services
systemctl stop mobius-api
systemctl stop mobius-worker

# Kill any remaining processes
pkill -f "node.*mobius"
```

### 2. Manual Restoration

```bash
# Extract backup manually
cd /tmp
unzip "$BACKUP_FILE"

# Restore configuration
cp -r config/* /path/to/production/config/

# Restore application code (if needed)
# This depends on your deployment architecture

# Restart services
systemctl start mobius-api
systemctl start mobius-worker
```

### 3. Escalation

- Contact SRE on-call immediately
- Initiate emergency incident response
- Consider activating disaster recovery procedures
- Document all attempted recovery steps

## Different Rollback Scenarios

### Scenario 1: Configuration Rollback Only

```bash
# Stop services
systemctl stop mobius-api

# Restore configuration
cp config/backup/* config/production/

# Restart services  
systemctl start mobius-api

# Verify
curl -f http://localhost:3000/health
```

### Scenario 2: Code + Configuration Rollback

```bash
# Full application rollback
./scripts/deploy/rollback_dhash.sh \
  --backup "$BACKUP_FILE" \
  --env production

# Verify deployment
./scripts/deploy/smoke_tests.sh --env production
```

### Scenario 3: Database Rollback Required

```bash
# Application rollback first
./scripts/deploy/rollback_dhash.sh \
  --backup "$BACKUP_FILE" \
  --env production

# Database rollback (if applicable)
npm run migrate:rollback
# OR restore database from backup

# Verify complete system
./scripts/deploy/smoke_tests.sh --env production
```

## Monitoring After Rollback

### 1. Extended Monitoring

```bash
# Monitor for 30 minutes post-rollback
MONITOR_DURATION=1800 \
  ./scripts/deploy/monitor.sh \
  --env $TARGET_ENV \
  --duration 1800
```

### 2. Log Monitoring

```bash
# Monitor application logs
journalctl -u mobius-api -f

# Monitor system logs
tail -f /var/log/syslog

# Monitor performance metrics
htop
iostat 5
```

## Communication Templates

### Rollback Started

```
🚨 ROLLBACK IN PROGRESS 🚨

Environment: Production
Reason: [Brief description]
Started: [Timestamp]
ETA: 10-15 minutes

Status updates will follow.
```

### Rollback Completed

```
✅ ROLLBACK COMPLETED

Environment: Production  
Completed: [Timestamp]
Services: All systems operational
Health: 3/3 health checks passed

Root cause analysis to follow.
```

### Rollback Failed

```
🚨 ROLLBACK FAILED - ESCALATION REQUIRED

Environment: Production
Failed: [Timestamp]  
Issue: [Description]
Action: SRE on-call engaged

Manual intervention in progress.
```

## Prevention

### Deployment Best Practices

- Always run pre-deployment validation
- Maintain current backups
- Test rollback procedures in staging
- Monitor deployments actively
- Have clear rollback criteria

### Monitoring Improvements

- Tune auto-rollback thresholds based on historical data
- Add application-specific health checks
- Monitor business metrics, not just technical metrics
- Implement gradual traffic shifting for major changes

## Post-Incident

### 1. Root Cause Analysis

- [ ] Document what triggered the rollback
- [ ] Analyze failed deployment artifacts  
- [ ] Review monitoring data and logs
- [ ] Interview involved team members
- [ ] Identify prevention opportunities

### 2. Process Improvements

- [ ] Update deployment procedures if needed
- [ ] Adjust monitoring thresholds if appropriate
- [ ] Enhance automated testing
- [ ] Update documentation and runbooks

### 3. Team Communication

- [ ] Share lessons learned
- [ ] Update training materials
- [ ] Review and practice rollback procedures
- [ ] Update emergency contact information

## Quick Reference

### Emergency Commands

```bash
# Quick backup verification
LATEST=$(ls -1t backups/dhash_production_*.zip | head -n1)
sha256sum -c "${LATEST}.sha256"

# Emergency rollback
./scripts/deploy/rollback_dhash.sh --backup "$LATEST" --env production --force

# Health verification
for i in {1..3}; do curl -f http://localhost:3000/health && echo " ✅"; sleep 10; done

# Service restart
systemctl restart mobius-api mobius-worker
```

### Contacts

- **SRE On-call**: @sre-oncall (Immediate escalation)
- **Deploy Operator**: @ops (Rollback authorization)
- **Engineering Lead**: @eng-lead (Technical decisions)
- **Incident Commander**: @incident-commander (Major incidents)

---

**Last Updated**: $(date --iso-8601)  
**Document Version**: 1.0  
**Review Cycle**: After each rollback event