# dhash Deployment Operations Guide

## Overview

This guide provides detailed instructions for operating the guarded rollout system for dhash deployments. It covers pre-deployment preparation, deployment execution, monitoring, rollback procedures, and incident response.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Deployment Process](#deployment-process)
3. [Monitoring and Quality Gates](#monitoring-and-quality-gates)
4. [Rollback Procedures](#rollback-procedures)
5. [Incident Response](#incident-response)
6. [Troubleshooting](#troubleshooting)
7. [Contact Information](#contact-information)

## Pre-Deployment Checklist

### Required Artifacts

Before deploying to production, ensure all required artifacts are present and validated:

#### 1. Backup Verification
```bash
# List available backups
ls -la backups/dhash_*.zip

# Verify latest backup
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
```

#### 2. Dry-Run Logs
Ensure these log files are present in `premerge_artifacts/logs/`:
- `backup-dryrun.log`
- `deploy-dryrun.log`
- `migrate-dryrun.log`
- `postdeploy-smoketests.log`
- `test_logging.log`

#### 3. CI Validation
- [ ] Pre-merge GitHub Actions workflow passed (`.github/workflows/premerge.yml`)
- [ ] Cross-platform CI validation completed (Ubuntu, macOS, Windows)
- [ ] All quality gates configuration validated

#### 4. Approval Requirements
- [ ] Deploy operator (@ops) has reviewed artifacts and given explicit sign-off
- [ ] At least 2 approvers including ≥1 Ops/SRE team member
- [ ] Branch protection rules satisfied

### Environment Preparation

#### Production Environment Setup
```bash
# Verify environment configuration
node -e "console.log(require('./quality-gates-config.json').environments.production)"

# Check service health before deployment
curl -s https://dhash.production.example.com/health

# Verify monitoring tools are available
node scripts/monitor_dhash.js --env production --dry-run --duration-minutes 1
```

#### Dependencies and Platform Requirements

##### Linux/macOS Dependencies
- `curl` (for health checks and API calls)
- `node` v16+ (for monitoring and notification scripts)
- `zip/unzip` (for backup operations)
- `sha256sum` (for backup verification)

##### Windows Dependencies
- PowerShell 5.1+ or PowerShell Core 7+
- `curl.exe` (included in Windows 10/11)
- Node.js v16+ (downloadable from nodejs.org)
- 7-Zip or Windows built-in ZIP support

##### Optional Dependencies
- `ffmpeg` (if media processing is involved)
- `poppler-utils` (for PDF processing, if applicable)

To install missing dependencies on Windows:
```powershell
# Install Node.js (run as Administrator)
winget install OpenJS.NodeJS

# Install 7-Zip (optional, for better ZIP handling)
winget install 7zip.7zip
```

## Deployment Process

### 1. Pre-Deployment Backup

Always create a backup before deployment:

```bash
# Create production backup
./scripts/backup_dhash.sh --env production

# Verify backup was created successfully
LATEST_BACKUP=$(ls -1 backups/dhash_production_*.zip | sort -r | head -n1)
echo "Created backup: $LATEST_BACKUP"
sha256sum -c "${LATEST_BACKUP}.sha256"
```

### 2. Migration Execution (if required)

Run database migrations:

```bash
# Run migration dry-run first
./scripts/migrate_dhash.sh --dry-run --env production

# Execute actual migration
./scripts/migrate_dhash.sh --env production
```

### 3. Application Deployment

Deploy the application:

```bash
# Deploy to production
./scripts/deploy_dhash.sh --env production

# The script will automatically:
# 1. Create pre-deployment backup
# 2. Stop dhash service
# 3. Update application code
# 4. Update configuration
# 5. Start dhash service
# 6. Run post-deployment verification
# 7. Start 60-minute monitoring
```

### 4. Post-Deployment Verification

The deployment script automatically runs verification, but you can run manual checks:

```bash
# Run smoke tests
./scripts/smoke_tests.sh --env production

# Validate logging
node scripts/validate_logging.js --env production

# Check service health
curl -s https://dhash.production.example.com/health
```

## Monitoring and Quality Gates

### Automatic Monitoring

After production deployment, a 60-minute monitoring period begins automatically:

- **Initial 5 minutes**: High-frequency polling (every 30 seconds)
- **Remaining 55 minutes**: Normal polling (every 2 minutes)

### Quality Gate Thresholds

The monitoring system checks these thresholds (configured in `quality-gates-config.json`):

| Metric | Threshold | Action |
|--------|-----------|--------|
| Health check failures | >2 consecutive | Auto-rollback |
| Extraction failure rate | >5% over 10min | Auto-rollback |
| P95 hash time | >2000ms over 15min | Auto-rollback |
| Low confidence queue length | >1000 items | Auto-rollback |

### Manual Monitoring

You can monitor the deployment manually:

```bash
# Check monitoring status
ps aux | grep monitor_dhash

# View real-time monitor logs
tail -f monitor_logs/monitor_$(date +%Y%m%d)*.log

# Check current metrics
curl -s https://dhash.production.example.com/metrics
```

### Monitoring Notifications

Notifications are sent via:
- Slack (if `SLACK_WEBHOOK_URL` configured)
- Discord (if `DISCORD_WEBHOOK_URL` configured)
- Microsoft Teams (if `TEAMS_WEBHOOK_URL` configured)
- Console output (always enabled)

## Rollback Procedures

### Automatic Rollback

If quality gates fail, the system will automatically trigger rollback:

1. Monitoring detects threshold violation
2. Auto-rollback executes using latest backup
3. Service is restored to previous state
4. Critical notifications are sent
5. Incident is flagged for manual investigation

### Manual Rollback

If you need to trigger rollback manually:

#### Quick Rollback (Latest Backup)
```bash
# Rollback to latest backup
./scripts/rollback_dhash.sh --env production --reason "manual-intervention"
```

#### Specific Backup Rollback
```bash
# List available backups
ls -la backups/dhash_production_*.zip

# Rollback to specific backup
./scripts/rollback_dhash.sh --env production \
  --backup backups/dhash_production_20240325_120000.zip \
  --reason "rollback-to-known-good-state"
```

### Post-Rollback Verification

After rollback, verify system health:

```bash
# Wait for service to stabilize
sleep 30

# Run health checks (requires 3 consecutive OK)
for i in {1..3}; do
  echo "Health check $i/3:"
  curl -s https://dhash.production.example.com/health
  sleep 10
done

# Run smoke tests
./scripts/smoke_tests.sh --env production

# Check metrics
curl -s https://dhash.production.example.com/metrics
```

## Incident Response

### Incident Classification

#### Critical (P0) - Immediate Response Required
- Complete service outage
- Data corruption or loss
- Security breach
- Auto-rollback failed

#### High (P1) - Response within 1 hour
- Partial service degradation
- Performance significantly impacted
- Quality gates consistently failing

#### Medium (P2) - Response within 4 hours
- Minor performance issues
- Non-critical feature unavailable
- Monitoring alerts but service functional

### Escalation Procedures

#### 1. Initial Response (Deploy Operator)
- Assess situation severity
- Attempt automatic remediation
- Escalate if needed

#### 2. Ops/SRE Team
- **Contact**: @ops in Slack
- **Responsibility**: Infrastructure and deployment issues
- **Escalation Time**: Immediate for P0, 30min for P1

#### 3. Media Engineering Team
- **Contact**: @media-eng in Slack
- **Responsibility**: Application logic and business impact
- **Escalation Time**: 1 hour for P0, 2 hours for P1

#### 4. On-Call Engineering
- **Contact**: Follow standard on-call procedures
- **Responsibility**: Escalation point for complex issues
- **Escalation Time**: 2 hours for P0, 4 hours for P1

### Communication Templates

#### Incident Declaration
```
🚨 INCIDENT: dhash Production Issue - P[0/1/2]

**Status**: Investigating/Mitigating/Resolved
**Impact**: [Description of user impact]
**Start Time**: [ISO timestamp]
**Environment**: Production
**Estimated Users Affected**: [Number/Percentage]

**Current Actions**:
- [ ] Action 1
- [ ] Action 2

**Next Update**: [Time]
**Incident Commander**: [Name]
```

#### Status Update
```
📊 UPDATE: dhash Production Incident

**Status**: [Current status]
**Progress**: [What has been done]
**Next Steps**: [What's happening next]
**ETA**: [If applicable]

**Metrics**:
- Service Health: [OK/Degraded/Down]
- Error Rate: [Percentage]
- Response Time: [P95 in ms]

**Next Update**: [Time]
```

## Troubleshooting

### Common Issues

#### 1. Deployment Script Fails
```bash
# Check logs
cat deploy_logs/deploy_$(date +%Y%m%d)*.log

# Verify prerequisites
./scripts/deploy_dhash.sh --dry-run --env production

# Manual service check
systemctl status dhash
# or
docker ps | grep dhash
```

#### 2. Monitoring Not Starting
```bash
# Check if process is running
ps aux | grep monitor_dhash

# Check for PID file issues
ls -la /tmp/dhash_monitor.pid

# Restart monitoring manually
node scripts/monitor_dhash.js --env production &
```

#### 3. Backup Verification Fails
```bash
# Check backup file integrity
ls -la backups/dhash_*.zip
file backups/dhash_*.zip

# Verify checksum manually
sha256sum backups/dhash_production_latest.zip
cat backups/dhash_production_latest.zip.sha256

# Test backup extraction
unzip -t backups/dhash_production_latest.zip
```

#### 4. Quality Gates False Positives
```bash
# Check current metrics
curl -s https://dhash.production.example.com/metrics | jq

# Adjust thresholds if needed (emergency only)
cp quality-gates-config.json quality-gates-config.json.backup
# Edit thresholds in quality-gates-config.json

# Restart monitoring with new config
pkill -f monitor_dhash
node scripts/monitor_dhash.js --env production &
```

### Log Locations

- **Deployment logs**: `deploy_logs/`
- **Monitoring logs**: `monitor_logs/`
- **Rollback logs**: `rollback_logs/`
- **Backup logs**: Inside backup ZIP files
- **Application logs**: `/var/log/dhash/` (or configured location)

### Debug Commands

```bash
# Check service status
curl -v https://dhash.production.example.com/health

# Verify configuration
node -e "console.log(JSON.stringify(require('./quality-gates-config.json'), null, 2))"

# Test notification system
node scripts/notify.js --test --message "Test notification from production"

# Check backup history
ls -lat backups/ | head -10

# Verify database connectivity
# (Replace with actual database check command)
psql -h prod-db -U dhash -c "SELECT 1;"
```

## Contact Information

### Primary Contacts

| Role | Contact | Responsibility | Availability |
|------|---------|---------------|--------------|
| **Deploy Operator** | @ops | Deployment execution | Business hours |
| **Ops/SRE Team** | @ops | Infrastructure support | 24/7 on-call |
| **Media Engineering** | @media-eng | Application support | Business hours |
| **On-Call Engineer** | Follow escalation | Emergency response | 24/7 |

### Communication Channels

- **Slack**: #dhash-deployments, #ops-alerts
- **Emergency**: Follow standard incident response procedures
- **Email**: ops-team@company.com, media-eng@company.com

### External Dependencies

- **Cloud Provider**: [Provider support contact]
- **Database Service**: [Database support contact]
- **Monitoring Service**: [Monitoring vendor support]

---

## Appendix

### Script Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `deploy_dhash.sh` | Deploy application | `./scripts/deploy_dhash.sh --env production` |
| `rollback_dhash.sh` | Rollback deployment | `./scripts/rollback_dhash.sh --env production` |
| `backup_dhash.sh` | Create backup | `./scripts/backup_dhash.sh --env production` |
| `migrate_dhash.sh` | Run migrations | `./scripts/migrate_dhash.sh --env production` |
| `monitor_dhash.js` | Monitor deployment | `node scripts/monitor_dhash.js --env production` |
| `smoke_tests.sh` | Run smoke tests | `./scripts/smoke_tests.sh --env production` |
| `notify.js` | Send notifications | `node scripts/notify.js --type deploy --env production --message "..."` |

### Configuration Files

- `quality-gates-config.json`: Quality gates and environment configuration
- `.github/workflows/premerge.yml`: Pre-merge validation workflow
- `backups/`: Backup storage directory
- `monitor_logs/`: Monitoring logs directory

### Useful One-Liners

```bash
# Get latest backup
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)

# Check if monitoring is running
pgrep -f monitor_dhash || echo "Monitoring not running"

# Quick health check
curl -sf https://dhash.production.example.com/health || echo "Health check failed"

# Count recent errors
curl -s https://dhash.production.example.com/metrics | grep -o '"errors":[0-9]*' | cut -d: -f2
```

---

*Last updated: $(date -Iseconds)*
*Version: 1.0.0*