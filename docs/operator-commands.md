# Operator Quick Commands

Copy/paste commands for deployment operations. Update variables as needed.

## Pre-deployment Commands

### Environment Setup
```bash
# Set target environment
export TARGET_ENV="production"  # or "staging"
export BASE_URL="https://api.mobius.example.com"  # Update URL
```

### Backup and Verification
```bash
# Create backup
./scripts/deploy/backup.sh --env $TARGET_ENV

# Identify and verify latest backup
LATEST_BACKUP=$(ls -1 backups/dhash_${TARGET_ENV}_*.zip | sort -r | head -n1)
echo "Latest backup: $LATEST_BACKUP"
sha256sum -c "${LATEST_BACKUP}.sha256"
```

### Pre-deployment Validation
```bash
# Run deployment dry-run
./scripts/deploy/deploy_dryrun.sh --env $TARGET_ENV --verbose

# Run migration dry-run  
./scripts/deploy/migration_dryrun.sh --env $TARGET_ENV --verbose

# Run full orchestration (recommended)
./scripts/deploy/premerge_orchestration.sh --env $TARGET_ENV
```

## Deployment Commands

### Service Deployment
```bash
# Install dependencies
npm ci --production

# Apply configuration (customize paths)
cp config/${TARGET_ENV}/* /path/to/production/config/

# Restart services (customize service names)
sudo systemctl restart mobius-api
sudo systemctl restart mobius-worker
sudo systemctl status mobius-api mobius-worker
```

### Database Migrations  
```bash
# Apply migrations (if applicable)
npm run migrate:${TARGET_ENV}

# Verify migrations
npm run migrate:status
```

## Post-deployment Commands

### Smoke Tests and Verification
```bash
# Run smoke tests
./scripts/deploy/smoke_tests.sh --env $TARGET_ENV

# Manual health checks
curl -f $BASE_URL/health
curl -f $BASE_URL/api/version

# Required 3 consecutive health checks
for i in {1..3}; do
  echo "Health check $i/3 ($(date)):"
  curl -f $BASE_URL/health && echo " ✅" || echo " ❌"
  sleep 10
done
```

### Start Monitoring
```bash
# Start 60-minute monitoring with auto-rollback
MONITOR_DURATION=3600 AUTO_ROLLBACK=true \
./scripts/deploy/monitor.sh \
  --env $TARGET_ENV \
  --auto-rollback \
  --backup "$LATEST_BACKUP" \
  --health-url "$BASE_URL/health" &

MONITOR_PID=$!
echo "Monitoring PID: $MONITOR_PID"

# Check monitoring status
ps aux | grep monitor.sh | grep -v grep
```

### Monitor Logs
```bash
# Real-time monitoring
tail -f monitor_logs/monitor_${TARGET_ENV}_*.log

# Application logs (customize service names)
sudo journalctl -u mobius-api -f
sudo journalctl -u mobius-worker -f
```

## Emergency Rollback Commands

### Immediate Rollback
```bash
# Stop monitoring if running
kill $MONITOR_PID 2>/dev/null || true

# Verify backup before rollback
LATEST_BACKUP=$(ls -1 backups/dhash_${TARGET_ENV}_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"

# Execute emergency rollback
./scripts/deploy/rollback_dhash.sh \
  --backup "$LATEST_BACKUP" \
  --env $TARGET_ENV \
  --force
```

### Post-rollback Verification
```bash
# Verify rollback success
./scripts/deploy/smoke_tests.sh --env $TARGET_ENV

# Required 3 consecutive OK health checks per runbook
for i in {1..3}; do
  echo "Post-rollback health check $i/3:"
  curl -f $BASE_URL/health && echo " ✅" || echo " ❌"
  sleep 10
done

# Check service status
sudo systemctl status mobius-api mobius-worker
```

## Monitoring Commands

### System Health
```bash
# System resources
htop
df -h
iostat 5 3

# Network connectivity
netstat -tuln | grep :3000
curl -I $BASE_URL

# Process status
ps aux | grep node | grep -v grep
```

### Log Analysis
```bash
# Recent errors
sudo journalctl -u mobius-api --since "10 minutes ago" | grep -i error
sudo journalctl -u mobius-worker --since "10 minutes ago" | grep -i error

# Performance metrics
tail -100 monitor_logs/monitor_${TARGET_ENV}_*.log | grep -E "(latency|error|success)"
```

## Cleanup Commands

### Archive Artifacts
```bash
# Create lifecycle management export
./scripts/deploy/lcm_export.sh --env $TARGET_ENV --days 30

# Clean old logs (30+ days)
find monitor_logs/ -name "*.log" -mtime +30 -delete
find premerge_artifacts/ -name "*" -mtime +7 -delete

# Clean old backups (keep last 10)
cd backups/
ls -1t dhash_${TARGET_ENV}_*.zip | tail -n +11 | while read backup; do
  echo "Removing old backup: $backup"
  rm -f "$backup" "${backup}.sha256"
done
```

## Troubleshooting Commands

### Service Issues
```bash
# Restart services
sudo systemctl stop mobius-api mobius-worker
sudo systemctl start mobius-api mobius-worker

# Check service logs
sudo journalctl -u mobius-api --lines=100
sudo journalctl -u mobius-worker --lines=100

# Configuration validation
ls -la config/$TARGET_ENV/
cat config/$TARGET_ENV/*.json | jq . # Validate JSON syntax
```

### Network/Connectivity Issues
```bash
# Test connectivity
ping -c 3 api.mobius.example.com
curl -v $BASE_URL/health
nslookup api.mobius.example.com

# Port availability
netstat -tuln | grep :3000
sudo lsof -i :3000
```

### Database Issues (if applicable)
```bash
# Test database connectivity
npm run db:test

# Check migration status
npm run migrate:status

# Rollback migrations (emergency)
npm run migrate:rollback
```

## Status Communication

### Slack/Teams Notifications
```bash
# Using templates (customize webhook URLs)
# Deployment started
curl -X POST -H 'Content-type: application/json' \
  --data @templates/notifications/slack/deployment-started.json \
  $SLACK_WEBHOOK_URL

# Deployment success  
curl -X POST -H 'Content-type: application/json' \
  --data @templates/notifications/slack/deployment-success.json \
  $SLACK_WEBHOOK_URL

# Rollback triggered
curl -X POST -H 'Content-type: application/json' \
  --data @templates/notifications/slack/rollback-triggered.json \
  $SLACK_WEBHOOK_URL
```

## Emergency Contacts

```bash
# Alert SRE on-call
echo "DEPLOYMENT ISSUE: $TARGET_ENV deployment failed. Manual intervention required." | \
  curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"'"$(cat -)"'"}' \
  $SRE_ALERT_WEBHOOK

# Page incident commander (customize paging system)
# curl -X POST $PAGERDUTY_URL -d '{"incident_key":"deployment-$TARGET_ENV-$(date +%s)"}'
```

---

**Quick Reference Card**: Print this section and keep accessible during deployments

**Framework Version**: 1.0  
**Last Updated**: $(date --iso-8601)