# Guarded Rollout System for dhash Component

This system implements a complete guarded production rollout pipeline with pre-merge validation, SHA256-verified backups, deploy & migration dry-runs, 60-minute post-deploy monitoring with configurable quality gates, auto-rollback capabilities, and multi-channel notifications.

## 🎯 Quick Start

### For Developers

1. **Create PR** with your dhash changes
2. **Wait for pre-merge validation** to pass automatically
3. **Ensure 2 approvers** (≥1 Ops/SRE)
4. **Deploy operator sign-off** required before merge

### For Deploy Operators

1. **Verify pre-merge artifacts** are attached and valid
2. **Create production backup**:
   ```bash
   ./scripts/backup_dhash.sh --env production
   ```
3. **Execute deployment**:
   ```bash
   ./scripts/deploy_dhash.sh --env production
   ```
4. **Monitor for 60 minutes** (automatic) or manually intervene if needed

## 📋 System Overview

### Components

| Component | Purpose | Auto-rollback |
|-----------|---------|---------------|
| **Pre-merge Validation** | Validates changes before merge | N/A |
| **Backup System** | SHA256-verified backup creation | No |
| **Deployment Pipeline** | Automated dhash deployment | No |
| **Migration System** | Database/config migrations | No |
| **Monitoring System** | 60-min quality gate monitoring | **Yes** |
| **Rollback System** | Emergency and auto-rollback | No |
| **Notification System** | Multi-channel alerts | No |

### Quality Gates (Production)

| Gate | Threshold | Window | Auto-Rollback |
|------|-----------|---------|---------------|
| **Health Failures** | >2 consecutive | 5 min | ✅ |
| **Extraction Failure Rate** | >5% | 10 min | ✅ |
| **P95 Hash Time** | >2000ms | 15 min | ✅ |
| **Low-Confidence Queue** | >1000 items | Instant | ✅ |

## 🚀 Usage Examples

### Development Workflow

```bash
# 1. Create feature branch
git checkout -b feature/improve-dhash-performance

# 2. Make changes and test locally
npm test
./scripts/smoke_tests.sh --env staging --dry-run

# 3. Push and create PR
git push origin feature/improve-dhash-performance
# Pre-merge validation runs automatically

# 4. After PR approval and merge, deployment can proceed
```

### Production Deployment

```bash
# 1. Create backup (automatic in deployment, or manual)
./scripts/backup_dhash.sh --env production

# 2. Deploy with monitoring
./scripts/deploy_dhash.sh --env production
# Monitoring starts automatically for 60 minutes

# 3. Check deployment status
tail -f logs/deploy_*.log
tail -f logs/monitor_*.log
```

### Staging Deployment (for testing)

```bash
# Deploy to staging with dry-run first
./scripts/deploy_dhash.sh --dry-run --env staging
./scripts/deploy_dhash.sh --env staging

# Test migration
./scripts/migrate_dhash.sh --env staging --type forward

# Run comprehensive smoke tests
./scripts/smoke_tests.sh --env staging --post-deploy
```

### Emergency Rollback

```bash
# Find latest backup
LATEST_BACKUP=$(ls -1 backups/dhash_production_*.zip | sort -r | head -n1)

# Verify backup integrity
sha256sum -c "${LATEST_BACKUP}.sha256"

# Execute emergency rollback
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force

# Verify rollback success (requires 3 consecutive OK health checks)
./scripts/smoke_tests.sh --env production --post-rollback
```

## 📊 Monitoring & Alerts

### Monitoring Phases

1. **Initial Period (0-5 min)**: 30-second checks for rapid issue detection
2. **Regular Period (5-60 min)**: 2-minute checks for sustained monitoring

### Notification Channels

- **Slack**: Real-time team notifications
- **Teams**: Enterprise integration
- **Discord**: Community alerts
- **Email**: Formal documentation
- **File Fallback**: Audit trail when webhooks fail

### Auto-Rollback Triggers

The system automatically rolls back when quality gates are exceeded:

```json
{
  "health_failures": "2 consecutive failures → rollback",
  "extraction_failure_rate": "5% over 10 minutes → rollback",
  "p95_hash_time": "2000ms over 15 minutes → rollback",
  "low_confidence_queue": "1000 items → rollback"
}
```

## 🔧 Configuration

### Quality Gates Configuration

Edit `quality-gates-config.json` to adjust thresholds:

```json
{
  "environments": {
    "production": {
      "quality_gates": {
        "health_failures": {
          "threshold": 2,
          "window_minutes": 5,
          "action": "auto-rollback"
        }
      }
    }
  }
}
```

### Environment Variables

Set these in GitHub Actions secrets:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
TEAMS_WEBHOOK_URL=https://your-org.webhook.office.com/...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
EMAIL_TO=ops@your-company.com
```

### Tuning Guidelines

**Wait 24-72 hours** after initial deployment before tuning thresholds:

1. **Analyze baseline performance** from `logs/monitor_*.log`
2. **Identify false positive patterns**
3. **Adjust thresholds incrementally** (10-20% changes)
4. **Test in staging first**
5. **Document rationale** in commit messages

## 📁 File Structure

```
├── scripts/
│   ├── deploy_dhash.sh          # Main deployment script
│   ├── backup_dhash.sh          # Backup with SHA256 verification
│   ├── migrate_dhash.sh         # Database/config migrations
│   ├── rollback_dhash.sh        # Emergency rollback system
│   ├── monitor_dhash.js         # 60-min quality gate monitoring
│   ├── notify.js                # Multi-channel notifications
│   ├── smoke_tests.sh           # Comprehensive smoke tests
│   └── validate_logging.js      # Logging validation & redaction
├── .github/workflows/
│   └── premerge.yml             # Pre-merge validation pipeline
├── quality-gates-config.json   # Quality gate thresholds
├── backups/                     # SHA256-verified backups
├── logs/                        # Deployment and monitoring logs
├── notifications/fallback/      # Notification audit trail
└── docs/
    ├── DEPLOYMENT_OPERATIONS_GUIDE.md
    └── GUARDED_ROLLOUT_README.md
```

## 🔍 Testing & Validation

### Pre-Merge Tests (Automatic)

The pre-merge workflow (`.github/workflows/premerge.yml`) automatically runs:

- ✅ Smoke tests (pre-deployment phase)
- ✅ Backup creation and SHA256 verification
- ✅ Deploy, migration, rollback dry-runs
- ✅ Monitoring system validation
- ✅ Notification system testing
- ✅ Logging validation (redaction, concurrency)
- ✅ Cross-platform compatibility (Ubuntu/macOS/Windows)

### Manual Testing

```bash
# Test full pipeline in staging
./scripts/backup_dhash.sh --env staging
./scripts/deploy_dhash.sh --env staging
./scripts/migrate_dhash.sh --env staging --type forward
./scripts/smoke_tests.sh --env staging --post-deploy

# Test rollback procedures
./scripts/rollback_dhash.sh --env staging --dry-run

# Test notifications
node scripts/notify.js --type test --env staging --message "Test message" --dry-run
```

## 🆘 Emergency Procedures

### Auto-Rollback Activated

When auto-rollback triggers:

1. **Critical alerts sent** to all notification channels
2. **Rollback executes automatically** using latest verified backup
3. **Incident created** in tracking system
4. **Operator verification required** within 5 minutes

### Manual Intervention

```bash
# Check current status
./scripts/smoke_tests.sh --env production --post-deploy

# View monitoring logs
tail -100 logs/monitor_*.log

# Manual rollback if needed
LATEST_BACKUP=$(ls -1 backups/dhash_production_*.zip | sort -r | head -n1)
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force
```

### Monitoring System Failure

If the monitoring system fails:

```bash
# Manual monitoring mode
while true; do
  echo "$(date): Manual health check..."
  ./scripts/smoke_tests.sh --env production --post-deploy
  sleep 120
done

# Restart monitoring
nohup node scripts/monitor_dhash.js --env production > logs/monitor_recovery.log 2>&1 &
```

## 🌐 Cross-Platform Support

### Supported Platforms

- **Ubuntu/Linux**: Full support with native tooling
- **macOS**: Full support with Homebrew dependencies
- **Windows**: PowerShell scripts for Windows-specific operations

### Platform-Specific Notes

#### Windows

```powershell
# Install dependencies
choco install nodejs python ffmpeg

# Run PowerShell scripts
powershell -ExecutionPolicy Bypass -File scripts/capture_provenance.ps1
```

#### macOS

```bash
# Install dependencies
brew install node python ffmpeg jq

# Use shasum for SHA256 (not sha256sum)
shasum -a 256 file.zip
```

#### Linux

```bash
# Ubuntu/Debian
sudo apt-get install nodejs python3 ffmpeg jq bc

# CentOS/RHEL
sudo yum install nodejs python3 ffmpeg jq bc
```

## 📈 Metrics & Reporting

### Key Metrics Tracked

- **Deployment Success Rate**: Percentage of successful deployments
- **Auto-Rollback Frequency**: Rate of quality gate violations
- **Mean Time to Recovery (MTTR)**: Time from issue detection to resolution
- **False Positive Rate**: Unnecessary rollbacks due to monitoring issues

### Reporting Locations

- **Real-time**: Console output during deployment
- **Historical**: `logs/monitor_*.log` and `logs/deploy_*.log`
- **Artifacts**: CI artifacts for each pre-merge validation
- **Audit Trail**: `notifications/fallback/` for compliance

## 🔐 Security & Compliance

### Secrets Management

- **Webhook URLs**: Stored in GitHub Actions secrets (never committed)
- **API Keys**: Environment variables or CI secrets
- **Backup Integrity**: SHA256 verification for all backups
- **Access Control**: Branch protection with required approvals

### Audit Trail

- All deployment actions logged with timestamps
- Quality gate evaluations recorded
- Rollback decisions and outcomes documented
- Notification delivery status tracked

### Data Retention

- **Monitoring logs**: 90 days
- **Rollback logs**: 365 days  
- **Incident data**: 7 years
- **Backup files**: 30 days (with SHA256 verification)

## 🤝 Contributing

### Adding New Quality Gates

1. **Update configuration**: Add new gate to `quality-gates-config.json`
2. **Implement monitoring**: Add logic to `scripts/monitor_dhash.js`
3. **Update documentation**: Document threshold rationale
4. **Test in staging**: Verify gate triggers correctly

### Extending Notification Channels

1. **Add channel logic**: Extend `scripts/notify.js`
2. **Add templates**: Create notification templates for new channel
3. **Update secrets**: Add webhook URLs to CI secrets
4. **Test delivery**: Verify notifications work end-to-end

## 📞 Support & Escalation

### Primary Contacts

- **Release Owner**: Owns pre-merge validation and artifact attachment
- **Deploy Operator (@ops)**: Executes production deployments and monitors T+60
- **Media Engineering (@media-eng)**: Golden validation and media QA
- **Triage Lead/On-call**: Handles rollbacks and incident creation

### Escalation Path

1. **Level 1**: Deploy operator handles routine deployments
2. **Level 2**: SRE team for rollback decisions and quality gate tuning
3. **Level 3**: Engineering team for system modifications and root cause analysis

### Getting Help

- **Documentation**: `DEPLOYMENT_OPERATIONS_GUIDE.md` for detailed procedures
- **Configuration**: `quality-gates-config.json` for threshold tuning
- **Logs**: Check `logs/` directory for troubleshooting
- **Artifacts**: Download CI artifacts for pre-merge validation details

---

**System Version**: 1.0.0  
**Last Updated**: Generated with dhash guarded rollout implementation  
**Maintainer**: MOBIUS Operations Team