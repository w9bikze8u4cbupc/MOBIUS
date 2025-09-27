# DHhash Deployment Operations Guide

**Version:** 1.0.0  
**Last Updated:** $(date +%Y-%m-%d)  
**Target Audience:** DevOps Engineers, Site Reliability Engineers, Operations Teams

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Normal Deployment Procedures](#normal-deployment-procedures)
4. [Emergency Procedures](#emergency-procedures)
5. [Monitoring and Quality Gates](#monitoring-and-quality-gates)
6. [Troubleshooting Guide](#troubleshooting-guide)
7. [Maintenance Operations](#maintenance-operations)
8. [Escalation Procedures](#escalation-procedures)

---

## Quick Reference

### Emergency Commands (Keep Handy!)

```bash
# 🚨 EMERGENCY ROLLBACK
LATEST_BACKUP=$(ls -t backups/dhash_production_*.zip | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production

# 🔍 SYSTEM HEALTH CHECK
curl -s ${DHASH_PRODUCTION_URL}/health | jq .

# 📊 CURRENT MONITORING STATUS  
tail -f deploy_logs/monitor.log

# ⚡ STOP MONITORING (if needed)
kill $(cat deploy_logs/monitor.pid 2>/dev/null) 2>/dev/null || echo "No monitor running"

# 🧪 QUICK SMOKE TESTS
./scripts/smoke_tests.sh --env production --level critical
```

### Key File Locations

- **Scripts**: `./scripts/`
- **Logs**: `./deploy_logs/`
- **Backups**: `./backups/`
- **Config**: `./quality-gates-config.json`
- **Templates**: `./templates/notifications/`

---

## Pre-Deployment Checklist

### Required Preparations

#### 1. Environment Verification
```bash
# Verify environment variables are set
echo "Production URL: ${DHASH_PRODUCTION_URL:-NOT_SET}"
echo "Database URL: ${DHASH_PRODUCTION_DATABASE_URL:-NOT_SET}"

# Check webhook configurations (should be set in CI secrets)
echo "Slack webhook: ${SLACK_WEBHOOK_URL:+CONFIGURED}"
echo "Teams webhook: ${TEAMS_WEBHOOK_URL:+CONFIGURED}"
```

#### 2. Pre-flight System Check
```bash
# Run comprehensive pre-deployment validation
./scripts/smoke_tests.sh --env production --level all --dry-run
./scripts/deploy_dhash.sh --env production --dry-run
```

#### 3. Backup Verification
```bash
# Verify latest backup exists and is valid
LATEST_BACKUP=$(ls -t backups/dhash_production_*.zip | head -n1)
if [ -n "$LATEST_BACKUP" ]; then
    echo "Latest backup: $LATEST_BACKUP"
    sha256sum -c "${LATEST_BACKUP}.sha256"
    echo "Backup size: $(ls -lh "$LATEST_BACKUP" | awk '{print $5}')"
else
    echo "⚠️  No backups found - creating one now"
    ./scripts/backup_dhash.sh --env production
fi
```

#### 4. Team Readiness
- [ ] Deploy operator is available for the full 60-minute monitoring window
- [ ] On-call engineer is identified and available
- [ ] Stakeholders notified of deployment window
- [ ] Rollback decision authority is clear

---

## Normal Deployment Procedures

### Standard Production Deployment

#### Step 1: Initiate Deployment
```bash
# Using the convenient wrapper (recommended)
./quick-deploy.sh --env production

# OR using the full command
./scripts/deploy_dhash.sh --env production
```

The deployment will automatically:
1. Validate environment and prerequisites
2. Create a verified backup (SHA256 checksum)
3. Run pre-deployment health checks
4. Execute database migrations
5. Deploy application changes
6. Run post-deployment validation
7. Start 60-minute monitoring with auto-rollback
8. Send notifications to configured channels

#### Step 2: Monitor Deployment Progress
```bash
# Primary monitoring (real-time)
tail -f deploy_logs/monitor.log

# System health checks
watch -n 30 'curl -s ${DHASH_PRODUCTION_URL}/health | jq .'

# Quality gate status
jq '.environments.production.quality_gates' quality-gates-config.json
```

#### Step 3: Verify Success Indicators
- ✅ All pre-deployment checks passed
- ✅ Backup created and SHA256 verified
- ✅ Database migrations completed successfully  
- ✅ Post-deployment smoke tests all pass
- ✅ Monitoring started with no immediate violations
- ✅ Success notifications delivered

### Staging Deployment (Testing)

```bash
# Deploy to staging for validation
./scripts/deploy_dhash.sh --env staging

# Run comprehensive testing
./scripts/smoke_tests.sh --env staging --level all
```

### Development Deployment

```bash
# Quick development deployment
npm run dhash:deploy:dev

# OR with monitoring
./scripts/deploy_dhash.sh --env development
```

---

## Emergency Procedures

### 🚨 Immediate Rollback Scenarios

Execute immediate rollback if you observe:
- **Health check failures**: >2 consecutive failures
- **Error rate spike**: >5% extraction failures
- **Performance degradation**: P95 hash time >2000ms sustained
- **System instability**: Memory/CPU/disk critically high
- **Data integrity issues**: Corruption or loss detected

### Emergency Rollback Procedure

#### 1. Assess Situation (Max 2 minutes)
```bash
# Quick health assessment
curl -s ${DHASH_PRODUCTION_URL}/health | jq .

# Check recent logs
tail -50 deploy_logs/monitor.log

# Review quality gate violations
grep -i "violation\|rollback\|critical" deploy_logs/monitor.log | tail -10
```

#### 2. Execute Rollback (5-10 minutes)
```bash
# Find and verify latest backup
LATEST_BACKUP=$(ls -t backups/dhash_production_*.zip | head -n1)
echo "Rolling back to: $LATEST_BACKUP"
sha256sum -c "${LATEST_BACKUP}.sha256"

# Execute rollback
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production

# Monitor rollback progress
tail -f deploy_logs/rollback.log
```

#### 3. Post-Rollback Validation (5 minutes)
```bash
# Verify system health
./scripts/smoke_tests.sh --env production --level critical

# Confirm health endpoint
for i in {1..5}; do
    curl -s ${DHASH_PRODUCTION_URL}/health | jq -r '.status // "UNKNOWN"'
    sleep 10
done

# Validate core functionality
./scripts/smoke_tests.sh --env production --level standard
```

### Communication During Emergencies

#### Immediate Notifications (Auto-sent)
- Slack alerts with severity indicators
- Email notifications to on-call team
- File-based audit trail for compliance

#### Manual Communication Required
```bash
# Send custom emergency notification
node scripts/deploy/deploy-notify.js \
    --env production \
    --status rollback \
    --message "Emergency rollback completed due to [REASON]. System restored to previous stable state." \
    --data '{"backup_file":"'$LATEST_BACKUP'","incident_id":"INC-123"}'
```

---

## Monitoring and Quality Gates

### Understanding Quality Gate Thresholds

#### Production Defaults (Configurable)
```json
{
  "health_failures": {
    "threshold": 2,
    "action": "auto_rollback",
    "severity": "critical"
  },
  "extraction_failure_rate": {
    "threshold_percentage": 5.0,
    "time_window_minutes": 10,
    "action": "auto_rollback"
  },
  "p95_hash_time": {
    "threshold_ms": 2000,
    "time_window_minutes": 15,
    "action": "auto_rollback"
  }
}
```

### Monitoring Commands

```bash
# Real-time monitoring dashboard
watch -n 10 '
echo "=== DHhash System Status ==="
echo "Health: $(curl -s ${DHASH_PRODUCTION_URL}/health | jq -r .status)"
echo "Uptime: $(curl -s ${DHASH_PRODUCTION_URL}/health | jq -r .uptime)"
echo "Monitor PID: $(cat deploy_logs/monitor.pid 2>/dev/null || echo NONE)"
echo "Last Alert: $(tail -1 deploy_logs/monitor.log 2>/dev/null || echo NONE)"
'

# Quality gate violations history
jq -r '.violations[]? | "\(.timestamp) - \(.gate): \(.current_value)/\(.threshold) (\(.severity))"' \
    deploy_logs/metrics.json 2>/dev/null | tail -10

# Notification delivery status
tail -5 deploy_logs/notifications/delivery_log.jsonl | jq -r '"\(.timestamp) - \(.channels_succeeded | length)/\(.channels_attempted | length) channels"'
```

### Adjusting Quality Gates

⚠️ **Only adjust after 24-72h of production telemetry**

```bash
# Edit configuration
vi quality-gates-config.json

# Validate changes
jq . quality-gates-config.json

# Apply changes (requires deployment)
./scripts/deploy_dhash.sh --env production
```

---

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. Deployment Script Fails

**Symptoms**: Script exits with error during deployment

**Diagnosis**:
```bash
# Check recent logs
tail -50 deploy_logs/deploy.log

# Verify environment
./scripts/deploy_dhash.sh --env production --dry-run

# Check permissions
ls -la scripts/deploy_dhash.sh
```

**Solutions**:
- **Permission denied**: `chmod +x scripts/*.sh`
- **Environment not set**: Set required environment variables
- **Backup creation fails**: Check disk space and permissions
- **Database connection fails**: Verify database URL and connectivity

#### 2. Health Checks Failing

**Symptoms**: Consistent health check failures post-deployment

**Diagnosis**:
```bash
# Manual health check
curl -v ${DHASH_PRODUCTION_URL}/health

# Check service status
systemctl status dhash-production  # or your service name

# Review application logs
tail -100 /var/log/dhash/application.log  # adjust path as needed
```

**Solutions**:
- **Service not running**: Restart service manually
- **Port conflicts**: Check port availability with `netstat -tulpn`
- **Database connectivity**: Verify database is accessible
- **Configuration errors**: Review environment-specific config

#### 3. Monitoring Not Starting

**Symptoms**: No monitoring process after deployment

**Diagnosis**:
```bash
# Check if monitor process exists
ps aux | grep monitor_dhash.js

# Review monitoring logs
cat deploy_logs/monitor.log

# Verify monitoring script
node scripts/monitor_dhash.js --help
```

**Solutions**:
- **Script not executable**: `chmod +x scripts/monitor_dhash.js`
- **Node.js issues**: Verify Node.js version and dependencies
- **Configuration errors**: Validate quality-gates-config.json
- **Permission issues**: Check log directory permissions

#### 4. Backup Creation/Verification Failures

**Symptoms**: Backup creation fails or SHA256 verification fails

**Diagnosis**:
```bash
# Check disk space
df -h

# Test backup manually
./scripts/backup_dhash.sh --env production --dry-run

# Verify existing backups
ls -la backups/
```

**Solutions**:
- **Disk space**: Clean old backups or increase storage
- **Permission issues**: Check backup directory permissions
- **Database connection**: Ensure database is accessible for backup
- **Corrupted backup**: Delete corrupt backup and recreate

#### 5. Notification Delivery Failures

**Symptoms**: No notifications received or delivery failures in logs

**Diagnosis**:
```bash
# Check notification logs
cat deploy_logs/notifications/delivery_log.jsonl | tail -5 | jq .

# Test notifications manually
node scripts/notify.js --type deployment --message "Test" --env production --channels file

# Verify webhook URLs (should be set in environment)
echo "Slack: ${SLACK_WEBHOOK_URL:+SET}"
```

**Solutions**:
- **Network issues**: Check firewall/proxy settings
- **Invalid webhooks**: Update webhook URLs in environment/secrets
- **Service outages**: Check third-party service status
- **Rate limiting**: Review and adjust retry configuration

### Cross-Platform Issues

#### Windows-Specific Issues
- **Bash scripts**: Use Git Bash or WSL
- **Path issues**: Use forward slashes in paths
- **FFmpeg**: Ensure FFmpeg is in PATH

#### macOS-Specific Issues  
- **Homebrew dependencies**: Install missing tools with `brew install`
- **File permissions**: Check and fix with `chmod +x`

#### Linux-Specific Issues
- **Package dependencies**: Install with `apt-get` or `yum`
- **SELinux**: May need to adjust SELinux policies

---

## Maintenance Operations

### Regular Maintenance Tasks

#### Weekly Tasks
```bash
# Clean up old logs (keep last 30 days)
find deploy_logs -name "*.log" -mtime +30 -delete

# Verify backup integrity for recent backups
for backup in $(find backups -name "dhash_production_*.zip" -mtime -7); do
    echo "Checking $backup..."
    sha256sum -c "${backup}.sha256"
done

# Review monitoring alert history
grep -i "violation\|alert" deploy_logs/monitor.log | tail -20
```

#### Monthly Tasks
```bash
# Review and clean old backups (respects retention policy)
./scripts/backup_dhash.sh --env production --retention-days 30

# Review quality gate thresholds based on telemetry
jq '.environments.production.quality_gates' quality-gates-config.json

# Update documentation if procedures changed
git log --since="1 month ago" --oneline -- scripts/ quality-gates-config.json
```

### Backup Management

#### Manual Backup Creation
```bash
# Create immediate backup
./scripts/backup_dhash.sh --env production

# Create backup with custom retention
./scripts/backup_dhash.sh --env production --retention-days 60
```

#### Backup Verification
```bash
# Verify all recent backups
for backup in backups/dhash_production_*.zip; do
    if [ -f "${backup}.sha256" ]; then
        echo "Verifying $(basename "$backup")..."
        cd backups && sha256sum -c "$(basename "$backup").sha256" && cd ..
    else
        echo "⚠️  No checksum for $(basename "$backup")"
    fi
done
```

#### Backup Restoration Testing
```bash
# Test backup restoration in staging
LATEST_BACKUP=$(ls -t backups/dhash_production_*.zip | head -n1)
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env staging
```

---

## Escalation Procedures

### Escalation Matrix

| Scenario | Response Time | Primary Contact | Secondary Contact |
|----------|---------------|-----------------|-------------------|
| Deployment failure | 15 minutes | Deploy Operator | SRE On-call |
| Quality gate violation | 5 minutes | Deploy Operator | Dev Team Lead |
| Auto-rollback triggered | Immediate | SRE On-call | Engineering Manager |
| Data integrity issue | Immediate | Database Team | CTO |

### Contact Information

```bash
# Alert on-call team
node scripts/deploy/deploy-notify.js \
    --env production \
    --status failed \
    --message "ESCALATION REQUIRED: [Issue description]" \
    --data '{"escalation_level":"critical","contact_sre":true}'
```

### Incident Response

#### Severity 1 (Critical)
- System completely down
- Data loss or corruption
- Security breach

**Response**: Immediate escalation, all hands on deck

#### Severity 2 (High)
- Degraded performance affecting users
- Auto-rollback triggered
- Multiple quality gate violations

**Response**: Deploy operator + SRE within 15 minutes

#### Severity 3 (Medium)
- Single quality gate violations
- Non-critical functionality affected
- Performance warnings

**Response**: Deploy operator within 1 hour

### Documentation Requirements

During incidents, maintain:
1. **Timeline of events** in incident ticket
2. **Commands executed** and their outputs  
3. **Rollback decisions** and justifications
4. **Communications sent** and recipients
5. **Lessons learned** for post-mortem

### Recovery Validation

After any incident resolution:
```bash
# Full system validation
./scripts/smoke_tests.sh --env production --level all

# Extended monitoring period
node scripts/monitor_dhash.js --env production --duration 7200  # 2 hours

# Stakeholder notification
node scripts/deploy/deploy-notify.js \
    --env production \
    --status success \
    --message "System recovered and validated. Normal operations resumed."
```

---

## Appendix

### Environment Variables Reference

```bash
# Required for production
DHASH_PRODUCTION_URL=https://dhash.company.com
DHASH_PRODUCTION_DATABASE_URL=postgres://...

# Required for staging  
DHASH_STAGING_URL=https://dhash-staging.company.com
DHASH_STAGING_DATABASE_URL=postgres://...

# Optional notification webhooks (set in CI/CD secrets)
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
TEAMS_WEBHOOK_URL=https://...
DISCORD_WEBHOOK_URL=https://...
SMTP_HOST=smtp.company.com
SMTP_FROM=dhash-deploy@company.com
SMTP_TO=ops-team@company.com
```

### Script Exit Codes
- `0`: Success
- `1`: General error
- `2`: Validation failure
- `3`: Network/connectivity error
- `4`: Permission/access error

### Log Levels and Meanings
- **SUCCESS**: Operation completed successfully
- **INFO**: Informational messages
- **WARN**: Warning conditions that don't stop execution
- **ERROR**: Error conditions that may cause failure

---

**Document Owner**: DevOps Team  
**Review Frequency**: Quarterly  
**Last Review**: $(date +%Y-%m-%d)  
**Next Review**: $(date -d "+3 months" +%Y-%m-%d)

For questions or updates to this document, contact: devops-team@company.com