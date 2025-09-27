# DHash Deployment Operations Guide

This guide provides comprehensive operational procedures for the DHash guarded rollout system.

## Table of Contents

1. [Pre-Deployment Procedures](#pre-deployment-procedures)
2. [Deployment Execution](#deployment-execution)
3. [Monitoring and Quality Gates](#monitoring-and-quality-gates)
4. [Rollback Procedures](#rollback-procedures)
5. [Troubleshooting](#troubleshooting)
6. [Emergency Response](#emergency-response)
7. [Post-Deployment Tasks](#post-deployment-tasks)

## Pre-Deployment Procedures

### 1. Pre-Deployment Checklist

**Required before any production deployment:**

```bash
# 1. Verify CI/CD pipeline status
# Check that all pre-merge validations have passed

# 2. Create and verify backup
./scripts/backup_dhash.sh --env production
LATEST_BACKUP=$(ls -1 backups/dhash_production_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"

# 3. Test deployment scripts (dry-run)
./scripts/deploy_dhash.sh --env production --dry-run
./scripts/migrate_dhash.sh --env production --dry-run

# 4. Verify notification system
node scripts/notify.js --type deploy --env production --message "Pre-deployment test" --dry-run

# 5. Check monitoring configuration
node scripts/monitor_dhash.js --env production --dry-run

# 6. Validate quality gates configuration
node -e "console.log(JSON.stringify(require('./quality-gates-config.json').environments.production, null, 2))"
```

### 2. Environment Preparation

**Production environment setup:**

```bash
# Verify environment variables
echo "WEBHOOK_URL: ${WEBHOOK_URL:-(not set)}"
echo "DEPLOYMENT_ID: ${DEPLOYMENT_ID:-$(date +%s)}"
echo "COMMIT_SHA: ${COMMIT_SHA:-$(git rev-parse HEAD)}"

# Check disk space for backups
df -h backups/

# Verify service health before deployment
./scripts/smoke_tests.sh --env production --tier critical
```

### 3. Maintenance Window Planning

**For production deployments:**

- Schedule maintenance window (typically 2-3 hours)
- Notify stakeholders via established channels
- Prepare rollback plan and communication templates
- Ensure SRE on-call coverage during deployment + 4 hours post-deployment

## Deployment Execution

### 1. Standard Production Deployment

```bash
# Execute full production deployment
./quick-deploy.sh production

# Alternative: Step-by-step deployment
./scripts/backup_dhash.sh --env production
./scripts/deploy_dhash.sh --env production --backup-first
# (Monitoring starts automatically)
```

### 2. Staging Deployment

```bash
# Standard staging deployment
./quick-deploy.sh staging

# Staging with full monitoring (production-like)
./scripts/deploy_dhash.sh --env staging --backup-first
```

### 3. Monitoring Deployment Progress

**Real-time monitoring during deployment:**

```bash
# Watch deployment logs
tail -f deploy_production_*.log

# Monitor system health
watch -n 30 './scripts/smoke_tests.sh --env production --tier critical'

# Check monitoring status
tail -f monitor_production_*.log
```

## Monitoring and Quality Gates

### 1. Post-Deployment Monitoring

**The monitoring system automatically:**
- Runs for 60 minutes post-deployment
- Uses adaptive polling (30s initial, 120s regular)
- Checks quality gates every interval
- Triggers automatic rollback on violations

**Manual monitoring commands:**

```bash
# Check current monitoring status
ps aux | grep monitor_dhash

# View monitoring logs
ls -la monitor_production_*.log
tail -f monitor_production_*.log

# Manual health check
./scripts/smoke_tests.sh --env production --tier all
```

### 2. Quality Gate Configuration

**Current production thresholds:**

| Quality Gate | Threshold | Window | Action |
|--------------|-----------|--------|--------|
| Health failures | >2 consecutive | Immediate | Auto-rollback |
| Extraction failure rate | >5% | 10 minutes | Auto-rollback |
| P95 hash time | >2000ms | 15 minutes | Auto-rollback |
| Queue length | >1000 items | Immediate | Auto-rollback |

**Adjusting thresholds:**

```bash
# Edit configuration
vim quality-gates-config.json

# Validate changes
node -e "JSON.parse(require('fs').readFileSync('quality-gates-config.json', 'utf8'))"

# Apply changes (restart monitoring)
pkill -f monitor_dhash
node scripts/monitor_dhash.js --env production &
```

### 3. Manual Quality Gate Override

**If monitoring detects false positives:**

```bash
# Stop automatic monitoring
pkill -f monitor_dhash

# Perform manual validation
./scripts/smoke_tests.sh --env production --tier all
./scripts/validate_logging.js --env production

# Document override decision
echo "Quality gate override: $(date) - Reason: [description]" >> deployment_overrides.log
```

## Rollback Procedures

### 1. Automatic Rollback

**The system automatically triggers rollback when:**
- Quality gates are violated
- Consecutive health check failures exceed threshold
- Critical service metrics degrade

**Automatic rollback process:**
1. System detects quality gate violation
2. Sends critical alert notification
3. Locates latest backup
4. Verifies backup integrity
5. Executes rollback script
6. Validates post-rollback state
7. Sends rollback completion notification

### 2. Manual Emergency Rollback

**When immediate rollback is required:**

```bash
# Step 1: Find and verify latest backup
LATEST_BACKUP=$(ls -1 backups/dhash_production_*.zip | sort -r | head -n1)
echo "Using backup: $LATEST_BACKUP"
sha256sum -c "${LATEST_BACKUP}.sha256"

# Step 2: Execute rollback
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force

# Step 3: Verify rollback success
./scripts/smoke_tests.sh --env production --tier all --post-rollback

# Step 4: Notify stakeholders
node scripts/notify.js --type rollback --env production --message "Manual rollback completed"
```

### 3. Post-Rollback Validation

**Required after any rollback:**

```bash
# 1. Verify service health (3 consecutive OK checks required)
for i in {1..3}; do
  echo "Health check $i/3:"
  ./scripts/smoke_tests.sh --env production --tier critical
  sleep 30
done

# 2. Validate data consistency
./scripts/validate_logging.js --env production

# 3. Check service version
# (Implementation-specific version check)

# 4. Generate rollback report
echo "Rollback Report - $(date)" > rollback_report.txt
echo "Backup used: $LATEST_BACKUP" >> rollback_report.txt
echo "Rollback reason: [to be filled]" >> rollback_report.txt
```

## Troubleshooting

### 1. Common Issues and Solutions

**Backup Creation Failures:**

```bash
# Check disk space
df -h backups/

# Verify permissions
ls -la backups/

# Manual backup with verbose output
./scripts/backup_dhash.sh --env production 2>&1 | tee backup_debug.log

# Alternative backup location
OUTPUT_DIR="/tmp/emergency_backup" ./scripts/backup_dhash.sh --env production
```

**Deployment Script Failures:**

```bash
# Check script permissions
find scripts/ -name "*.sh" ! -executable -exec chmod +x {} \;

# Run with verbose debugging
bash -x ./scripts/deploy_dhash.sh --env production --dry-run

# Check environment variables
env | grep -E "(WEBHOOK|DEPLOYMENT|COMMIT)"

# Validate configuration files
find . -name "*.json" -exec node -e "JSON.parse(require('fs').readFileSync('{}', 'utf8'))" \;
```

**Monitoring System Issues:**

```bash
# Check Node.js availability
node --version

# Test monitoring dependencies
node -e "console.log('Node.js modules OK')"

# Run monitoring with debug output
DEBUG=* node scripts/monitor_dhash.js --env production --dry-run

# Check quality gates configuration
cat quality-gates-config.json | jq '.environments.production'
```

**Notification Failures:**

```bash
# Test notification system
node scripts/notify.js --type deploy --env production --message "Test notification" --dry-run

# Check webhook URL format
echo $WEBHOOK_URL | grep -E "^https?://"

# Verify fallback files
ls -la notification_fallback/

# Test network connectivity
curl -I $WEBHOOK_URL || echo "Webhook unreachable"
```

### 2. Cross-Platform Issues

**Windows-specific:**

```powershell
# Check PowerShell execution policy
Get-ExecutionPolicy

# Set execution policy if needed
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Install dependencies
choco install git nodejs

# Use PowerShell-compatible commands
Get-ChildItem backups\ | Sort-Object Name -Descending | Select-Object -First 1
```

**macOS-specific:**

```bash
# Install dependencies
brew install node bc coreutils

# Use GNU utilities if needed
PATH="/usr/local/opt/coreutils/libexec/gnubin:$PATH"

# Check file permissions
ls -la scripts/
```

**Linux-specific:**

```bash
# Install required packages
sudo apt-get update
sudo apt-get install -y nodejs npm bc zip unzip

# or on RHEL/CentOS
sudo yum install -y nodejs npm bc zip unzip

# Check shell compatibility
bash --version
```

## Emergency Response

### 1. Critical Failure Response

**When automatic rollback fails:**

```bash
# 1. Stop all dhash services immediately
# (Implementation-specific service stop commands)

# 2. Manual database rollback (if needed)
# (Implementation-specific database restore commands)

# 3. Restore from backup manually
cd backups/
EMERGENCY_BACKUP=$(ls -1 dhash_production_*.zip | sort -r | head -n1)
unzip -q "$EMERGENCY_BACKUP" -d /tmp/emergency_restore/
# (Copy files to appropriate locations)

# 4. Notify incident commander
node scripts/notify.js --type error --env production --message "CRITICAL: Manual intervention required"
```

### 2. Incident Communication

**Communication templates:**

```bash
# Initial incident notification
INCIDENT_ID="INC-$(date +%Y%m%d%H%M%S)"
node scripts/deploy/deploy-notify.js --event rollback-start --env production \
  --reason "Critical deployment failure" --incident-id "$INCIDENT_ID"

# Status updates
node scripts/notify.js --type monitoring --env production \
  --message "Incident $INCIDENT_ID: Rollback in progress"

# Resolution notification
node scripts/deploy/deploy-notify.js --event rollback-success --env production \
  --incident-id "$INCIDENT_ID"
```

### 3. Post-Incident Analysis

**Required after any emergency response:**

1. Document incident timeline
2. Analyze failure root cause  
3. Update quality gate thresholds if needed
4. Improve monitoring coverage
5. Update emergency procedures
6. Conduct post-mortem review

## Post-Deployment Tasks

### 1. Deployment Verification

**Complete these tasks within 4 hours of deployment:**

```bash
# 1. Review monitoring results
cat monitor_production_*.log | grep -E "(VIOLATION|ROLLBACK|ERROR)"

# 2. Verify all notifications sent
ls -la notification_fallback/
tail -n 20 notification_fallback/delivery_audit.log

# 3. Generate deployment report
cat > deployment_report.txt << EOF
Deployment Report - $(date)
=========================
Environment: production
Status: SUCCESS/FAILED
Monitoring Duration: 60 minutes
Quality Gate Violations: [count]
Rollbacks Triggered: [count]
Backup Created: $LATEST_BACKUP
EOF

# 4. Archive logs and artifacts
mkdir -p deployment_archives/$(date +%Y%m%d_%H%M%S)/
mv *.log deployment_archives/$(date +%Y%m%d_%H%M%S)/
mv *_report_*.* deployment_archives/$(date +%Y%m%d_%H%M%S)/
```

### 2. Performance Analysis

**Review deployment performance:**

```bash
# Check deployment timing
grep -E "(Starting|completed)" deploy_production_*.log

# Review quality gate metrics
grep -E "(PASS|FAIL|threshold)" monitor_production_*.log

# Analyze smoke test results
cat smoke_test_report_production_*.txt
```

### 3. Documentation Updates

**Update operational documentation:**

1. Record any configuration changes
2. Document new issues encountered
3. Update troubleshooting procedures
4. Review and update quality gate thresholds
5. Update emergency contact information

---

## Escalation Contacts

| Role | Contact | Responsibility |
|------|---------|----------------|
| Deploy Operator | @ops | Deployment execution and monitoring |
| SRE On-Call | @sre-oncall | Emergency response and rollbacks |
| Incident Commander | @incident-lead | Critical incident coordination |
| Media Engineering | @media-eng | Domain expertise and validation |

## Appendix: Script Reference

### Quick Reference Commands

```bash
# Production deployment
./quick-deploy.sh production

# Emergency rollback  
BACKUP=$(ls -1 backups/dhash_production_*.zip | sort -r | head -n1)
./scripts/rollback_dhash.sh --backup "$BACKUP" --env production --force

# Health check
./scripts/smoke_tests.sh --env production --tier critical

# Send notification
node scripts/notify.js --type deploy --env production --message "Message"
```

### Log File Locations

- Deployment logs: `deploy_${environment}_${timestamp}.log`
- Monitoring logs: `monitor_${environment}_${timestamp}.log`
- Smoke test reports: `smoke_test_report_${environment}_${timestamp}.txt`
- Notification fallback: `notification_fallback/`
- Backup files: `backups/dhash_${environment}_${timestamp}.zip`