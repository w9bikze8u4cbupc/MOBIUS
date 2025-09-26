# MOBIUS Deployment Runbook

## Overview

This runbook provides step-by-step procedures for deploying MOBIUS with the deployment readiness framework. It covers the complete deployment lifecycle from pre-merge validation to post-deployment monitoring.

## Pre-Deployment Checklist

### 1. Pre-Merge Gates ✅

All of the following must pass before merge approval:

- [ ] **Branch Protection**: PR has required approvals (≥2, including ≥1 Ops/SRE)
- [ ] **CI Validation**: Pre-merge validation workflow passed on all platforms (Ubuntu, macOS, Windows)
- [ ] **Backup Created**: SHA256-verified backup generated and uploaded
- [ ] **Deploy Dry Run**: Deployment dry-run completed successfully
- [ ] **Migration Dry Run**: Database migration dry-run validated
- [ ] **Golden Tests**: All golden tests passing (if applicable)
- [ ] **Security Scan**: No critical vulnerabilities detected
- [ ] **Deploy Operator Sign-off**: @ops team member has approved for deployment

### 2. Artifact Verification 📦

Before proceeding with deployment, verify all required artifacts:

```bash
# Download and verify backup
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"

# Verify artifact bundle exists
ls -la premerge_artifacts.zip
sha256sum -c premerge_artifacts.zip.sha256
```

## Deployment Procedure

### Phase 1: Pre-Deployment (T-15 minutes)

1. **Create Production Backup**
   ```bash
   DEPLOY_ENV=production ./scripts/deploy/backup.sh
   ```

2. **Run Final Dry Run**
   ```bash
   DEPLOY_ENV=production ./scripts/deploy/deploy_dryrun.sh
   ```

3. **Validate Rollback Readiness**
   ```bash
   ./scripts/deploy/rollback_dhash.sh --help
   LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
   echo "Rollback ready with: $LATEST_BACKUP"
   ```

### Phase 2: Deployment Execution (T-0)

1. **Merge with Rebase-and-Merge**
   - Use GitHub "Rebase and merge" option
   - Ensure all pre-merge gates have passed
   - Confirm deploy operator approval is present

2. **Start Post-Deploy Monitoring**
   ```bash
   # Start 60-minute monitoring window
   MONITOR_DURATION=3600 AUTO_ROLLBACK=true ./scripts/deploy/monitor.sh &
   MONITOR_PID=$!
   echo "Monitoring started with PID: $MONITOR_PID"
   ```

3. **Execute Deployment** (Platform-specific commands)
   ```bash
   # Your deployment commands here
   # This could be:
   # - Docker container deployment
   # - Process restart
   # - Service update
   # - etc.
   ```

### Phase 3: Post-Deployment Validation (T+5 minutes)

1. **Run Smoke Tests**
   ```bash
   SMOKE_TEST_LOG=./logs/postdeploy-smoketests.log ./scripts/deploy/smoke_tests.sh
   ```

2. **Verify Health Endpoints**
   ```bash
   curl -f http://localhost:5001/health
   curl -f http://localhost:3000/
   ```

3. **Check Process Status**
   ```bash
   pgrep -f "node" | wc -l
   ps aux | grep node
   ```

## Monitoring Phase (T+0 to T+60)

The monitoring script automatically tracks:

- **Consecutive Health Failures**: Auto-rollback after 3 consecutive failures
- **Response Latency**: Alert if P95 > 5000ms
- **Error Rate**: Monitor for error rate > 5%
- **Queue Growth**: Watch for low-confidence queue growth > 100 items

### Manual Health Checks

Every 15 minutes during monitoring window:

```bash
# Check application health
curl -s http://localhost:5001/health | jq .

# Check system resources
free -h
df -h
top -n1 | head -10

# Check application logs
tail -50 logs/app.log
```

## Rollback Procedures

### Automatic Rollback

The monitoring script will automatically trigger rollback if:
- 3 consecutive health check failures
- Success rate drops below 70% (after 5+ checks)

### Manual Rollback Decision

Trigger manual rollback if:
- Critical bugs discovered
- Performance degradation beyond acceptable limits
- User-reported issues affecting core functionality

### Rollback Execution

```bash
# Identify latest verified backup
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"

# Execute rollback
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force

# Verify rollback success
sleep 30
./scripts/deploy/smoke_tests.sh

# Require 3 consecutive OK health checks
for i in {1..3}; do
  echo "Health check $i/3:"
  curl -f http://localhost:5001/health && echo " ✅" || echo " ❌"
  sleep 10
done
```

## Post-Rollback Procedures

After successful rollback:

1. **Document the Incident**
   - Create incident report
   - Identify root cause
   - Plan remediation steps

2. **Notify Stakeholders**
   - Use notification templates
   - Update status pages
   - Communicate timeline for fix

3. **Plan Recovery**
   - Fix identified issues
   - Re-run full pre-merge validation
   - Schedule new deployment attempt

## Emergency Contacts

- **Deploy Operator**: @ops team
- **On-Call Engineer**: [Escalation procedure]
- **Product Owner**: [Contact information]
- **DevOps Lead**: [Contact information]

## Troubleshooting

### Common Issues

1. **Backup Verification Fails**
   ```bash
   # Check backup integrity
   file "$LATEST_BACKUP"
   unzip -t "$LATEST_BACKUP"
   ```

2. **Health Checks Failing**
   ```bash
   # Check application logs
   tail -100 logs/app.log
   
   # Check system resources
   df -h
   free -h
   
   # Check process status
   systemctl status [your-service] # or equivalent
   ```

3. **Monitoring Script Issues**
   ```bash
   # Check monitoring logs
   tail -50 logs/monitor_logs/monitor_*.log
   
   # Restart monitoring if needed
   kill $MONITOR_PID
   ./scripts/deploy/monitor.sh &
   ```

### Escalation Paths

1. **Level 1**: Deploy operator attempts resolution (15 minutes)
2. **Level 2**: On-call engineer involved (30 minutes)
3. **Level 3**: DevOps lead and product owner notified (45 minutes)
4. **Level 4**: Full incident response team activated (60 minutes)

## Appendix

### Script Locations
- Backup: `./scripts/deploy/backup.sh`
- Rollback: `./scripts/deploy/rollback_dhash.sh`
- Smoke Tests: `./scripts/deploy/smoke_tests.sh`
- Monitoring: `./scripts/deploy/monitor.sh`
- Pre-merge Orchestration: `./scripts/deploy/premerge_orchestration.sh`

### Log Locations
- Pre-merge: `./logs/premerge_orchestration.log`
- Deploy Dry Run: `./logs/deploy-dryrun.log`
- Migration Dry Run: `./logs/migrate-dryrun.log`
- Smoke Tests: `./logs/postdeploy-smoketests.log`
- Monitoring: `./logs/monitor_logs/`

### Artifact Locations
- Backups: `./backups/`
- Pre-merge Artifacts: `./premerge_artifacts/`
- Golden Reports: `./tests/golden/reports/`