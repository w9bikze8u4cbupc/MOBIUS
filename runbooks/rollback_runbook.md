# MOBIUS Rollback Runbook

## Overview

This runbook provides detailed procedures for rolling back MOBIUS deployments when issues are detected. It covers both automatic rollback scenarios and manual rollback execution.

## When to Rollback

### Automatic Rollback Triggers

The monitoring system will automatically trigger rollback when:

- **Consecutive Failures**: 3 consecutive health check failures
- **Low Success Rate**: Overall success rate drops below 70% (after 5+ checks)
- **High Latency**: P95 response time exceeds 5000ms consistently
- **High Error Rate**: Error rate exceeds 5%

### Manual Rollback Indicators

Consider manual rollback when:

- Critical functionality is broken
- Data integrity issues are detected
- Performance degradation affects user experience
- Security vulnerabilities are discovered
- User reports indicate major issues

## Rollback Decision Matrix

| Severity | Impact | Action | Timeline |
|----------|---------|---------|----------|
| Critical | System down | Immediate rollback | < 5 minutes |
| High | Core features broken | Quick rollback | < 15 minutes |
| Medium | Some features affected | Evaluate and decide | < 30 minutes |
| Low | Minor issues | Monitor and fix forward | > 30 minutes |

## Pre-Rollback Checklist

### 1. Situation Assessment

- [ ] **Identify the Issue**: Document what is failing
- [ ] **Check Monitoring**: Review monitoring logs and metrics
- [ ] **Verify Impact**: Assess user impact and scope
- [ ] **Review Timeline**: How long has the issue persisted?

### 2. Rollback Readiness

- [ ] **Backup Verification**: Confirm latest backup integrity
- [ ] **Rollback Path**: Verify rollback script is available
- [ ] **Team Notification**: Alert relevant stakeholders
- [ ] **Communication Plan**: Prepare user communication

## Rollback Execution

### Step 1: Backup Verification

```bash
# Find latest backup
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
echo "Latest backup: $LATEST_BACKUP"

# Verify backup integrity
sha256sum -c "${LATEST_BACKUP}.sha256"

# Check backup contents (optional)
unzip -l "$LATEST_BACKUP" | head -20
```

### Step 2: Stop Monitoring (if running)

```bash
# Find monitoring process
ps aux | grep monitor.sh

# Stop monitoring to prevent conflicts
pkill -f monitor.sh

# Or stop specific monitoring PID if known
# kill $MONITOR_PID
```

### Step 3: Execute Rollback

```bash
# Perform rollback with verified backup
./scripts/deploy/rollback_dhash.sh \
  --backup "$LATEST_BACKUP" \
  --env production \
  --force

# Monitor rollback progress
tail -f logs/rollback.log
```

### Step 4: Post-Rollback Validation

```bash
# Wait for services to stabilize
sleep 60

# Run smoke tests
./scripts/deploy/smoke_tests.sh

# Verify health endpoints
curl -f http://localhost:5001/health
curl -f http://localhost:3000/

# Check critical functionality
# [Add your specific checks here]
```

### Step 5: Health Check Verification

Perform 3 consecutive health checks with 30-second intervals:

```bash
for i in {1..3}; do
  echo "=== Health Check $i/3 ==="
  
  # API health
  if curl -f -s http://localhost:5001/health > /dev/null; then
    echo "✅ API: Healthy"
  else
    echo "❌ API: Failed"
  fi
  
  # Frontend health
  if curl -f -s http://localhost:3000/ > /dev/null; then
    echo "✅ Frontend: Healthy"
  else
    echo "❌ Frontend: Failed"
  fi
  
  # Process check
  NODE_COUNT=$(pgrep -f "node" | wc -l)
  echo "ℹ️ Node processes: $NODE_COUNT"
  
  if [ $i -lt 3 ]; then
    echo "Waiting 30 seconds..."
    sleep 30
  fi
  
  echo ""
done
```

## Post-Rollback Actions

### 1. System Monitoring

Resume monitoring with reduced interval for 2 hours:

```bash
# Start intensive monitoring
MONITOR_DURATION=7200 CHECK_INTERVAL=30 AUTO_ROLLBACK=false ./scripts/deploy/monitor.sh &
```

### 2. Stakeholder Communication

Use notification templates to inform:
- Development team
- Operations team
- Product stakeholders
- End users (if necessary)

### 3. Incident Documentation

Create incident report with:
- Timeline of events
- Root cause analysis
- Impact assessment
- Lessons learned
- Prevention measures

## Rollback Scenarios

### Scenario 1: Database Migration Issues

```bash
# If migration caused issues, may need manual DB rollback
# [Add database-specific rollback procedures]

# Then proceed with application rollback
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

### Scenario 2: Configuration Issues

```bash
# Rollback application
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production

# Verify configuration restored
diff -u .env.example .env || echo "Check environment configuration"
```

### Scenario 3: Dependency Issues

```bash
# Rollback will restore package-lock.json
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production

# Verify dependencies after rollback
npm ci
npm list --depth=0
```

## Troubleshooting Rollback Issues

### Rollback Script Fails

```bash
# Check rollback script permissions
ls -la ./scripts/deploy/rollback_dhash.sh

# Check backup file accessibility
ls -la "$LATEST_BACKUP"
file "$LATEST_BACKUP"

# Manual rollback steps
mkdir -p ./manual_rollback
unzip "$LATEST_BACKUP" -d ./manual_rollback
# [Proceed with manual file restoration]
```

### Services Won't Start After Rollback

```bash
# Check for port conflicts
lsof -i :5001
lsof -i :3000

# Check file permissions
ls -la src/
ls -la client/

# Check system resources
free -h
df -h

# Check error logs
tail -100 logs/app.log
```

### Health Checks Still Failing

```bash
# Check if services are actually running
ps aux | grep node

# Check listening ports
netstat -tlnp | grep :5001
netstat -tlnp | grep :3000

# Test individual components
curl -v http://localhost:5001/health
curl -v http://localhost:3000/

# Check system logs
journalctl -u [your-service] -n 50  # If using systemd
```

## Recovery Planning

After successful rollback:

### 1. Root Cause Analysis

- Review deployment changes
- Analyze error logs
- Identify failure points
- Document findings

### 2. Fix Development

- Create hotfix branch
- Implement fixes
- Add additional tests
- Update monitoring

### 3. Re-deployment Planning

- Full pre-merge validation
- Staging environment testing
- Gradual rollout strategy
- Enhanced monitoring

## Emergency Escalation

### Immediate Escalation (< 5 minutes)
- Rollback fails to execute
- System completely unresponsive
- Data corruption suspected

### Standard Escalation (< 15 minutes)
- Rollback completes but health checks fail
- Partial service restoration
- User-facing errors persist

### Contact Information

- **On-Call Engineer**: [Escalation procedure]
- **Database Admin**: [For DB-related rollbacks]
- **DevOps Lead**: [For infrastructure issues]
- **Security Team**: [For security-related rollbacks]

## Rollback Success Criteria

A rollback is considered successful when:

- [ ] All services are running
- [ ] Health endpoints return 200 OK
- [ ] 3 consecutive successful health checks
- [ ] Smoke tests pass completely
- [ ] No error spikes in logs
- [ ] User-facing functionality restored
- [ ] Performance metrics within normal range

## Prevention Measures

To reduce future rollback needs:

1. **Enhanced Testing**
   - More comprehensive integration tests
   - Load testing in staging
   - Chaos engineering practices

2. **Deployment Improvements**
   - Canary deployments
   - Feature flags
   - Blue-green deployments

3. **Monitoring Enhancements**
   - Real-time alerting
   - User experience monitoring
   - Business metric tracking

4. **Process Improvements**
   - Extended staging testing
   - Peer review requirements
   - Deployment time restrictions