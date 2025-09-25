# MOBIUS dhash Deployment Cheat Sheet

Quick reference for deploying and managing the MOBIUS dhash system in production.

## 🚀 Quick Deploy Commands

### Standard Deployment
```bash
# 1. Set environment variables
export RELEASE_TAG="v1.2.3"
export DEPLOY_LEAD="@ops"

# 2. Deploy to production
./scripts/deploy_dhash.sh --env production --tag "$RELEASE_TAG"

# 3. Monitor deployment (60 minutes)
./scripts/monitor_dhash.sh --env production --duration 3600

# 4. If issues arise, rollback
LATEST_BACKUP=$(ls -1 backups/dhash*.zip | sort -r | head -n 1)
sha256sum -c "${LATEST_BACKUP}.sha256"
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

### Dry Run (Pre-deployment Validation)
```bash
./scripts/deploy_dhash.sh --env staging --tag "v1.2.3" --dry-run
```

## 📋 Pre-Deployment Checklist

- [ ] ✅ CI passed on all platforms (Ubuntu, macOS, Windows)
- [ ] ✅ Premerge validation workflow completed
- [ ] ✅ Quality gates validated (`quality-gates-config.json`)
- [ ] ✅ 2+ approvals obtained (including Ops/SRE)
- [ ] ✅ Release tag created (`git tag -a vX.Y.Z`)
- [ ] ✅ Deployment artifacts downloaded and reviewed
- [ ] ✅ Deploy operator assigned and acknowledged
- [ ] ✅ Rollback plan confirmed
- [ ] ✅ Monitoring dashboard ready
- [ ] ✅ Team notified of deployment window

## 🔧 Emergency Procedures

### Quick Rollback
```bash
# Find latest backup
ls -la backups/dhash-production-backup-*.zip

# Verify backup integrity
sha256sum -c backups/dhash-production-backup-YYYYMMDD-HHMMSS.zip.sha256

# Execute rollback (with confirmation)
./scripts/rollback_dhash.sh --backup backups/dhash-production-backup-YYYYMMDD-HHMMSS.zip --env production

# Force rollback (skip confirmations)
./scripts/rollback_dhash.sh --backup backups/dhash-production-backup-YYYYMMDD-HHMMSS.zip --env production --force
```

### Service Status Check
```bash
# Quick health check
curl -f https://api.mobius.example.com/health || echo "Service Down"

# Monitor for 30 minutes
./scripts/monitor_dhash.sh --env production --duration 1800

# Check logs
tail -f logs/deploy-production-*.log
tail -f monitor_logs/monitor-production-*.log
```

## 📊 Quality Gates Reference

| Metric | Threshold | Action if Exceeded |
|--------|-----------|-------------------|
| Error Rate | < 5% | Alert + Investigation |
| Response Time P95 | < 2000ms | Performance Review |
| CPU Usage | < 80% | Scale Up |
| Memory Usage | < 90% | Scale Up |
| Disk Usage | < 85% | Cleanup/Scale |

## 🔄 Deployment Environments

### Staging
- **Purpose:** Pre-production validation
- **URL:** https://staging.mobius.example.com
- **Deploy:** `./scripts/deploy_dhash.sh --env staging --tag <tag>`
- **Monitor:** Lower thresholds, shorter monitoring window

### Production
- **Purpose:** Live user traffic
- **URL:** https://api.mobius.example.com
- **Deploy:** `./scripts/deploy_dhash.sh --env production --tag <tag>`
- **Monitor:** Full quality gates, extended monitoring

## 📁 Important Files & Directories

```
scripts/
├── deploy_dhash.sh       # Main deployment script
├── monitor_dhash.sh      # Post-deployment monitoring  
└── rollback_dhash.sh     # Emergency rollback

backups/                  # Automatic backups with checksums
├── dhash-*.zip          # Backup archives
└── dhash-*.zip.sha256   # Integrity checksums

logs/                     # Deployment and operation logs
├── deploy-*.log         # Deployment execution logs
├── rollback-*.log       # Rollback execution logs  
└── monitor_logs/        # Monitoring session logs

quality-gates-config.json # Quality thresholds and policies
```

## 🚨 Escalation Paths

### Level 1: Deploy Operator
- **Role:** Execute deployments, monitor, first-level troubleshooting
- **Contact:** @ops team in Slack #deployments
- **Escalate:** Critical alerts, rollback decisions

### Level 2: SRE/Operations  
- **Role:** Infrastructure issues, performance problems
- **Contact:** @sre team in Slack #incidents
- **Escalate:** System-level failures, capacity issues

### Level 3: Engineering Team
- **Role:** Code issues, feature problems, architectural decisions
- **Contact:** @engineering in Slack #engineering
- **Escalate:** Application bugs, design problems

## 📱 Communication Templates

### Deployment Start
```
🚀 DEPLOYMENT STARTING
Environment: Production
Tag: v1.2.3
Lead: @ops
ETA: 15 minutes
Monitoring: 60 minutes post-deploy
```

### Deployment Complete
```  
✅ DEPLOYMENT COMPLETE
Environment: Production
Tag: v1.2.3
Status: Successful
Monitoring: Active for 60 minutes
Next: Monitor health dashboard
```

### Rollback Initiated
```
🚨 ROLLBACK INITIATED
Environment: Production
Reason: [Brief description]
ETA: 10 minutes
Lead: @ops
```

## ⚡ Troubleshooting Quick Fixes

### High Error Rate
```bash
# Check recent logs
tail -100 logs/deploy-production-$(date +%Y%m%d)-*.log

# Monitor in real-time
./scripts/monitor_dhash.sh --env production --duration 600 --interval 10
```

### Performance Issues
```bash
# Quick resource check
top -n 1
df -h
free -h

# Extended monitoring with shorter intervals
./scripts/monitor_dhash.sh --env production --duration 1800 --interval 15
```

### Service Down
```bash
# Immediate rollback
./scripts/rollback_dhash.sh --backup $(ls -t backups/dhash-production-*.zip | head -1) --env production --force

# Check service status
systemctl status mobius-dhash
docker ps -a | grep mobius
```

---

**Remember:** When in doubt, rollback first, investigate later. User experience is priority #1.