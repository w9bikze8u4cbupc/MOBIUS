# Deployment Operations Guide

This guide provides detailed instructions for operators managing the dhash guarded rollout system.

## Table of Contents

- [Quick Reference](#quick-reference)
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Deployment Process](#deployment-process)
- [Monitoring & Quality Gates](#monitoring--quality-gates)
- [Emergency Procedures](#emergency-procedures)
- [Troubleshooting](#troubleshooting)
- [Post-Incident Procedures](#post-incident-procedures)
- [Cross-Platform Considerations](#cross-platform-considerations)

## Quick Reference

### Essential Commands

```bash
# Find latest backup
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)

# Verify backup
sha256sum -c "${LATEST_BACKUP}.sha256"

# Emergency rollback
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force

# Check deployment status
./scripts/smoke_tests.sh --env production --post-deploy
```

### Emergency Contacts

- **On-call Engineer**: Primary incident response
- **Deploy Operators (@ops)**: Deployment authorization and execution
- **Media Engineering (@media-eng)**: Golden validation and media QA
- **Triage Lead/SRE**: Rollback decisions and incident management

## Pre-Deployment Checklist

### Automated Checks (via CI)

✅ **Pre-merge workflow passed** (`.github/workflows/premerge.yml`)
- [ ] All smoke tests passed
- [ ] Backup creation and verification tested
- [ ] Deploy/migrate dry-runs successful
- [ ] Cross-platform compatibility verified
- [ ] Quality gates configuration validated

✅ **Artifacts Available**
- [ ] `premerge_artifacts/` bundle uploaded
- [ ] `backups/*.zip` and corresponding `.sha256` files
- [ ] CI run links for Ubuntu, macOS, Windows
- [ ] Deploy/migration dry-run logs
- [ ] Smoke test and logging validation logs

### Manual Operator Checks

✅ **Branch Protection**
- [ ] Require CI status contexts: `premerge-validation`, `cross-platform-check`
- [ ] Require 2 approvals minimum (at least 1 from Ops/SRE team)
- [ ] No bypass permissions enabled

✅ **Environment Readiness**
- [ ] Production environment health verified
- [ ] No ongoing incidents or maintenance
- [ ] Sufficient disk space for backups and logs
- [ ] Network connectivity to webhook endpoints confirmed

✅ **Backup Verification**
```bash
# Verify latest backup exists and is valid
LATEST_BACKUP=$(ls -1 backups/dhash_production_*.zip 2>/dev/null | sort -r | head -n1)
if [[ -n "$LATEST_BACKUP" && -f "${LATEST_BACKUP}.sha256" ]]; then
    sha256sum -c "${LATEST_BACKUP}.sha256" && echo "✅ Backup verified" || echo "❌ Backup verification failed"
else
    echo "❌ No valid backup found"
fi
```

## Deployment Process

### Step 1: Pre-Deployment Backup

```bash
# Create production backup
./scripts/backup_dhash.sh --env production

# Verify backup was created successfully
LATEST_BACKUP=$(ls -1 backups/dhash_production_*.zip | sort -r | head -n1)
echo "Latest backup: $LATEST_BACKUP"
sha256sum -c "${LATEST_BACKUP}.sha256"
```

### Step 2: Execute Deployment

```bash
# Deploy dhash component
./scripts/deploy_dhash.sh --env production

# Monitor deployment logs for errors
tail -f logs/deploy_*.log
```

**Expected Output:**
- Dependencies installed successfully
- dhash component built without errors
- Health check passes
- Monitoring starts automatically

### Step 3: Migration (if required)

```bash
# Run forward migration
./scripts/migrate_dhash.sh --env production --type forward

# Verify migration state
cat migrations/production_migration_state.json
```

### Step 4: Post-Deployment Verification

```bash
# Run comprehensive smoke tests
./scripts/smoke_tests.sh --env production --post-deploy

# Expected: All tests pass with ✅ status
```

## Monitoring & Quality Gates

### Automatic Monitoring

The monitoring system runs automatically for **60 minutes** after deployment with these phases:

1. **Initial Period (0-5 min)**: 30-second polling intervals
2. **Regular Period (5-60 min)**: 2-minute polling intervals

### Quality Gate Thresholds (Production)

| Gate | Threshold | Window | Action |
|------|-----------|---------|---------|
| Health failures | >2 consecutive | 5 min | Auto-rollback |
| Extraction failure rate | >5% | 10 min | Auto-rollback |
| P95 hash time | >2000ms | 15 min | Auto-rollback |
| Low-confidence queue | >1000 items | Instant | Auto-rollback |

### Manual Monitoring Commands

```bash
# Check current queue sizes
find data/production -name "*.queue" -exec wc -l {} \;

# Monitor logs for errors
tail -f logs/dhash_production_*.log | grep -E "(ERROR|CRITICAL)"

# Check hash performance metrics
grep "hash_time" logs/monitor_*.log | tail -20
```

### Quality Gate Tuning

**When to tune** (wait 24-72 hours for baseline data):
- False positive auto-rollbacks occurring
- Load patterns have changed significantly
- Infrastructure capacity has changed

**How to tune:**
1. Analyze historical data in `logs/monitor_*.log`
2. Identify patterns in false positives/negatives
3. Adjust thresholds in `quality-gates-config.json`
4. Test changes in staging first
5. Document rationale for changes

## Emergency Procedures

### Auto-Rollback Triggered

When the monitoring system detects a quality gate violation:

1. **Immediate (auto-rollback triggered)**
   - Critical notifications sent to all channels
   - Rollback script executes automatically
   - Incident created in tracking system

2. **Operator Actions (within 5 minutes)**
   ```bash
   # Verify rollback completed successfully
   ./scripts/smoke_tests.sh --env production --post-rollback
   
   # Check rollback logs
   tail -50 logs/rollback_*.log
   
   # Verify services are healthy
   # Requires 3 consecutive OK health checks
   ```

3. **Root Cause Analysis (within 15 minutes)**
   - Review monitoring logs: `logs/monitor_*.log`
   - Identify which quality gate triggered rollback
   - Check system resources and external dependencies
   - Brief stakeholders on status

### Manual Rollback

If you need to manually trigger a rollback:

```bash
# Emergency rollback (production)
LATEST_BACKUP=$(ls -1 backups/dhash_production_*.zip | sort -r | head -n1)
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force

# Monitor rollback progress
tail -f logs/rollback_*.log

# Verify rollback success (requires 3 consecutive OK checks)
./scripts/smoke_tests.sh --env production --post-rollback
```

### Monitoring System Failure

If the monitoring system itself fails:

1. **Switch to Manual Monitoring**
   ```bash
   # Manual health checks every 2 minutes
   while true; do
       echo "$(date): Checking health..."
       ./scripts/smoke_tests.sh --env production --post-deploy --output logs/manual_monitoring.log
       sleep 120
   done
   ```

2. **Restore Monitoring System**
   ```bash
   # Restart monitoring
   pkill -f "monitor_dhash.js" || true
   nohup node scripts/monitor_dhash.js --env production > logs/monitor_recovery.log 2>&1 &
   ```

## Troubleshooting

### Common Issues

#### 1. Backup Creation Fails

**Symptoms:**
- `backup_dhash.sh` exits with error
- Missing `.sha256` files

**Solutions:**
```bash
# Check disk space
df -h

# Verify write permissions
ls -la backups/

# Manual backup creation
mkdir -p backups
tar -czf "backups/dhash_production_manual_$(date +%Y%m%d_%H%M%S).tar.gz" src config deployments
```

#### 2. Deployment Health Check Fails

**Symptoms:**
- Deploy script reports health check failure
- Services not responding

**Solutions:**
```bash
# Check process status
pgrep -f dhash || echo "No dhash processes running"

# Check system resources
free -h
df -h

# Review deployment logs
grep -i error logs/deploy_*.log

# Manual service restart
# (Add service restart commands here)
```

#### 3. Quality Gate False Positives

**Symptoms:**
- Auto-rollbacks triggering unnecessarily
- Monitoring shows intermittent threshold breaches

**Solutions:**
1. **Immediate**: Review `quality-gates-config.json` thresholds
2. **Short-term**: Increase thresholds by 20% in staging, test, then apply to production
3. **Long-term**: Analyze 7-day performance trends and establish new baselines

#### 4. Notification Failures

**Symptoms:**
- No notifications received during deployment/rollback
- Webhook timeouts in logs

**Solutions:**
```bash
# Test notification system
node scripts/notify.js --type test --env production --message "Test notification" --dry-run

# Check webhook URLs are accessible
curl -I "$SLACK_WEBHOOK_URL"

# Review fallback notifications
ls -la notifications/fallback/
```

### Network/Firewall Issues

If CI runners cannot reach webhook endpoints:

1. **For CI Tests**: Use `--dry-run` flag for all notification tests
2. **For Production**: Configure send-only proxy or NAT allowlist for webhook destinations
3. **Fallback**: All notifications are logged to `notifications/fallback/` for audit trail

### Cross-Platform Debugging

#### Windows-Specific Issues

```powershell
# Check Python availability
python --version

# Test PowerShell execution policy
Get-ExecutionPolicy

# Run scripts with explicit permissions
powershell -ExecutionPolicy Bypass -File scripts/capture_provenance.ps1
```

#### macOS-Specific Issues

```bash
# Check Homebrew installations
brew list | grep -E "(ffmpeg|python|node)"

# Test SHA256 utility
shasum -a 256 --help

# Check file permissions
ls -la scripts/*.sh
```

#### Linux Package Dependencies

```bash
# Install missing packages
sudo apt-get update
sudo apt-get install -y ffmpeg python3 nodejs npm jq bc

# CentOS/RHEL
sudo yum install -y ffmpeg python3 nodejs npm jq bc
```

## Post-Incident Procedures

### Incident Documentation

After any rollback or emergency procedure:

1. **Preserve Evidence**
   ```bash
   # Archive incident logs
   INCIDENT_ID="INC-$(date +%Y%m%d-%H%M%S)"
   mkdir -p incidents/$INCIDENT_ID
   cp -r logs/ incidents/$INCIDENT_ID/
   cp quality-gates-config.json incidents/$INCIDENT_ID/
   ```

2. **Generate Incident Report**
   - Timeline of events
   - Quality gate violations detected
   - Actions taken and their outcomes
   - Root cause analysis
   - Preventive measures

3. **Update Runbooks**
   - Document new failure modes discovered
   - Update threshold recommendations
   - Add new troubleshooting procedures

### Post-Rollback Recovery

After a successful rollback:

1. **Verify System Stability** (monitor for 30 minutes)
   ```bash
   # Extended monitoring after rollback
   timeout 1800 node scripts/monitor_dhash.js --env production --duration 30
   ```

2. **Plan Remediation**
   - Identify fix for original issue
   - Test fix in staging environment
   - Schedule re-deployment when ready

3. **Update Monitoring**
   - Adjust quality gates if needed
   - Add new metrics if gaps identified
   - Update alerting thresholds

### Lessons Learned Session

Schedule within 48 hours of incident:

- **Attendees**: Deploy operators, SRE, development team
- **Agenda**: 
  - What went well?
  - What could be improved?
  - Action items for prevention
- **Deliverables**:
  - Updated procedures
  - Quality gate adjustments
  - Training updates

---

## Appendix: Configuration Files

### Key Configuration Files

- `quality-gates-config.json`: Quality gate thresholds and monitoring settings
- `config/{env}/dhash.json`: Environment-specific dhash configuration
- `migrations/{env}_migration_state.json`: Migration tracking
- `.github/workflows/premerge.yml`: Pre-merge validation workflow

### Log File Locations

- `logs/deploy_*.log`: Deployment execution logs
- `logs/monitor_*.log`: Quality gate monitoring logs
- `logs/rollback_*.log`: Rollback execution logs
- `logs/smoke_test_*.log`: Smoke test results
- `notifications/fallback/`: Notification audit trail

### Backup Locations

- `backups/dhash_{env}_{timestamp}.zip`: Component backups
- `backups/dhash_{env}_{timestamp}.zip.sha256`: Backup checksums
- `rollbacks/pre_rollback_{env}_{timestamp}.tar.gz`: Pre-rollback state archives

---

**Last Updated:** Generated with dhash guarded rollout system
**Version:** 1.0.0
**Contact:** ops@mobius-games.com for questions or updates