# dhash Deployment Operations Guide

## Overview

This guide provides comprehensive operational procedures for the dhash service guarded production rollout system. It covers deployment procedures, monitoring, rollback operations, and troubleshooting.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Procedures](#deployment-procedures)
4. [Monitoring and Quality Gates](#monitoring-and-quality-gates)
5. [Rollback Procedures](#rollback-procedures)
6. [Troubleshooting](#troubleshooting)
7. [Operational Runbooks](#operational-runbooks)
8. [Emergency Procedures](#emergency-procedures)

## System Architecture

### Components

- **dhash Service**: Core hash processing service
- **Database**: PostgreSQL cluster for persistent storage
- **Monitoring**: Quality gates with automated rollback
- **Backup System**: Automated backups with SHA256 verification
- **Notification System**: Multi-channel alerts (Slack, Teams, Discord, Email)

### Environments

- **Staging**: Pre-production testing environment
- **Production**: Live production environment
- **Canary**: Optional canary deployment environment

## Pre-Deployment Checklist

### Required Artifacts

Before any production deployment, ensure these artifacts are available:

- [ ] **Backup Files**
  ```bash
  # Verify latest backup exists and is valid
  LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
  sha256sum -c "${LATEST_BACKUP}.sha256"
  ```

- [ ] **Dry Run Logs**
  - `deploy-dryrun.log`
  - `migrate-dryrun.log`

- [ ] **Test Results**
  - `postdeploy-smoketests.log`
  - `test_logging.log`

- [ ] **CI Artifacts**
  - `premerge_artifacts/` bundle
  - `monitor_logs/` (if available)

- [ ] **Approvals**
  - [ ] CI status checks passing on all platforms (Ubuntu, macOS, Windows)
  - [ ] 2 approvers minimum (≥1 Ops/SRE)
  - [ ] Deploy operator (@ops) sign-off

### Branch Protection Requirements

Ensure the following branch protection rules are enabled:

- [ ] Require CI status contexts
- [ ] Require 2 approving reviews
- [ ] Require review from code owners
- [ ] Restrict pushes to matching branches
- [ ] Require branches to be up to date

## Deployment Procedures

### 1. Create Backup

**Always create a backup before deployment:**

```bash
# Production backup
./scripts/backup_dhash.sh --env production --retention-days 14

# Verify backup integrity
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
```

### 2. Run Dry-Run Deployment

```bash
# Test deployment in dry-run mode
./scripts/deploy_dhash.sh --dry-run --env production

# Test migrations in dry-run mode  
./scripts/migrate_dhash.sh --dry-run --env production
```

### 3. Execute Production Deployment

```bash
# Send deployment start notification
node scripts/deploy/deploy-notify.js \
  --phase start \
  --env production \
  --version v1.2.3 \
  --initiator "$(whoami)"

# Run migrations (if needed)
./scripts/migrate_dhash.sh --env production

# Deploy the service
./scripts/deploy_dhash.sh --env production

# Start monitoring automatically begins after deployment
```

### 4. Post-Deployment Validation

```bash
# Run smoke tests
./scripts/smoke_tests.sh --env production --timeout 600

# Validate logging
node scripts/validate_logging.js --env production --concurrency 5
```

## Monitoring and Quality Gates

### Monitoring Window

- **Duration**: 60 minutes post-deployment
- **Poll Frequency**: 
  - First 5 minutes: Every 30 seconds
  - Remaining 55 minutes: Every 2 minutes

### Quality Gate Thresholds

#### Production Defaults

```json
{
  "healthFailures": {
    "threshold": 2,
    "description": "consecutive non-OK health checks"
  },
  "extractionFailureRate": {
    "threshold": 5.0,
    "timeWindow": 10,
    "description": "extraction failure rate over 10 minutes"
  },
  "p95HashTime": {
    "threshold": 2000,
    "timeWindow": 15,
    "description": "P95 hash time over 15 minutes"
  },
  "lowConfidenceQueue": {
    "threshold": 1000,
    "description": "low-confidence queue length"
  }
}
```

### Manual Monitoring

```bash
# Monitor deployment progress
node scripts/monitor_dhash.js --env production --duration 60

# Check monitoring logs
tail -f logs/monitor_production_*.log
```

### Tuning Quality Gates

Quality gates can be tuned based on production telemetry:

```bash
# Edit quality gates configuration
vi quality-gates-config.json

# Validate configuration
node -e "JSON.parse(require('fs').readFileSync('quality-gates-config.json', 'utf8'))"
```

## Rollback Procedures

### Automatic Rollback

The monitoring system will automatically trigger rollback if quality gates are violated:

- Health check failures > 2 consecutive
- Extraction failure rate > 5% over 10 minutes
- P95 hash time > 2000ms over 15 minutes
- Queue length > 1000 items

### Manual Rollback

#### Emergency Rollback (Fast)

```bash
# Quick rollback using latest backup
./scripts/rollback_dhash.sh --env production --reason "emergency-rollback"
```

#### Rollback to Specific Backup

```bash
# Find available backups
ls -la backups/dhash_production_*.zip

# Rollback to specific backup
./scripts/rollback_dhash.sh \
  --env production \
  --backup "backups/dhash_production_20240101_120000.zip" \
  --reason "specific-version-rollback"
```

### Post-Rollback Verification

```bash
# Run post-rollback smoke tests
./scripts/smoke_tests.sh --env production --post-rollback

# Verify service health
curl -f https://dhash-prod.company.com/health

# Check metrics
curl -f https://dhash-prod.company.com/metrics
```

## Troubleshooting

### Common Issues

#### 1. Backup Integrity Check Failed

```bash
# Problem: SHA256 checksum mismatch
# Solution: Create new backup
./scripts/backup_dhash.sh --env production
```

#### 2. Migration Dry-Run Failed

```bash
# Problem: Migration script errors
# Solution: Check migration files and database connectivity
./scripts/migrate_dhash.sh --dry-run --env staging
```

#### 3. Health Checks Failing

```bash
# Check service status
curl -v https://dhash-prod.company.com/health

# Check logs
tail -f logs/deploy_production_*.log

# Check database connectivity
./scripts/migrate_dhash.sh --dry-run --env production
```

#### 4. Quality Gates Triggering False Positives

```bash
# Adjust thresholds in quality-gates-config.json
# Restart monitoring with updated config
node scripts/monitor_dhash.js --env production --config quality-gates-config.json
```

### Network Connectivity Issues

If you encounter "Firewall rules blocked me from connecting to one or more addresses":

1. **Verify CI runner network access**:
   ```bash
   # Test webhook connectivity
   curl -f $SLACK_WEBHOOK_URL
   curl -f $TEAMS_WEBHOOK_URL
   ```

2. **Use dry-run mode in CI**:
   ```bash
   node scripts/notify.js --type deploy --message "test" --dry-run
   ```

3. **Configure proxy/NAT for webhook access**:
   - Update firewall rules to allow outbound webhook calls
   - Use send-only proxy with explicit allowlist
   - Configure fallback to email/file notifications

4. **Troubleshooting webhook failures**:
   ```bash
   # Check notification logs
   tail -f logs/notifications_*.log
   
   # Test individual webhook endpoints
   curl -X POST -H "Content-Type: application/json" -d '{"text":"test"}' $SLACK_WEBHOOK_URL
   ```

### Cross-Platform Issues

#### Windows-Specific

- **PowerShell Execution Policy**:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```

- **Line Ending Issues**:
  ```bash
  # Convert CRLF to LF in shell scripts
  dos2unix scripts/*.sh
  ```

- **SHA256 Tool**:
  ```powershell
  # Use PowerShell alternative
  Get-FileHash -Algorithm SHA256 backup.zip
  ```

#### macOS-Specific

- **BSD vs GNU Tools**:
  ```bash
  # Use shasum instead of sha256sum
  shasum -a 256 backup.zip > backup.zip.sha256
  shasum -c backup.zip.sha256
  ```

## Operational Runbooks

### Daily Operations

#### Morning Health Check

```bash
#!/bin/bash
# Daily health check routine

echo "=== Daily dhash Health Check ==="

# Check service health
curl -f https://dhash-prod.company.com/health || echo "❌ Health check failed"

# Check latest backup age
LATEST_BACKUP=$(ls -1 backups/dhash_production_*.zip | sort -r | head -n1)
if [[ -n "$LATEST_BACKUP" ]]; then
    BACKUP_AGE=$(($(date +%s) - $(stat -c %Y "$LATEST_BACKUP")))
    BACKUP_HOURS=$((BACKUP_AGE / 3600))
    if [[ $BACKUP_HOURS -gt 24 ]]; then
        echo "⚠️  Latest backup is $BACKUP_HOURS hours old"
    else
        echo "✅ Backup age: $BACKUP_HOURS hours"
    fi
fi

# Check disk space
df -h logs/ backups/ | grep -E "(logs|backups)"

echo "Health check completed: $(date)"
```

#### Weekly Backup Verification

```bash
#!/bin/bash
# Weekly backup verification

echo "=== Weekly Backup Verification ==="

for backup in $(ls -1 backups/dhash_production_*.zip | tail -n 7); do
    echo "Verifying: $(basename "$backup")"
    if sha256sum -c "${backup}.sha256" > /dev/null 2>&1; then
        echo "✅ $(basename "$backup")"
    else
        echo "❌ $(basename "$backup") - INTEGRITY CHECK FAILED"
    fi
done
```

### Incident Response

#### High Priority Incident (P1)

1. **Immediate Assessment** (0-5 minutes):
   ```bash
   # Check service health
   curl -f https://dhash-prod.company.com/health
   
   # Check current monitoring status
   tail -f logs/monitor_production_*.log
   ```

2. **Decision Point** (5-10 minutes):
   - If automatic rollback hasn't triggered: Consider manual rollback
   - If service degraded but functional: Continue monitoring
   - If service completely down: Immediate rollback

3. **Execute Rollback** (10-15 minutes):
   ```bash
   ./scripts/rollback_dhash.sh --env production --reason "p1-incident-$(date +%s)"
   ```

4. **Post-Incident** (15-30 minutes):
   ```bash
   # Verify service recovery
   ./scripts/smoke_tests.sh --env production --post-rollback
   
   # Send incident notification
   node scripts/deploy/deploy-notify.js \
     --phase rollback \
     --env production \
     --reason "P1 incident recovery" \
     --trigger "manual"
   ```

## Emergency Procedures

### Complete Service Outage

1. **Immediate Rollback**:
   ```bash
   ./scripts/rollback_dhash.sh --env production --reason "complete-outage"
   ```

2. **Service Recovery Verification**:
   ```bash
   # Wait for service to come back online
   while ! curl -f https://dhash-prod.company.com/health; do
     sleep 10
     echo "Waiting for service recovery..."
   done
   
   # Run comprehensive smoke tests
   ./scripts/smoke_tests.sh --env production --post-rollback --timeout 900
   ```

3. **Communication**:
   ```bash
   # Send recovery notification
   node scripts/notify.js \
     --type success \
     --env production \
     --message "Service recovered after emergency rollback" \
     --channels "slack,teams,email"
   ```

### Database Corruption

1. **Stop Service** (prevent further corruption)
2. **Assess Backup Options**:
   ```bash
   ls -la backups/dhash_production_*.zip
   ```
3. **Restore from Latest Known Good Backup**
4. **Validate Data Integrity**
5. **Gradual Service Restart**

## Monitoring Alerts and Escalation

### Alert Levels

- **INFO**: Deployment started/completed
- **WARN**: Quality gate threshold approaching  
- **ERROR**: Quality gate violated, rollback triggered
- **CRITICAL**: Service completely unavailable

### Escalation Matrix

1. **L1**: On-call engineer (immediate response)
2. **L2**: Senior engineer + ops manager (15 minutes)
3. **L3**: Engineering director + CTO (30 minutes)

### Contact Information

- **Primary On-call**: Slack @oncall-dhash
- **Backup On-call**: Slack @oncall-backup
- **Ops Manager**: ops-manager@company.com
- **Engineering Director**: eng-director@company.com

## Maintenance Windows

### Monthly Maintenance

- **Schedule**: First Sunday of each month, 2-4 AM UTC
- **Duration**: 2 hours maximum
- **Activities**:
  - Backup cleanup (remove backups > 30 days)
  - Log rotation and archival
  - Configuration updates
  - Security patches

### Quarterly Reviews

- **Performance Analysis**: Review quality gate thresholds
- **Backup Strategy**: Validate backup/restore procedures
- **Documentation Updates**: Update runbooks and procedures
- **Training**: Team training on new procedures

---

*This document is maintained by the DevOps team. Last updated: $(date)*
*For questions or updates, contact: devops@company.com*