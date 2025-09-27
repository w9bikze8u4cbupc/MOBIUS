# DHhash Guarded Rollout System - Quick Start Guide

**🚀 Get up and running with enterprise-grade dhash deployments in minutes**

## Overview

The DHhash Guarded Rollout System provides **comprehensive production deployment automation** with built-in safety nets, monitoring, and automatic rollback capabilities. This system ensures **zero-downtime deployments** with **60-minute post-deploy monitoring** and **automatic rollback** on quality gate violations.

### Key Features

✅ **Automated Deployment Pipeline** - One-command deployments with full validation  
✅ **SHA256-Verified Backups** - Automatic backup creation with integrity checking  
✅ **60-Minute Monitoring** - Adaptive polling with auto-rollback on violations  
✅ **Multi-Channel Notifications** - Slack, Teams, Discord, Email with file fallback  
✅ **Quality Gates** - Configurable thresholds for health, performance, and errors  
✅ **Cross-Platform Support** - Works on Ubuntu, macOS, and Windows  
✅ **Zero-Dependency Notifications** - No external libraries required  
✅ **Complete Audit Trail** - Full logging and notification delivery tracking

---

## Quick Start (5 Minutes)

### 1. Prerequisites Check

Ensure you have the required tools:

```bash
# Check required tools
node --version    # v18+ required
npm --version     # v8+ required  
git --version     # Any recent version
curl --version    # For health checks
jq --version      # For JSON processing (install: apt-get install jq)

# Platform-specific tools
sqlite3 --version  # Database operations
ffmpeg -version    # Media processing (if used)
```

### 2. Initial Setup

```bash
# Clone the repository (if not already done)
git clone <repository-url>
cd MOBIUS

# Install dependencies  
npm ci

# Create required directories
mkdir -p backups deploy_logs migrations/dhash

# Set up environment (development example)
echo "DHASH_DEVELOPMENT_URL=http://localhost:3000" > .env.development
echo "DHASH_DEVELOPMENT_DATABASE_URL=sqlite://./dhash_dev.db" >> .env.development
```

### 3. First Deployment Test

```bash
# Test in development environment (safe!)
./scripts/deploy_dhash.sh --env development --dry-run

# If successful, run actual deployment
./scripts/deploy_dhash.sh --env development

# Verify deployment worked
./scripts/smoke_tests.sh --env development --level critical
```

**🎉 Congratulations!** You've successfully run your first guarded deployment.

---

## Production Deployment (10 Minutes)

### 1. Production Environment Setup

```bash
# Set production environment variables (store in secure secrets management)
export DHASH_PRODUCTION_URL="https://your-dhash-api.com"
export DHASH_PRODUCTION_DATABASE_URL="postgres://user:pass@host:5432/dhash"

# Optional: Set notification webhooks
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
export TEAMS_WEBHOOK_URL="https://..."
```

### 2. Pre-Production Validation

```bash
# Comprehensive pre-deployment checks
./scripts/deploy_dhash.sh --env production --dry-run

# Validate quality gates configuration
jq . quality-gates-config.json

# Ensure backup system works
./scripts/backup_dhash.sh --env production --dry-run
```

### 3. Production Deployment

```bash
# Option 1: Use the quick deploy wrapper (recommended)
./quick-deploy.sh --env production

# Option 2: Use the full command
./scripts/deploy_dhash.sh --env production
```

### 4. Monitor Deployment

The system automatically starts **60-minute monitoring** with these capabilities:

```bash
# Watch real-time monitoring
tail -f deploy_logs/monitor.log

# Check system health
curl -s $DHASH_PRODUCTION_URL/health | jq .

# View quality gate status
grep -i violation deploy_logs/monitor.log | tail -5
```

### 5. Success! 

✅ **Deployment Complete** - Your dhash component is deployed with full monitoring  
✅ **Auto-Rollback Active** - System will automatically rollback on violations  
✅ **Notifications Sent** - Team has been notified of successful deployment  
✅ **Audit Trail Created** - Full deployment history recorded  

---

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Pre-Deploy   │───▶│   Deployment     │───▶│  Post-Deploy    │
│   Validation    │    │   Execution      │    │   Monitoring    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                        │                        │
        ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ • Env Check     │    │ • Backup Create  │    │ • Health Checks │
│ • Smoke Tests   │    │ • Migrate DB     │    │ • Quality Gates │
│ • Health Check  │    │ • Deploy Code    │    │ • Auto Rollback │
│ • Backup Verify │    │ • Service Start  │    │ • Notifications │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Component Overview

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| **Deployment Scripts** | Core automation | Environment validation, dry-run support, error handling |
| **Monitoring System** | Post-deploy safety | Adaptive polling, quality gates, auto-rollback |
| **Notification System** | Communication | Multi-channel, zero-dependency, file fallback |
| **Backup System** | Data protection | SHA256 verification, retention policies, integrity checks |
| **CI Integration** | Validation | Cross-platform testing, artifact management, PR automation |

---

## Common Use Cases

### Scenario 1: Regular Production Deployment

```bash
# Standard production deployment with full monitoring
./quick-deploy.sh --env production

# Monitor for 60 minutes (automatic)
# System will auto-rollback if issues detected
```

**Expected Timeline:**
- Pre-deploy validation: 2-3 minutes
- Backup creation: 1-2 minutes  
- Deployment execution: 5-10 minutes
- Post-deploy monitoring: 60 minutes (automatic)

### Scenario 2: Emergency Rollback

```bash
# Find latest backup
LATEST_BACKUP=$(ls -t backups/dhash_production_*.zip | head -n1)

# Verify backup integrity
sha256sum -c "${LATEST_BACKUP}.sha256"

# Execute rollback
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

**Expected Timeline:**
- Backup verification: 30 seconds
- Rollback execution: 5-10 minutes
- Post-rollback validation: 2-3 minutes

### Scenario 3: Staging Validation

```bash
# Deploy to staging for testing
./scripts/deploy_dhash.sh --env staging

# Run comprehensive tests
./scripts/smoke_tests.sh --env staging --level all

# Test notification system
node scripts/deploy/deploy-notify.js --env staging --status success --message "Staging validation complete"
```

### Scenario 4: Development Testing

```bash
# Quick development deployment
npm run dhash:deploy:dev

# Or with full monitoring
./scripts/deploy_dhash.sh --env development

# Test specific components
npm run dhash:smoke-tests:critical
npm run dhash:validate-logging
```

---

## Configuration Guide

### Quality Gates Configuration

Edit `quality-gates-config.json` to customize thresholds:

```json
{
  "environments": {
    "production": {
      "quality_gates": {
        "health_failures": {
          "threshold": 2,
          "action": "auto_rollback"
        },
        "extraction_failure_rate": {
          "threshold_percentage": 5.0,
          "time_window_minutes": 10,
          "action": "auto_rollback"
        }
      }
    }
  }
}
```

### Notification Channels

Configure notification channels per environment:

```json
{
  "notification_channels": {
    "production": ["slack", "email", "file"],
    "staging": ["slack", "file"], 
    "development": ["file"]
  }
}
```

### Environment Variables

Set these environment variables for your target environments:

```bash
# Production
DHASH_PRODUCTION_URL=https://api.company.com/dhash
DHASH_PRODUCTION_DATABASE_URL=postgres://...

# Staging  
DHASH_STAGING_URL=https://staging-api.company.com/dhash
DHASH_STAGING_DATABASE_URL=postgres://...

# Notifications (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
TEAMS_WEBHOOK_URL=https://...
SMTP_HOST=smtp.company.com
```

---

## NPM Scripts Reference

The system provides convenient npm scripts for all operations:

### Deployment Scripts
```bash
npm run dhash:deploy                    # Interactive deployment
npm run dhash:deploy:prod               # Production deployment  
npm run dhash:deploy:staging            # Staging deployment
npm run dhash:deploy:dev                # Development deployment
npm run dhash:deploy:dry-run            # Validation without deployment
```

### Operations Scripts
```bash
npm run dhash:backup                    # Create backup
npm run dhash:backup:prod               # Production backup
npm run dhash:rollback                  # Interactive rollback
npm run dhash:migrate                   # Database migration
npm run dhash:monitor                   # Start monitoring
npm run dhash:monitor:prod              # Production monitoring (60min)
```

### Testing Scripts  
```bash
npm run dhash:smoke-tests               # All smoke tests
npm run dhash:smoke-tests:critical      # Critical tests only
npm run dhash:validate-logging          # Logging validation
```

### Notification Scripts
```bash
npm run dhash:notify                    # Send notification
npm run dhash:notify:deploy             # Deployment notification
```

---

## Monitoring Dashboard

### Real-time Monitoring

```bash
# Live monitoring dashboard
watch -n 10 '
echo "=== DHhash System Status ==="
echo "Environment: production"
echo "Health: $(curl -s ${DHASH_PRODUCTION_URL}/health | jq -r .status)"
echo "Monitor: $([ -f deploy_logs/monitor.pid ] && echo "ACTIVE (PID: $(cat deploy_logs/monitor.pid))" || echo "STOPPED")"
echo "Last Alert: $(tail -1 deploy_logs/monitor.log 2>/dev/null | cut -d" " -f1-3 || echo "NONE")"
echo ""
echo "=== Recent Quality Gate Checks ==="
tail -3 deploy_logs/monitor.log 2>/dev/null | grep -E "(PASS|FAIL|VIOLATION)" || echo "No recent checks"
'
```

### Quality Gate Status

```bash
# Check recent violations
grep -i "violation" deploy_logs/monitor.log | tail -5

# View current thresholds
jq '.environments.production.quality_gates' quality-gates-config.json

# Check notification delivery status  
tail -3 deploy_logs/notifications/delivery_log.jsonl | jq -r '"\(.timestamp): \(.channels_succeeded | length)/\(.channels_attempted | length) channels delivered"'
```

---

## Troubleshooting Quick Reference

### Common Issues

#### ❌ "Environment validation failed"
```bash
# Check environment variables
env | grep DHASH_

# Verify URL accessibility
curl -s $DHASH_PRODUCTION_URL/health
```

#### ❌ "Health check failed"
```bash
# Manual health check with details
curl -v $DHASH_PRODUCTION_URL/health

# Check if service is running
ps aux | grep dhash
```

#### ❌ "Backup creation failed"
```bash
# Check disk space
df -h

# Verify database connectivity
# (varies by database type - see operations guide)
```

#### ❌ "Notification delivery failed"
```bash
# Check webhook configurations
echo "Slack: ${SLACK_WEBHOOK_URL:+CONFIGURED}"

# Test file fallback
node scripts/notify.js --message "Test" --channels file
```

### Getting Help

1. **Check the logs**: `tail -50 deploy_logs/deploy.log`
2. **Run diagnostics**: `./scripts/smoke_tests.sh --env [env] --dry-run`
3. **Validate configuration**: `jq . quality-gates-config.json`
4. **Test connectivity**: Manual health checks and database connections
5. **Review documentation**: See `DEPLOYMENT_OPERATIONS_GUIDE.md` for detailed troubleshooting

---

## Advanced Features

### Custom Quality Gates

Create environment-specific quality gate overrides:

```bash
# Copy default configuration
cp quality-gates-config.json custom-gates-production.json

# Edit thresholds based on your requirements
vi custom-gates-production.json

# Use custom configuration
node scripts/monitor_dhash.js --env production --config custom-gates-production.json
```

### Custom Notification Templates

```bash
# Create custom template
cp templates/notifications/deployment_success.json templates/notifications/deployment_success_custom.json

# Edit template
vi templates/notifications/deployment_success_custom.json

# Templates are automatically loaded by notification system
```

### CI/CD Integration

The system includes comprehensive CI/CD workflows:

```bash
# Trigger pre-merge validation (automatic on PR)
git push origin feature-branch

# Manual workflow trigger (if supported)
gh workflow run premerge.yml
```

### Cross-Platform Considerations

#### Windows
- Use Git Bash or WSL for shell scripts
- Ensure FFmpeg is in PATH
- Some features may require additional setup

#### macOS
- Install dependencies via Homebrew
- Ensure Xcode command line tools installed

#### Linux  
- Install dependencies via package manager
- Verify all required tools are available

---

## Next Steps

### For Development Teams
1. **Integrate with your deployment pipeline** using the npm scripts
2. **Customize quality gates** based on your SLA requirements  
3. **Set up notification channels** for your team communication tools
4. **Test thoroughly in staging** before production deployment

### For Operations Teams
1. **Review the operations guide**: `DEPLOYMENT_OPERATIONS_GUIDE.md`
2. **Set up monitoring dashboards** using the provided commands
3. **Practice emergency procedures** in staging environment
4. **Configure backup retention policies** for your compliance requirements

### For Platform Teams
1. **Integrate with existing CI/CD** systems using the provided workflows
2. **Customize notification templates** for your organization's needs
3. **Set up centralized logging** aggregation for the deployment logs
4. **Consider extending quality gates** for additional metrics

---

## Support and Community

### Getting Support
- **Documentation**: Complete operations guide and troubleshooting available
- **Logs**: Comprehensive logging for all operations with audit trails
- **Community**: Contribute improvements via pull requests

### Contributing
- **Bug Reports**: Use GitHub issues with logs and reproduction steps
- **Feature Requests**: Propose enhancements with use cases
- **Pull Requests**: Follow the PR template for consistent submissions

### Versioning and Updates
- **Semantic Versioning**: Major.Minor.Patch versioning
- **Backward Compatibility**: Breaking changes only in major versions
- **Update Process**: Follow standard deployment procedures for system updates

---

**🎯 Ready to deploy with confidence!**

The DHhash Guarded Rollout System gives you enterprise-grade deployment capabilities with the safety and automation needed for mission-critical applications. Start with development, test in staging, and deploy to production with complete confidence.

**Quick Commands Reminder:**
- **Deploy**: `./quick-deploy.sh --env production`
- **Monitor**: `tail -f deploy_logs/monitor.log`  
- **Health Check**: `curl -s $DHASH_PRODUCTION_URL/health | jq .`
- **Emergency Rollback**: `./scripts/rollback_dhash.sh --backup $(ls -t backups/dhash_production_*.zip | head -n1) --env production`

For detailed operations procedures, see `DEPLOYMENT_OPERATIONS_GUIDE.md`.

---

**Version**: 1.0.0 | **Last Updated**: $(date +%Y-%m-%d) | **License**: MIT