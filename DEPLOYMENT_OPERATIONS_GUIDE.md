# MOBIUS Deployment Operations Guide

## Overview
This guide provides comprehensive instructions for deploying, monitoring, and maintaining the MOBIUS dhash production system.

## Prerequisites

### System Requirements
- Node.js 20+
- FFmpeg with all required codecs
- Python 3.10+ (for audio compliance checks)
- Sufficient disk space for backups and artifacts
- Network access to production environment

### Access Requirements
- Production deployment credentials
- Monitoring dashboard access
- Backup storage access
- Alert notification access

## Deployment Process

### Phase 1: Pre-Deployment
1. **Validate Prerequisites**
   ```bash
   ./scripts/validate_environment.sh --env production
   ```

2. **Create Backup**
   ```bash
   ./scripts/backup_dhash.sh --env production
   ```

3. **Run Pre-Deploy Checks**
   ```bash
   ./scripts/pre_deploy_checks.sh --env production --tag "$RELEASE_TAG"
   ```

### Phase 2: Deployment
1. **Execute Deployment**
   ```bash
   ./scripts/deploy_dhash.sh --env production --tag "$RELEASE_TAG" --dry-run
   # Review dry-run output, then:
   ./scripts/deploy_dhash.sh --env production --tag "$RELEASE_TAG"
   ```

2. **Verify Deployment**
   ```bash
   ./scripts/health_check.sh --env production --retries 3
   ```

### Phase 3: Post-Deployment
1. **Run Smoke Tests**
   ```bash
   ./scripts/smoke_tests.sh --env production > postdeploy-smoketests.log
   ```

2. **Start Monitoring**
   ```bash
   ./scripts/monitor_dhash.sh --env production --duration 3600
   ```

3. **Verify Queue Health**
   ```bash
   ./scripts/check_queue_health.sh --env production
   ```

## Monitoring & Alerting

### Key Metrics Dashboard
- **Health Status**: Real-time up/down status with check history
- **Error Rates**: 1m/5m/15m windows with trending
- **Performance**: p95 latency, processing times
- **Queue Metrics**: Backlog sizes, processing rates
- **System Resources**: CPU, memory, disk usage

### Alert Thresholds
Refer to `quality-gates-config.json` for current thresholds:
- Health endpoint failures
- Error rate spikes
- Performance degradation
- Queue backlogs
- Resource exhaustion

### Alert Response
1. **Immediate**: Check health dashboard and recent deploy events
2. **Investigation**: Review error logs and system metrics
3. **Escalation**: Follow runbook for specific alert type
4. **Resolution**: Apply fix or initiate rollback if necessary

## Rollback Procedures

### Automated Rollback
```bash
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --auto
```

### Manual Rollback Steps
1. **Stop Current Version**
   ```bash
   ./scripts/stop_dhash.sh --env production
   ```

2. **Restore from Backup**
   ```bash
   ./scripts/restore_dhash.sh --backup "$BACKUP_FILE" --env production
   ```

3. **Verify Restoration**
   ```bash
   ./scripts/health_check.sh --env production --retries 5
   ```

4. **Run Post-Rollback Tests**
   ```bash
   ./scripts/smoke_tests.sh --env production > rollback-verification.log
   ```

### Rollback Verification Checklist
- [ ] SHA256 verification of backup completed
- [ ] Health checks return 3+ consecutive OKs
- [ ] Smoke tests pass completely
- [ ] Queue drainage is normal/expected
- [ ] All artifacts collected and stored

## Maintenance

### Regular Tasks
- **Daily**: Review dashboards and alert status
- **Weekly**: Check backup integrity and cleanup old backups
- **Monthly**: Review and update quality gates configuration
- **Quarterly**: Disaster recovery testing

### Backup Management
```bash
# Verify backup integrity
./scripts/verify_backups.sh --days 30

# Cleanup old backups
./scripts/cleanup_backups.sh --older-than 30d
```

### Log Rotation
```bash
# Archive deployment logs
./scripts/archive_logs.sh --type deploy --older-than 7d

# Archive monitoring logs  
./scripts/archive_logs.sh --type monitor --older-than 14d
```

## Troubleshooting

### Common Issues

#### Deployment Failures
1. Check pre-deploy validation output
2. Verify network connectivity and credentials
3. Review deployment logs for specific errors
4. Check system resource availability

#### Performance Issues
1. Review performance dashboard trends
2. Check for queue backlogs
3. Monitor system resource utilization
4. Review recent configuration changes

#### Health Check Failures
1. Verify service is running
2. Check application logs for errors
3. Test endpoint manually
4. Review network connectivity

### Emergency Contacts
- **Operations Team**: @ops
- **Engineering On-Call**: [contact info]
- **Infrastructure Team**: [contact info]

## Appendix

### File Structure
```
/
├── scripts/
│   ├── deploy_dhash.sh
│   ├── monitor_dhash.sh
│   ├── rollback_dhash.sh
│   ├── backup_dhash.sh
│   ├── health_check.sh
│   └── smoke_tests.sh
├── backups/
├── monitor_logs/
├── quality-gates-config.json
└── DEPLOYMENT_CHEAT_SHEET.md
```

### Configuration Files
- `quality-gates-config.json`: Quality gates and thresholds
- `.env.production`: Production environment variables
- `monitoring.conf`: Monitoring configuration

### Log Formats
All deployment and monitoring scripts use structured JSON logging for easier parsing and analysis.