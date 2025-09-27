# dhash Deployment Operations Guide

## Overview

This guide provides comprehensive instructions for deploying, monitoring, and maintaining the dhash service using the guarded rollout system. The system includes automated backups, quality gates, monitoring, and auto-rollback capabilities.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-deployment Checklist](#pre-deployment-checklist)
3. [Deployment Process](#deployment-process)
4. [Monitoring and Quality Gates](#monitoring-and-quality-gates)
5. [Rollback Procedures](#rollback-procedures)
6. [Troubleshooting](#troubleshooting)
7. [Maintenance](#maintenance)

## Prerequisites

### Required Tools
- Node.js 18+ with npm
- Bash shell (Linux/macOS) or compatible shell
- zip/unzip utilities
- curl for HTTP requests
- sha256sum or shasum for checksum verification

### Permissions
- Read/write access to project directory
- Service restart permissions (if applicable)
- Network access to monitoring endpoints
- Notification webhook access (Slack/Teams/Discord/Email)

### Environment Setup
```bash
# Clone the repository
git clone <repository-url>
cd MOBIUS

# Install dependencies
npm ci

# Verify deployment scripts
./scripts/backup_dhash.sh --help
./scripts/deploy_dhash.sh --help
./scripts/migrate_dhash.sh --help
./scripts/rollback_dhash.sh --help
```

## Pre-deployment Checklist

### 1. Code Review and Approval
- [ ] Pull request approved by at least 2 reviewers
- [ ] At least 1 approval from Ops/SRE team member (@ops)
- [ ] All CI/CD checks passed
- [ ] Pre-merge validation artifacts generated

### 2. Backup Preparation
```bash
# Create backup before deployment
./scripts/backup_dhash.sh --env production --verbose

# Verify backup integrity
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
```

### 3. Environment Validation
```bash
# Test deployment scripts in dry-run mode
./scripts/deploy_dhash.sh --dry-run --env production --verbose
./scripts/migrate_dhash.sh --dry-run --env production --verbose
```

### 4. Notification System Check
```bash
# Test notification channels
node scripts/notify.js --level info --message "Pre-deployment test" --env production
```

## Deployment Process

### Standard Deployment

```bash
# 1. Create backup
./scripts/backup_dhash.sh --env production --verbose

# 2. Run migrations (if needed)
./scripts/migrate_dhash.sh --env production --verbose

# 3. Deploy service
./scripts/deploy_dhash.sh --env production --backup-first --verbose

# 4. Start monitoring
node scripts/monitor_dhash.js --env production --verbose &
MONITOR_PID=$!

# 5. Run smoke tests
./scripts/smoke_tests.sh --env production --verbose

# 6. Monitor for 60 minutes or until auto-rollback triggers
wait $MONITOR_PID
```

### Express Deployment (Skip migrations)

```bash
# Deploy without migrations
./scripts/deploy_dhash.sh --env production --backup-first --skip-health-check

# Start monitoring immediately
node scripts/monitor_dhash.js --env production &
```

### Development/Staging Deployment

```bash
# Deploy to staging
./scripts/deploy_dhash.sh --env staging --verbose

# Run quick smoke tests
./scripts/smoke_tests.sh --env staging --quick

# Monitor for 30 minutes (staging default)
node scripts/monitor_dhash.js --env staging --verbose
```

## Monitoring and Quality Gates

### Quality Gate Thresholds

#### Production
- **Health failures**: >2 consecutive non-OK checks → Auto-rollback
- **Extraction failure rate**: >5% over 10 minutes → Auto-rollback
- **P95 hash time**: >2000ms over 15 minutes → Auto-rollback
- **Low-confidence queue**: >1000 items → Auto-rollback
- **Memory usage**: >85% → Alert only
- **Error rate**: >3% over 5 minutes → Alert only

#### Staging
- **Health failures**: >3 consecutive non-OK checks → Alert only
- **Extraction failure rate**: >10% over 5 minutes → Alert only
- **P95 hash time**: >3000ms over 10 minutes → Alert only
- **Low-confidence queue**: >500 items → Alert only

### Monitoring Commands

```bash
# Start monitoring with default settings
node scripts/monitor_dhash.js --env production

# Monitor with custom configuration
node scripts/monitor_dhash.js --env production --config custom-gates.json --verbose

# Monitor in dry-run mode (testing)
node scripts/monitor_dhash.js --env staging --dry-run --verbose

# Check monitoring logs
tail -f monitor_logs/dhash_production_*.log

# View real-time quality gate status
grep "Quality gate" monitor_logs/dhash_production_*.log | tail -10
```

### Manual Quality Gate Checks

```bash
# Check service health
curl -s http://localhost:3000/health | jq .

# Get metrics
curl -s http://localhost:3000/metrics | jq .

# Check queue status
curl -s http://localhost:3000/api/dhash/queue/status | jq .
```

## Rollback Procedures

### Automatic Rollback
The monitoring system will automatically trigger rollback when quality gates fail. No manual intervention is required unless auto-rollback fails.

### Manual Rollback

#### Find Latest Backup
```bash
# List available backups
ls -la backups/dhash_*.zip

# Find latest backup for environment
LATEST_BACKUP=$(ls -1 backups/dhash_production_*.zip | sort -r | head -n1)
echo "Latest backup: $LATEST_BACKUP"

# Verify backup integrity
sha256sum -c "${LATEST_BACKUP}.sha256"
```

#### Execute Rollback
```bash
# Standard rollback
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production

# Force rollback (skip confirmations)
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force

# Rollback with validation skip (emergency)
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force --skip-validation
```

#### Post-Rollback Validation
```bash
# Verify service health (3 consecutive checks required)
for i in {1..3}; do
  echo "Health check $i/3:"
  curl -s http://localhost:3000/health | jq .
  sleep 10
done

# Run smoke tests
./scripts/smoke_tests.sh --env production --quick

# Check logs
tail -f monitor_logs/dhash_production_*.log
```

## Troubleshooting

### Common Issues

#### Deployment Fails
```bash
# Check deployment logs
tail -f monitor_logs/deploy_*.log

# Verify dependencies
npm ci

# Check disk space
df -h .

# Verify permissions
ls -la scripts/
```

#### Health Checks Fail
```bash
# Check service status
curl -v http://localhost:3000/health

# Check service logs
journalctl -u dhash -f  # or appropriate service manager

# Check configuration
cat quality-gates-config.json | jq .environments.production

# Test manually
./scripts/smoke_tests.sh --env production --verbose
```

#### Auto-rollback Triggers Unexpectedly
```bash
# Check quality gate logs
grep "Quality gate failed" monitor_logs/dhash_production_*.log

# Review metric thresholds
node -e "
const config = require('./quality-gates-config.json');
console.log(JSON.stringify(config.environments.production.quality_gates, null, 2));
"

# Adjust thresholds if needed (create custom config)
cp quality-gates-config.json custom-gates.json
# Edit custom-gates.json
node scripts/monitor_dhash.js --config custom-gates.json
```

#### Notifications Not Working
```bash
# Test notification system
node scripts/notify.js --level warning --message "Test notification" --env production --verbose

# Check notification config
env | grep -E "(SLACK|TEAMS|DISCORD|EMAIL)"

# Check fallback file
cat monitor_logs/notification_fallback.jsonl | tail -5

# Debug webhook endpoints
curl -v "$SLACK_WEBHOOK_URL"  # Test connectivity
```

### Network/Firewall Issues

If CI runners cannot reach external webhook endpoints:

```bash
# Run monitoring with notification dry-run
node scripts/monitor_dhash.js --env production --dry-run

# Use file-based notifications only
export SLACK_WEBHOOK_URL=""
export TEAMS_WEBHOOK_URL=""
node scripts/monitor_dhash.js --env production

# Check fallback notifications
tail -f monitor_logs/notification_fallback.jsonl
```

### Emergency Procedures

#### Service Down - Immediate Rollback
```bash
# Find most recent backup
LATEST_BACKUP=$(ls -1t backups/dhash_production_*.zip | head -n1)

# Emergency rollback (skip all validations)
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force --skip-validation

# Verify restoration
curl http://localhost:3000/health
```

#### Complete System Failure
```bash
# 1. Stop all dhash processes
pkill -f dhash  # or use service manager

# 2. Restore from backup manually
cd /tmp
unzip -q "$LATEST_BACKUP"
rsync -av /tmp/extracted_backup/ /path/to/dhash/

# 3. Restart services
npm ci
npm start  # or service restart

# 4. Validate
./scripts/smoke_tests.sh --env production --quick
```

## Maintenance

### Regular Tasks

#### Weekly
```bash
# Review log files
find monitor_logs/ -name "*.log" -mtime +7 -ls

# Clean old backups (keep last 10)
ls -1t backups/dhash_production_*.zip | tail -n +11 | xargs rm -f
ls -1t backups/dhash_production_*.sha256 | tail -n +11 | xargs rm -f

# Validate logging system
node scripts/validate_logging.js --env production
```

#### Monthly
```bash
# Review quality gate thresholds
node -e "
const config = require('./quality-gates-config.json');
const prod = config.environments.production;
console.log('Current production thresholds:');
console.log(JSON.stringify(prod.quality_gates, null, 2));
"

# Update notification channels if needed
node scripts/notify.js --level info --message "Monthly notification test" --env production

# Performance baseline check
./scripts/smoke_tests.sh --env production
```

### Log Rotation

Logs are rotated automatically, but you can manage them manually:

```bash
# Compress old logs
find monitor_logs/ -name "*.log" -mtime +1 -exec gzip {} \;

# Remove very old compressed logs
find monitor_logs/ -name "*.log.gz" -mtime +30 -delete

# Archive notification fallback logs
cp monitor_logs/notification_fallback.jsonl monitor_logs/notification_fallback_$(date +%Y%m).jsonl
> monitor_logs/notification_fallback.jsonl
```

### Configuration Updates

#### Updating Quality Gates
```bash
# Backup current configuration
cp quality-gates-config.json quality-gates-config.json.backup

# Test configuration changes in staging
node scripts/monitor_dhash.js --env staging --config quality-gates-config.json --dry-run

# Apply to production during maintenance window
# (Restart monitoring with new configuration)
```

#### Notification Channel Updates
```bash
# Update environment variables
echo 'SLACK_WEBHOOK_URL=https://hooks.slack.com/...' >> .env.notifications

# Test new channels
node scripts/notify.js --level info --message "Configuration update test" --verbose
```

## Support Contacts

- **Release Owner / PR Author**: Responsible for pre-merge artifacts
- **Deploy Operator (@ops)**: Executes production deployments and monitors T+60
- **Media Engineering (@media-eng)**: Golden validation and media QA
- **Triage Lead / On-call**: Ops/SRE assigned for rollback and incident handling

## Quick Reference

### Deployment Commands
```bash
# Full deployment
./scripts/deploy_dhash.sh --env production --backup-first

# Monitor deployment
node scripts/monitor_dhash.js --env production

# Emergency rollback
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force
```

### Quality Gate Commands
```bash
# Check current metrics
curl -s http://localhost:3000/metrics | jq .

# View active quality gates
grep "Quality gate" monitor_logs/dhash_production_*.log | tail -5

# Test notification
node scripts/notify.js --level warning --message "Test alert"
```

### Log Locations
- Deployment logs: `monitor_logs/deploy_*.log`
- Monitoring logs: `monitor_logs/dhash_*.log`
- Notification fallback: `monitor_logs/notification_fallback.jsonl`
- Smoke test logs: `monitor_logs/smoke_tests_*.log`