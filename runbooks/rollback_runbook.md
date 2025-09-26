# MOBIUS Rollback Runbook

## Overview

This runbook provides emergency procedures for rolling back MOBIUS deployments when issues are detected. It covers both automated rollback triggers and manual rollback execution.

## When to Rollback

### Automatic Rollback Triggers

The monitoring system will automatically trigger rollback when:

- **3 consecutive health check failures**
- **Overall success rate < 70%** after ≥5 checks
- **p95 latency > 5000ms** consistently  
- **Error rate > 5%**

### Manual Rollback Criteria

Consider manual rollback when:

- [ ] Critical functionality is broken
- [ ] Data corruption detected
- [ ] Severe performance degradation (>10x baseline)
- [ ] Security vulnerability exposed
- [ ] External service integrations failing
- [ ] Unacceptable user experience impact

## Emergency Response

### Immediate Actions (0-5 minutes)

#### 1. Incident Declaration
```bash
# Set incident response mode
echo "INCIDENT: MOBIUS Rollback Required - $(date)"
echo "Initiated by: $(whoami)"
echo "Environment: $ENV"
```

#### 2. Stop Incoming Traffic (if possible)
```bash
# If using load balancer, redirect traffic
# This is environment-specific - adjust as needed
# Example commands:
# nginx -s stop
# systemctl stop haproxy
# kubectl scale deployment mobius --replicas=0
```

#### 3. Identify Backup for Rollback
```bash
# Navigate to backups directory
cd backups

# Find latest verified backup
LATEST_BACKUP=$(ls -1 dhash_*.zip | sort -r | head -n1)
echo "Target backup: $LATEST_BACKUP"

# Verify backup integrity IMMEDIATELY
sha256sum -c "${LATEST_BACKUP}.sha256"
if [[ $? -ne 0 ]]; then
    echo "CRITICAL: Backup integrity check FAILED"
    echo "Escalate to senior engineer immediately"
    exit 1
fi
```

## Rollback Execution

### Phase 1: Pre-rollback Safety (5-10 minutes)

#### 1.1 Emergency Backup of Current State
```bash
# Create snapshot of current broken state for investigation
./scripts/deploy/backup_dhash.sh --env $ENV --backup-dir ./emergency_backups
```

#### 1.2 Notify Stakeholders
```bash
# Send immediate notification (adjust notification method as needed)
echo "ROLLBACK INITIATED: MOBIUS $ENV deployment at $(date)" | tee rollback_notification.txt

# If you have Slack/Teams integration:
# slack-notify "🚨 ROLLBACK INITIATED: MOBIUS $ENV deployment"
# teams-notify "🚨 ROLLBACK INITIATED: MOBIUS $ENV deployment"
```

### Phase 2: Execute Rollback (10-20 minutes)

#### 2.1 Automated Rollback
```bash
# Execute automatic rollback using latest verified backup
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env $ENV --force

# Monitor rollback execution
ROLLBACK_EXIT_CODE=$?
if [[ $ROLLBACK_EXIT_CODE -eq 0 ]]; then
    echo "✅ Automated rollback completed successfully"
else
    echo "❌ Automated rollback failed - switching to manual procedure"
fi
```

#### 2.2 Manual Rollback (if automated fails)

**⚠️ Only if automated rollback fails:**

```bash
# 1. Stop all services
systemctl stop mobius-app 2>/dev/null || true
pkill -f "node.*mobius" 2>/dev/null || true

# 2. Extract backup manually
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"
unzip "$LATEST_BACKUP"

# 3. Find backup directory
BACKUP_DIR=$(find . -name "dhash_*" -type d | head -1)
cd "$BACKUP_DIR"

# 4. Restore critical files
cp -r src/ $REPO_ROOT/
cp -r scripts/ $REPO_ROOT/
cp package*.json $REPO_ROOT/

# 5. Restore dependencies
cd $REPO_ROOT
npm ci

# 6. Restart services
systemctl start mobius-app 2>/dev/null || node src/api/index.js &
```

### Phase 3: Post-rollback Verification (20-25 minutes)

#### 3.1 Health Verification
```bash
# Wait for services to stabilize
sleep 30

# Run comprehensive smoke tests
./scripts/deploy/smoke_tests.sh --env $ENV --api-url $API_BASE_URL

# Require 3 consecutive OK health checks
for i in {1..3}; do
    echo "Health check $i/3..."
    if curl -f --connect-timeout 10 --max-time 10 "$API_BASE_URL/health"; then
        echo "✅ Health check $i passed"
    else
        echo "❌ Health check $i failed - rollback may not be complete"
        exit 1
    fi
    sleep 10
done

echo "✅ All health checks passed"
```

#### 3.2 Functionality Verification

**Complete these checks immediately:**

- [ ] **Primary Application**: Core functionality restored
- [ ] **API Endpoints**: Critical endpoints responding  
- [ ] **Database**: Data integrity confirmed
- [ ] **File System**: File operations working
- [ ] **External Integrations**: Third-party services accessible

### Phase 4: System Stabilization (25-30 minutes)

#### 4.1 Performance Monitoring
```bash
# Start short-term monitoring to confirm stability
MONITOR_DURATION=600 AUTO_ROLLBACK=false ./scripts/deploy/monitor.sh --env $ENV --api-url $API_BASE_URL &
MONITOR_PID=$!

echo "Post-rollback monitoring started (10 minutes)"
echo "Monitor PID: $MONITOR_PID"
```

#### 4.2 Traffic Restoration
```bash
# Gradually restore traffic (if it was stopped)
# This is environment-specific
# Examples:
# nginx -s reload
# systemctl start haproxy
# kubectl scale deployment mobius --replicas=3
```

## Rollback Verification Checklist

### Critical System Checks
- [ ] Health endpoint returns HTTP 200
- [ ] Primary application functions work
- [ ] Database operations successful
- [ ] No critical errors in logs
- [ ] Response times within acceptable range (<2s)

### Business Function Checks
- [ ] Game tutorial generation works
- [ ] Video processing functions
- [ ] File upload/download operates
- [ ] User authentication works (if applicable)
- [ ] API endpoints respond correctly

### Performance Checks  
- [ ] CPU usage normal (<80%)
- [ ] Memory usage stable
- [ ] Disk I/O responsive
- [ ] Network connectivity stable
- [ ] No resource leaks detected

## Post-Rollback Actions

### Immediate (30-60 minutes)

#### 1. Confirm System Stability
```bash
# Wait for monitoring to complete
wait $MONITOR_PID
MONITOR_STATUS=$?

if [[ $MONITOR_STATUS -eq 0 ]]; then
    echo "✅ Post-rollback monitoring successful"
else
    echo "⚠️ Post-rollback monitoring showed issues - investigate immediately"
fi
```

#### 2. Stakeholder Communication
```bash
# Generate rollback completion report
cat > rollback_report.txt << EOF
MOBIUS Rollback Complete
========================
Environment: $ENV
Rollback Time: $(date)
Backup Used: $LATEST_BACKUP
System Status: OPERATIONAL
Next Steps: Investigation Required

Rollback initiated due to: [FILL IN REASON]
Rollback completed at: $(date)
System stability confirmed: $(if [[ $MONITOR_STATUS -eq 0 ]]; then echo "YES"; else echo "UNDER INVESTIGATION"; fi)
EOF

# Notify stakeholders of completion
# slack-notify "✅ ROLLBACK COMPLETE: MOBIUS $ENV system restored and stable"
# teams-notify "✅ ROLLBACK COMPLETE: MOBIUS $ENV system restored and stable"
```

### Short-term (1-24 hours)

#### 1. Root Cause Analysis
- [ ] Identify what caused the rollback need
- [ ] Document timeline of events
- [ ] Preserve failed deployment artifacts for analysis
- [ ] Review monitoring data leading up to failure

#### 2. System Hardening
- [ ] Update monitoring thresholds if needed
- [ ] Improve rollback procedures based on lessons learned
- [ ] Update deployment validation checks
- [ ] Review backup and restore procedures

### Long-term (1-7 days)

#### 1. Process Improvements
- [ ] Conduct post-incident review
- [ ] Update runbooks based on experience
- [ ] Improve automation where manual steps were required
- [ ] Enhance monitoring and alerting

#### 2. Team Communication
- [ ] Share lessons learned with team
- [ ] Update training materials
- [ ] Review incident response procedures
- [ ] Plan deployment process improvements

## Emergency Escalation

### Escalation Matrix

| Timeframe | Action | Contact |
|-----------|--------|---------|
| 0-5 min | Initial response | Deploy operator |
| 5-15 min | Technical escalation | SRE on-call |
| 15-30 min | Management notification | Engineering lead |
| 30-60 min | Business escalation | Product owner |
| 60+ min | Executive escalation | CTO/VP Engineering |

### Critical Failure Scenarios

**If rollback fails completely:**

1. **IMMEDIATE**: Escalate to senior engineering
2. **PRESERVE**: All logs and system state
3. **ISOLATE**: Affected systems if possible
4. **COMMUNICATE**: Stakeholders of severe impact
5. **ACTIVATE**: Disaster recovery procedures

## Recovery Commands Reference

### Quick Rollback Commands
```bash
# Emergency rollback (copy/paste ready)
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force

# Emergency health check
curl -f http://localhost:5001/health && echo "✅ Health OK" || echo "❌ Health FAILED"

# Emergency smoke test  
./scripts/deploy/smoke_tests.sh --env production
```

### Monitoring Commands
```bash
# Start emergency monitoring
MONITOR_DURATION=600 ./scripts/deploy/monitor.sh --env production &

# Check system resources
df -h
free -h
top -n 1 -b
```

## Related Documentation

- [Deployment Runbook](./deployment_runbook.md)
- [Incident Response Procedures](../incident-response/)
- [System Monitoring Guide](../monitoring/)

---

**Document Version**: 1.0  
**Last Updated**: $(date '+%Y-%m-%d')  
**Review Date**: $(date -d '+3 months' '+%Y-%m-%d')