# MOBIUS dhash Deployment Operations Guide

Comprehensive guide for deployment operators managing the MOBIUS dhash production system.

## Table of Contents

1. [Overview](#overview)
2. [Pre-Deployment Procedures](#pre-deployment-procedures)
3. [Deployment Execution](#deployment-execution)
4. [Post-Deployment Monitoring](#post-deployment-monitoring)
5. [Rollback Procedures](#rollback-procedures)
6. [Troubleshooting](#troubleshooting)
7. [Emergency Procedures](#emergency-procedures)
8. [Maintenance Tasks](#maintenance-tasks)

## Overview

The MOBIUS dhash system uses an automated deployment pipeline with built-in quality gates, monitoring, and rollback capabilities. This guide covers all operational aspects of managing deployments.

### System Architecture
- **Application:** MOBIUS dhash tutorial video generator
- **Environments:** staging, production
- **Deployment Method:** Automated scripts with manual operator oversight
- **Monitoring:** Real-time health checks with configurable thresholds
- **Backup Strategy:** Automated backups with integrity verification

### Operator Responsibilities
- Execute deployments according to approved change requests
- Monitor system health during and after deployments
- Execute rollbacks when quality gates are exceeded
- Maintain deployment logs and audit trails
- Escalate issues according to defined procedures

## Pre-Deployment Procedures

### 1. Validation Checklist

Before any production deployment, verify:

```bash
# 1. Check CI status
echo "✅ Verify CI status in GitHub Actions"
echo "   - build-and-qa: PASSED on all platforms"
echo "   - premerge-validation: PASSED"
echo "   - premerge-artifacts-upload: PASSED"

# 2. Download and review artifacts
gh run list --workflow=premerge-validation.yml --limit 1
gh run download <run_id>

# 3. Validate quality gates config
python3 -c "
import json
with open('quality-gates-config.json') as f:
    config = json.load(f)
    print('✅ Quality gates config is valid JSON')
    
    # Check for placeholders
    placeholders = config.get('placeholders', {})
    unresolved = []
    for key, value in placeholders.items():
        if 'Replace with' in str(value):
            unresolved.append(f'{key}: {value}')
    
    if unresolved:
        print('⚠️  Unresolved placeholders:')
        for item in unresolved:
            print(f'   - {item}')
    else:
        print('✅ All placeholders resolved')
"
```

### 2. Approval Verification

```bash
# Check PR approvals using GitHub CLI
gh pr view <pr_number> --json reviewDecision,reviews,author

# Required approvals:
# - Minimum 2 approvals
# - At least 1 from Ops/SRE team
# - No pending change requests
```

### 3. Environment Preparation

```bash
# Set deployment environment variables
export RELEASE_TAG="v1.2.3"  # Replace with actual tag
export DEPLOY_LEAD="@ops"     # Replace with deploying operator

# Verify release tag exists
git tag -l | grep "$RELEASE_TAG" || {
    echo "❌ Error: Release tag $RELEASE_TAG not found"
    exit 1
}

# Create deployment session directory
DEPLOY_SESSION="deploy-$(date +%Y%m%d-%H%M%S)"
mkdir -p "sessions/$DEPLOY_SESSION"
cd "sessions/$DEPLOY_SESSION"

# Initialize session log
echo "Deployment Session: $DEPLOY_SESSION" > session.log
echo "Release Tag: $RELEASE_TAG" >> session.log
echo "Deploy Lead: $DEPLOY_LEAD" >> session.log
echo "Start Time: $(date -Iseconds)" >> session.log
```

## Deployment Execution

### 1. Staging Deployment (Mandatory First Step)

```bash
echo "🔍 STAGE 1: Staging Deployment"

# Deploy to staging
../../scripts/deploy_dhash.sh --env staging --tag "$RELEASE_TAG" | tee staging-deploy.log

# Verify staging deployment
if [ $? -eq 0 ]; then
    echo "✅ Staging deployment successful"
else
    echo "❌ Staging deployment failed - STOP"
    exit 1
fi

# Run staging smoke tests
echo "🧪 Running staging smoke tests..."
../../scripts/monitor_dhash.sh --env staging --duration 600 | tee staging-monitor.log

# Manual verification checklist
echo "Manual Staging Verification:"
echo "- [ ] Application starts successfully"
echo "- [ ] Health endpoint responds"
echo "- [ ] Core functionality works"
echo "- [ ] No critical errors in logs"
echo "- [ ] Performance within acceptable range"

read -p "Staging verification complete? (y/N): " -n 1 -r
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Staging verification failed - STOP"
    exit 1
fi
```

### 2. Production Deployment

```bash
echo "🚀 STAGE 2: Production Deployment"

# Final pre-production checks
echo "Pre-production checklist:"
echo "- [x] Staging deployment successful"
echo "- [x] Staging verification passed"
echo "- [x] All approvals obtained"
echo "- [x] Deploy operator ready"

# Create pre-deployment backup verification
echo "💾 Verifying backup capabilities..."
if [ ! -d "../../backups" ]; then
    mkdir -p "../../backups"
fi

# Execute production deployment
echo "🚀 Executing production deployment..."
../../scripts/deploy_dhash.sh --env production --tag "$RELEASE_TAG" | tee production-deploy.log

DEPLOY_EXIT_CODE=$?

# Log deployment result
if [ $DEPLOY_EXIT_CODE -eq 0 ]; then
    echo "✅ Production deployment completed successfully" | tee -a session.log
else
    echo "❌ Production deployment failed (exit code: $DEPLOY_EXIT_CODE)" | tee -a session.log
    echo "🚨 Initiating emergency rollback procedures..."
    # Emergency rollback handled in separate section
fi
```

### 3. Post-Deployment Verification

```bash
if [ $DEPLOY_EXIT_CODE -eq 0 ]; then
    echo "✅ STAGE 3: Post-Deployment Verification"
    
    # Immediate health check
    echo "🏥 Immediate health check..."
    sleep 30  # Allow services to stabilize
    
    # Start monitoring
    echo "📊 Starting post-deployment monitoring (60 minutes)..."
    ../../scripts/monitor_dhash.sh --env production --duration 3600 | tee production-monitor.log &
    MONITOR_PID=$!
    
    echo "Monitor PID: $MONITOR_PID" >> session.log
    echo "Monitoring started at: $(date -Iseconds)" >> session.log
    
    # Operator monitoring dashboard
    echo ""
    echo "📊 OPERATOR MONITORING DASHBOARD"
    echo "=================================="
    echo "Environment: Production"
    echo "Release: $RELEASE_TAG"
    echo "Monitor PID: $MONITOR_PID"
    echo "Duration: 60 minutes"
    echo ""
    echo "Commands:"
    echo "- Stop monitoring: kill $MONITOR_PID"
    echo "- View logs: tail -f production-monitor.log"
    echo "- Emergency rollback: ../../scripts/rollback_dhash.sh --env production"
    echo ""
    echo "✅ Deployment complete - monitoring active"
fi
```

## Post-Deployment Monitoring

### Monitoring Phases

#### Phase 1: Critical Period (T+0 to T+15 minutes)
- **Interval:** 30 seconds
- **Focus:** Service startup, immediate issues
- **Action:** Stay at console, ready for immediate rollback

#### Phase 2: Stability Check (T+15 to T+60 minutes)  
- **Interval:** 60 seconds
- **Focus:** Performance metrics, error rates
- **Action:** Monitor dashboards, review logs

#### Phase 3: Extended Monitoring (T+60 to T+240 minutes)
- **Interval:** 300 seconds  
- **Focus:** Long-term stability, user experience
- **Action:** Periodic check-ins, incident response

### Monitoring Commands

```bash
# Real-time monitoring
../../scripts/monitor_dhash.sh --env production --duration 3600

# Check specific metrics
curl -f https://api.mobius.example.com/health
curl -f https://api.mobius.example.com/metrics

# View logs in real-time
tail -f ../../logs/deploy-production-*.log
tail -f ../../monitor_logs/monitor-production-*.log

# Performance check
../../scripts/check_performance.sh production  # If available
```

### Alert Response Procedures

#### Warning Level Alerts
- **Response Time:** 5 minutes
- **Action:** Investigate, document, continue monitoring
- **Escalation:** If 3+ warnings in 15 minutes

#### Critical Alerts
- **Response Time:** Immediate
- **Action:** Assess for rollback, notify team
- **Escalation:** Automatic after 2 critical alerts

## Rollback Procedures

### Automated Rollback Triggers
- Service health check failures (3+ consecutive)
- Error rate > 10% for 5+ minutes
- Response time P95 > 5000ms for 10+ minutes
- Critical infrastructure alerts

### Manual Rollback Decision Matrix

| Scenario | Response Time | Action |
|----------|---------------|---------|
| Complete service outage | Immediate | Emergency rollback |
| High error rate (>5%) | 5 minutes | Investigate, prepare rollback |
| Performance degradation | 10 minutes | Monitor, prepare rollback |
| Functionality broken | 5 minutes | Rollback if user-impacting |

### Rollback Execution

```bash
# 1. Identify latest backup
LATEST_BACKUP=$(ls -1t ../../backups/dhash-production-*.zip | head -1)
echo "Latest backup: $LATEST_BACKUP"

# 2. Verify backup integrity
if sha256sum -c "${LATEST_BACKUP}.sha256"; then
    echo "✅ Backup integrity verified"
else
    echo "❌ Backup integrity check failed"
    echo "🚨 Backup may be corrupted - escalate immediately"
    # Don't exit - may need to proceed in emergency
fi

# 3. Execute rollback
echo "🔄 Executing rollback..."
../../scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production | tee rollback.log

# 4. Verify rollback success
if [ $? -eq 0 ]; then
    echo "✅ Rollback completed successfully"
    echo "📊 Starting post-rollback monitoring..."
    ../../scripts/monitor_dhash.sh --env production --duration 1800
else
    echo "❌ Rollback failed - ESCALATE IMMEDIATELY"
    # Emergency procedures needed
fi
```

### Post-Rollback Procedures

```bash
# 1. Document incident
cat > incident-report.md << EOF
# Incident Report: Rollback $(date -Iseconds)

## Summary
- **Environment:** Production  
- **Release Tag:** $RELEASE_TAG
- **Rollback Time:** $(date -Iseconds)
- **Operator:** $DEPLOY_LEAD

## Timeline
- Deployment started: [TIME]
- Issue detected: [TIME] 
- Rollback initiated: [TIME]
- Rollback completed: [TIME]
- Service restored: [TIME]

## Root Cause
[To be filled by engineering team]

## Impact
- Duration: [MINUTES]
- Users affected: [NUMBER]
- Services impacted: [LIST]

## Action Items
- [ ] Root cause analysis
- [ ] Fix implementation  
- [ ] Additional testing
- [ ] Process improvements
EOF

# 2. Notify stakeholders
echo "📢 Notify team of rollback completion"

# 3. Update deployment tracking
echo "Rollback completed at: $(date -Iseconds)" >> session.log
echo "Status: Rolled back to previous version" >> session.log
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Deployment Script Fails

**Symptoms:** Script exits with non-zero code, error messages in log

**Diagnosis:**
```bash
# Check script permissions
ls -la ../../scripts/deploy_dhash.sh

# Check dependencies
which ffmpeg
which python3
npm --version

# Check disk space
df -h
```

**Solutions:**
```bash
# Fix permissions
chmod +x ../../scripts/deploy_dhash.sh

# Install missing dependencies
sudo apt-get install ffmpeg  # Linux
brew install ffmpeg         # macOS

# Clear disk space
rm -rf /tmp/*
npm cache clean --force
```

#### 2. Quality Gate Failures

**Symptoms:** Monitoring alerts, high error rates, slow responses

**Diagnosis:**
```bash
# Check current metrics
curl -f https://api.mobius.example.com/metrics

# Review quality gates
cat ../../quality-gates-config.json | python3 -m json.tool

# Check logs
grep -i error ../../logs/deploy-production-*.log
```

**Solutions:**
- **Performance Issues:** Increase resources, optimize code
- **Error Rate:** Check dependencies, network connectivity
- **Availability:** Restart services, check infrastructure

#### 3. Backup/Restore Issues

**Symptoms:** Backup creation fails, checksum verification fails

**Diagnosis:**
```bash
# Check backup directory permissions
ls -la ../../backups/

# Test backup creation
mkdir test-backup
echo "test" | zip test-backup/test.zip -
sha256sum test-backup/test.zip
```

**Solutions:**
```bash
# Fix permissions
chmod 755 ../../backups/

# Clean up corrupted backups
rm ../../backups/*corrupt*

# Manual backup creation
zip -r manual-backup-$(date +%s).zip [application-files]
```

## Emergency Procedures

### Service Completely Down

```bash
echo "🚨 EMERGENCY: Service completely down"

# 1. Immediate rollback (skip normal confirmations)
LATEST_BACKUP=$(ls -1t ../../backups/dhash-production-*.zip | head -1)
../../scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force

# 2. If rollback fails, manual intervention
if [ $? -ne 0 ]; then
    echo "🚨 CRITICAL: Rollback failed - manual intervention required"
    echo "Contact: SRE on-call immediately"
    echo "Escalation: Engineering team lead"
    
    # Document emergency state
    echo "EMERGENCY: Service down, rollback failed" >> session.log
    echo "Time: $(date -Iseconds)" >> session.log
    echo "Action: Manual intervention required" >> session.log
fi

# 3. Health check every 30 seconds until restored
while ! curl -f https://api.mobius.example.com/health >/dev/null 2>&1; do
    echo "$(date -Iseconds): Service still down"
    sleep 30
done

echo "✅ Service restored at $(date -Iseconds)"
```

### Data Corruption Detected

```bash
echo "🚨 EMERGENCY: Data corruption detected"

# 1. Immediate service shutdown
echo "🛑 Stopping service to prevent further corruption"
# sudo systemctl stop mobius-dhash

# 2. Isolate corrupted data
mkdir -p incident-$(date +%s)/corrupted-data
# mv /path/to/corrupted/data incident-*/corrupted-data/

# 3. Restore from backup
LATEST_CLEAN_BACKUP=$(ls -1t ../../backups/dhash-production-*.zip | head -1)
../../scripts/rollback_dhash.sh --backup "$LATEST_CLEAN_BACKUP" --env production --force

# 4. Document incident
echo "Data corruption incident: $(date -Iseconds)" >> session.log
echo "Backup used: $LATEST_CLEAN_BACKUP" >> session.log

# 5. Contact data recovery team
echo "🚨 Contact data recovery specialists immediately"
```

### Network/Infrastructure Failure

```bash
echo "🚨 EMERGENCY: Infrastructure failure detected"

# 1. Check connectivity
ping -c 3 8.8.8.8
nslookup api.mobius.example.com

# 2. Check local services
ps aux | grep mobius
docker ps -a | grep mobius

# 3. If local services OK, check load balancer/proxy
curl -I https://api.mobius.example.com/health

# 4. Document infrastructure issue
echo "Infrastructure failure: $(date -Iseconds)" >> session.log
echo "Local services: [OK/FAIL]" >> session.log
echo "Network connectivity: [OK/FAIL]" >> session.log

# 5. Contact infrastructure team
echo "🚨 Contact infrastructure/SRE team immediately"
echo "Issue: Network/infrastructure failure"
echo "Impact: Service unavailable"
```

## Maintenance Tasks

### Daily Tasks
- Review deployment logs from previous day
- Check backup integrity (spot check)
- Verify monitoring alerts are functioning
- Review system resource usage trends

### Weekly Tasks  
- Archive old deployment logs (>7 days)
- Review and clean backup directory
- Update deployment documentation if needed
- Test rollback procedures in staging

### Monthly Tasks
- Review and update quality gates configuration
- Audit deployment procedures and access
- Performance trend analysis
- Disaster recovery drill

### Quarterly Tasks
- Review and update this operations guide
- Evaluate deployment automation improvements
- Security review of deployment processes
- Training updates for operations team

---

## Contact Information

### Operations Team
- **Primary:** @ops (Slack: #deployments)
- **Escalation:** @sre (Slack: #incidents)
- **Emergency:** +1-555-OPS-TEAM

### Engineering Team  
- **Primary:** @engineering (Slack: #engineering)
- **On-call:** +1-555-ENG-ONCALL

### Management
- **Operations Manager:** @ops-mgr
- **Engineering Manager:** @eng-mgr
- **CTO:** @cto

---

**Document Version:** 1.0  
**Last Updated:** 2024-01-01  
**Next Review:** 2024-04-01