# MOBIUS Deployment Runbook

## Overview

This runbook provides step-by-step procedures for deploying MOBIUS using the deployment readiness framework. It covers pre-deployment validation, guarded rollout execution, monitoring, and post-deployment verification.

## Pre-requisites

- [ ] All pre-merge validation checks have passed
- [ ] Required approvals obtained (≥2 reviewers, ≥1 Ops/SRE)
- [ ] Deploy operator sign-off received
- [ ] Backup files available and verified
- [ ] Maintenance window scheduled (if production)

## Deployment Process

### Phase 1: Pre-deployment Validation

#### 1.1 Verify Branch and Merge Status
```bash
# Confirm we're on the correct branch
git status
git log -1 --oneline

# Ensure rebase-and-merge was used
git log --graph --oneline -5
```

#### 1.2 Verify Backup Integrity
```bash
# Navigate to backups directory
cd backups

# Find latest backup
LATEST_BACKUP=$(ls -1 dhash_*.zip | sort -r | head -n1)
echo "Using backup: $LATEST_BACKUP"

# Verify backup integrity
sha256sum -c "${LATEST_BACKUP}.sha256"
```

#### 1.3 Confirm Environment Readiness
```bash
# Set environment variables
export ENV=production  # or staging
export API_BASE_URL=https://your-api-domain.com  # adjust as needed

# Verify environment configuration
echo "Environment: $ENV"
echo "API URL: $API_BASE_URL"
```

### Phase 2: Deployment Execution

#### 2.1 Final Pre-deployment Checks
```bash
# Run comprehensive pre-deployment validation
./scripts/deploy/premerge_orchestration.sh --env $ENV

# Verify orchestration passed
echo "Exit code: $?"
```

#### 2.2 Execute Deployment

**⚠️ CRITICAL: Follow these steps exactly**

```bash
# Step 1: Create emergency backup
./scripts/deploy/backup_dhash.sh --env $ENV

# Step 2: Execute deployment (replace with your actual deployment commands)
# This is a placeholder - replace with your actual deployment process

# For Node.js applications, typically:
npm ci --production
npm run build --if-present

# For containerized deployments:
# docker build -t mobius:latest .
# docker stop mobius-app
# docker run -d --name mobius-app mobius:latest

# Step 3: Restart services (if applicable)
# systemctl restart mobius-app
# or
# pm2 restart mobius-app
```

#### 2.3 Post-deployment Verification
```bash
# Wait for services to stabilize
sleep 30

# Run smoke tests
./scripts/deploy/smoke_tests.sh --env $ENV --api-url $API_BASE_URL

# Verify smoke tests passed
echo "Smoke test exit code: $?"
```

### Phase 3: Monitoring and Health Validation

#### 3.1 Start Monitoring
```bash
# Start 60-minute monitoring with auto-rollback
MONITOR_DURATION=3600 AUTO_ROLLBACK=true ./scripts/deploy/monitor.sh --env $ENV --api-url $API_BASE_URL &
MONITOR_PID=$!

echo "Monitoring started with PID: $MONITOR_PID"
echo "Monitor logs will be available in: monitor_logs/"
```

#### 3.2 Manual Health Checks

**Complete these checks within the first 10 minutes:**

1. **API Health Check**
```bash
curl -f $API_BASE_URL/health
# Expected: HTTP 200 OK
```

2. **Core Functionality Check**
```bash
# Test primary endpoints
curl -f $API_BASE_URL/
# Expected: HTTP 200 OK

# Test API endpoints (if applicable)
curl -f $API_BASE_URL/api/status
# Expected: HTTP 200 or appropriate response
```

3. **Performance Check**
```bash
# Measure response time
time curl -s $API_BASE_URL/health
# Expected: < 2 seconds
```

4. **Log Check**
```bash
# Check application logs for errors
# Adjust log path as needed
tail -n 50 /var/log/mobius/app.log | grep -i error
# Expected: No new critical errors
```

### Phase 4: Deployment Verification

#### 4.1 Functional Testing

Perform these manual tests:

- [ ] **Game Tutorial Generation**: Verify core functionality works
- [ ] **Video Processing**: Test video rendering capabilities  
- [ ] **File Operations**: Test file upload/download
- [ ] **API Endpoints**: Test critical API functions
- [ ] **Frontend**: Verify client application loads correctly

#### 4.2 Performance Validation

- [ ] **Response Times**: All endpoints respond within expected timeframes
- [ ] **Resource Usage**: CPU/Memory usage within normal ranges
- [ ] **Error Rates**: No unexpected increase in error rates

#### 4.3 Integration Testing

- [ ] **External Services**: Verify connections to external dependencies
- [ ] **Database**: Confirm database operations work correctly
- [ ] **File System**: Verify file operations and permissions

## Monitoring Thresholds

The automatic monitoring system will trigger rollback if:

- **3 consecutive health check failures**
- **Overall success rate < 70%** after ≥5 checks
- **p95 latency > 5000ms** consistently
- **Error rate > 5%**

## Success Criteria

Deployment is considered successful when:

- [ ] All smoke tests pass for 3 consecutive runs
- [ ] Health monitoring shows stable performance for 60 minutes
- [ ] Manual functional testing complete
- [ ] No critical errors in application logs
- [ ] Performance metrics within expected ranges
- [ ] Auto-rollback monitoring completes without triggering

## Completion Steps

### 1. Stop Monitoring (if successful)
```bash
# If monitoring is still running and successful
kill $MONITOR_PID 2>/dev/null || true
echo "Monitoring stopped successfully"
```

### 2. Final Validation
```bash
# Run final smoke test suite
./scripts/deploy/smoke_tests.sh --env $ENV --api-url $API_BASE_URL

# Generate deployment completion report
./scripts/deploy/lcm_export.sh --env $ENV --export-dir ./deployment_reports
```

### 3. Stakeholder Notification

Send deployment completion notification including:
- Deployment timestamp
- Environment deployed to
- Git commit/branch information
- Monitoring results summary
- Next scheduled maintenance window

### 4. Documentation Updates

- [ ] Update deployment log with completion details
- [ ] Document any issues encountered and resolutions
- [ ] Update monitoring baselines if needed
- [ ] Record lessons learned

## Emergency Contacts

| Role | Contact | Escalation Time |
|------|---------|-----------------|
| Deploy Operator | @ops | Immediate |
| SRE On-call | @sre-oncall | 15 minutes |
| Engineering Lead | @eng-lead | 30 minutes |
| Product Owner | @product | 1 hour |

## Related Documentation

- [Rollback Runbook](./rollback_runbook.md)
- [Monitoring Guide](../monitoring/README.md)
- [Incident Response](../incident-response/README.md)

---

**Document Version**: 1.0  
**Last Updated**: $(date '+%Y-%m-%d')  
**Review Date**: $(date -d '+3 months' '+%Y-%m-%d')