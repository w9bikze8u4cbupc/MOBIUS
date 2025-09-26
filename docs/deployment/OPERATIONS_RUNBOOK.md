# MOBIUS Operations Runbook

## Overview

This runbook provides comprehensive operational procedures for the MOBIUS game tutorial generation system. It covers deployment, monitoring, incident response, and maintenance procedures.

## System Architecture

MOBIUS consists of:
- **Frontend**: React client application
- **Backend**: Node.js Express API server
- **Storage**: File-based storage for uploads and generated content
- **Processing**: FFmpeg-based video/audio processing pipeline

## Deployment Procedures

### Standard Deployment Process

#### Prerequisites
- [ ] All CI checks passing
- [ ] Pre-merge artifacts validated
- [ ] Required approvals obtained
- [ ] Deploy operator assigned and available
- [ ] Monitoring window scheduled

#### Step-by-Step Deployment

**1. Pre-deployment (T-30 minutes)**
```bash
# Create production backup
./scripts/deploy/backup_dhash.sh --env production --components all

# Verify backup integrity
LATEST_BACKUP=$(ls -1t backups/dhash_production_*.zip | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"

# Final validation
./scripts/deploy/premerge_orchestration.sh --env production --skip-smoke-tests
```

**2. Deployment Execution (T-0)**
```bash
# Start deployment with monitoring
./scripts/deploy/deploy_dhash.sh \
  --env production \
  --mode production \
  --backup-file "$LATEST_BACKUP" 2>&1 | tee deploy-$(date +%Y%m%d_%H%M%S).log

# Start automated monitoring (runs for 60 minutes)
./scripts/deploy/monitor_dhash.sh \
  --env production \
  --duration 3600 \
  --auto-rollback \
  --backup-file "$LATEST_BACKUP" &
MONITOR_PID=$!
```

**3. Post-deployment Validation (T+0 to T+15)**
```bash
# Wait for deployment to complete
wait

# Run comprehensive smoke tests
./scripts/deploy/smoke_tests.sh \
  --env production \
  --base-url https://api.mobius.com \
  --junit results/production-smoke-$(date +%Y%m%d_%H%M%S).xml

# Manual validation checklist
curl -f https://api.mobius.com/health
curl -f https://api.mobius.com/
```

**4. Monitoring Phase (T+15 to T+60)**
- Monitor application logs: `tail -f monitor_logs/monitor-production-*.log`
- Check system metrics every 15 minutes
- Respond to any alerts immediately
- Auto-rollback will trigger on 3 consecutive failures

### Emergency Rollback Procedure

#### When to Rollback
- 3+ consecutive health check failures
- Critical functionality broken
- Security incident detected
- Data corruption suspected
- Performance degradation >50%

#### Rollback Steps
```bash
# Immediate rollback
LATEST_BACKUP=$(ls -1t backups/dhash_production_*.zip | head -n1)
./scripts/deploy/rollback_dhash.sh \
  --backup "$LATEST_BACKUP" \
  --env production \
  --verify

# Verify rollback success
curl -f https://api.mobius.com/health
./scripts/deploy/smoke_tests.sh --env production --base-url https://api.mobius.com

# Post-rollback monitoring
./scripts/deploy/monitor_dhash.sh --env production --duration 1800 --no-rollback
```

#### Post-rollback Actions
1. **Immediate**: Verify system stability
2. **Within 1 hour**: Root cause analysis
3. **Within 4 hours**: Incident report
4. **Within 24 hours**: Prevention measures identified

## Monitoring and Alerting

### Key Metrics

| Metric | Normal Range | Warning | Critical |
|--------|--------------|---------|----------|
| Response Time | <1000ms | 1000-5000ms | >5000ms |
| Error Rate | <1% | 1-5% | >5% |
| CPU Usage | <70% | 70-90% | >90% |
| Memory Usage | <80% | 80-90% | >90% |
| Disk Space | <80% | 80-95% | >95% |
| Uptime | 100% | 99.9% | <99.9% |

### Automated Monitoring Commands
```bash
# Start continuous monitoring
./scripts/deploy/monitor_dhash.sh \
  --env production \
  --duration 86400 \  # 24 hours
  --interval 60 \     # Check every minute
  --auto-rollback \
  --backup-file "$LATEST_BACKUP"

# Monitor specific metrics
./scripts/deploy/smoke_tests.sh \
  --env production \
  --base-url https://api.mobius.com \
  --timeout 5

# Check system resources
./scripts/deploy/monitor_dhash.sh --env production --duration 60 --interval 10
```

### Manual Health Checks
```bash
# API health check
curl -f -w "Response time: %{time_total}s\n" https://api.mobius.com/health

# Comprehensive endpoint tests
curl -f https://api.mobius.com/
curl -f -I https://api.mobius.com/static/
curl -f -I https://api.mobius.com/uploads/

# System resource check
ps aux | grep node
df -h
free -h
netstat -tulpn | grep :5001
```

## Incident Response

### Severity Levels

#### Severity 1 (Critical)
- **Definition**: Complete service outage or security breach
- **Response Time**: <15 minutes
- **Escalation**: Immediate to on-call SRE
- **Communication**: #incidents, @channel

#### Severity 2 (High)
- **Definition**: Major functionality impacted
- **Response Time**: <1 hour
- **Escalation**: Within 30 minutes if not resolved
- **Communication**: #incidents

#### Severity 3 (Medium)
- **Definition**: Minor functionality impacted
- **Response Time**: <4 hours
- **Escalation**: Within 2 hours if not resolved
- **Communication**: #ops

#### Severity 4 (Low)
- **Definition**: Cosmetic issues, documentation
- **Response Time**: <24 hours
- **Escalation**: Next business day
- **Communication**: Issue tracker

### Incident Response Procedures

#### Initial Response (0-15 minutes)
1. **Assess**: Determine severity level
2. **Notify**: Alert appropriate channels
3. **Stabilize**: Implement immediate fixes or rollback
4. **Communicate**: Update stakeholders

#### Investigation Phase (15 minutes - 4 hours)
1. **Gather**: Collect logs, metrics, and timeline
2. **Analyze**: Identify root cause
3. **Document**: Record findings and actions taken
4. **Communicate**: Provide regular updates

#### Resolution Phase (Varies)
1. **Fix**: Implement permanent solution
2. **Test**: Verify fix in staging environment
3. **Deploy**: Apply fix to production
4. **Monitor**: Ensure stability

#### Post-incident (24-72 hours)
1. **Review**: Conduct post-incident review
2. **Document**: Write incident report
3. **Learn**: Identify improvement opportunities
4. **Improve**: Implement prevention measures

### Common Issues and Solutions

#### Application Not Responding
```bash
# Check if process is running
ps aux | grep "node.*src/api/index.js"

# Check port binding
netstat -tulpn | grep :5001

# Restart if needed
pkill -f "node.*src/api/index.js"
cd /path/to/mobius && node src/api/index.js &

# Check logs
tail -f application.log
```

#### High Memory Usage
```bash
# Check memory usage by process
ps aux --sort=-%mem | head -n 10

# Check for memory leaks
node --inspect src/api/index.js  # Enable debugger

# Restart if necessary (with proper backup)
./scripts/deploy/backup_dhash.sh --env production --components logs
pkill -f "node.*src/api/index.js"
node src/api/index.js &
```

#### File Upload Issues
```bash
# Check disk space
df -h

# Check upload directory permissions
ls -la src/api/uploads/

# Clean up old files if needed
find src/api/uploads/ -type f -mtime +30 -delete

# Check API logs for upload errors
grep -i "upload\|multer" monitor_logs/test_logging-*.log
```

## Maintenance Procedures

### Weekly Tasks
- [ ] Review monitoring logs for patterns
- [ ] Check disk space usage
- [ ] Verify backup integrity
- [ ] Update dependencies if needed
- [ ] Review and rotate log files

### Monthly Tasks
- [ ] Performance analysis and optimization
- [ ] Security patch review and application
- [ ] Capacity planning review
- [ ] Documentation updates
- [ ] Disaster recovery test

### Quarterly Tasks
- [ ] Full system backup and restore test
- [ ] Security audit
- [ ] Performance benchmarking
- [ ] Infrastructure cost review
- [ ] Team training updates

## Emergency Contacts

### Primary On-call
- **Deploy Operator**: @ops (#ops-oncall)
- **SRE On-call**: @sre-oncall (#sre-escalation)
- **Engineering Lead**: @eng-lead (#engineering)

### Escalation Chain
1. **Level 1**: On-call SRE (0-15 minutes)
2. **Level 2**: Engineering Manager (15-60 minutes)
3. **Level 3**: CTO (1+ hours for Sev1)

### External Vendors
- **Cloud Provider**: [Contact info]
- **CDN Provider**: [Contact info]
- **Third-party APIs**: [Contact info]

## Useful Commands Reference

### Log Analysis
```bash
# Recent errors
grep -i error monitor_logs/*.log | tail -20

# Performance analysis
grep "response.*time" monitor_logs/*.log | tail -50

# User activity
grep "POST\|PUT\|DELETE" monitor_logs/*.log | tail -100
```

### System Diagnostics
```bash
# Full system status
./scripts/deploy/smoke_tests.sh --env production

# Resource usage over time
while true; do echo "$(date): CPU=$(top -bn1 | grep Cpu | cut -d',' -f1 | cut -d':' -f2), MEM=$(free | grep Mem | awk '{print ($3/$2)*100}')%"; sleep 60; done

# Network connections
ss -tuln | grep :5001
```

### Backup and Recovery
```bash
# List available backups
ls -la backups/dhash_production_*.zip

# Verify backup integrity
for backup in backups/dhash_production_*.zip; do
  echo "Checking $backup"
  sha256sum -c "${backup}.sha256" && echo "✓ Valid" || echo "✗ Invalid"
done

# Emergency recovery
./scripts/deploy/rollback_dhash.sh --backup backups/dhash_production_YYYYMMDD_HHMMSS.zip --env production
```

---

**📞 For urgent issues**: Contact @sre-oncall immediately
**📋 For incident tracking**: Use #incidents channel
**📖 For documentation updates**: Submit PR to this runbook