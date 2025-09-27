# DHash Guarded Rollout - Quick Start Guide

This document provides a quick overview of the DHash guarded rollout system and how to use it effectively.

## Overview

The DHash guarded rollout system provides enterprise-grade deployment safety through:

- **Automated backups** with SHA256 verification
- **60-minute post-deploy monitoring** with adaptive polling
- **Configurable quality gates** with automatic rollback
- **Multi-channel notifications** with fallback options
- **Cross-platform CI validation**
- **Comprehensive smoke tests**

## Quick Start

### 1. Production Deployment (Recommended)

```bash
# Full production deployment with all safety features
./quick-deploy.sh production

# Or using the individual script
./scripts/deploy_dhash.sh --env production --backup-first
```

This will:
- Create a pre-deployment backup with SHA256 verification
- Run the deployment with health checks
- Start 60-minute monitoring with quality gates
- Send notifications to configured channels
- Run post-deployment smoke tests

### 2. Staging Deployment

```bash
# Staging deployment for testing
./quick-deploy.sh staging

# Skip backup if needed
./quick-deploy.sh staging --skip-backup
```

### 3. Dry Run (Testing)

```bash
# Test the deployment process without executing
./quick-deploy.sh production --dry-run

# Test individual components
./scripts/backup_dhash.sh --env production --dry-run
./scripts/deploy_dhash.sh --env production --dry-run
./scripts/rollback_dhash.sh --backup backups/latest.zip --env production --dry-run
```

## Emergency Procedures

### Emergency Rollback

```bash
# Find latest backup
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)

# Verify backup integrity
sha256sum -c "${LATEST_BACKUP}.sha256"

# Execute rollback
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force
```

### Quality Gate Override

If monitoring detects issues but manual verification shows the deployment is safe:

```bash
# Stop monitoring (if needed)
pkill -f "monitor_dhash.js"

# Manual verification
./scripts/smoke_tests.sh --env production --tier all
```

## Architecture

### Core Components

1. **Deployment Scripts**
   - `deploy_dhash.sh` - Main deployment orchestrator
   - `migrate_dhash.sh` - Database migration runner
   - `backup_dhash.sh` - Backup creation and verification
   - `rollback_dhash.sh` - Verified rollback with validation

2. **Monitoring & Quality Gates**
   - `monitor_dhash.js` - 60-minute monitoring with adaptive polling
   - `quality-gates-config.json` - Per-environment thresholds
   - Automatic rollback on quality gate violations

3. **Notifications**
   - `notify.js` - Multi-channel notification system
   - `deploy-notify.js` - Deployment-specific notifications
   - Template-driven messages with fallback options

4. **Testing & Validation**
   - `smoke_tests.sh` - Multi-tier smoke tests
   - `validate_logging.js` - Logging validation with redaction tests
   - Cross-platform CI validation

### Quality Gates (Default Production Thresholds)

- **Health failures**: >2 consecutive non-OK checks → auto-rollback
- **Extraction failure rate**: >5% over 10 minutes → auto-rollback  
- **P95 hash time**: >2000ms over 15 minutes → auto-rollback
- **Queue length**: >1000 items → auto-rollback

## Configuration

### Environment Variables

Required for notifications:
```bash
export WEBHOOK_URL="https://hooks.slack.com/services/..."
# or
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
export TEAMS_WEBHOOK_URL="https://outlook.office.com/webhook/..."
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
```

Optional:
```bash
export DEPLOYMENT_ID="deploy-$(date +%s)"
export COMMIT_SHA="$(git rev-parse HEAD)"
export PR_NUMBER="123"
```

### Quality Gates Tuning

Edit `quality-gates-config.json` to adjust thresholds per environment:

```json
{
  "environments": {
    "production": {
      "quality_gates": {
        "health_check": {
          "consecutive_failures_threshold": 2
        },
        "extraction_failure_rate": {
          "threshold_percent": 5,
          "window_minutes": 10
        }
      }
    }
  }
}
```

## Workflow Integration

### GitHub Actions

The system includes `.github/workflows/premerge.yml` for cross-platform validation:

- Ubuntu, macOS, Windows testing
- Dry-run validation of all scripts
- Security and quality checks
- Integration test workflow
- Artifact generation

### Branch Protection

Configure these required CI contexts:
- `cross-platform-validation (ubuntu-latest)`
- `cross-platform-validation (macos-latest)` 
- `cross-platform-validation (windows-latest)`
- `security-and-quality`
- `integration-test`

## Monitoring Dashboard

Post-deployment monitoring logs are written to:
- `monitor_${environment}_${timestamp}.log`
- `notification_fallback/` directory for offline notifications
- `smoke_test_report_${environment}_${timestamp}.txt`

## Troubleshooting

### Common Issues

1. **Backup verification fails**
   ```bash
   # Check backup integrity
   sha256sum -c backups/dhash_production_*.zip.sha256
   
   # Recreate if needed
   ./scripts/backup_dhash.sh --env production
   ```

2. **Monitoring false positives**
   ```bash
   # Check current system state
   ./scripts/smoke_tests.sh --env production --tier critical
   
   # Review quality gate thresholds
   cat quality-gates-config.json
   ```

3. **Notification failures**
   ```bash
   # Test notification system
   node scripts/notify.js --type deploy --env production --message "Test" --dry-run
   
   # Check fallback files
   ls -la notification_fallback/
   ```

4. **Cross-platform issues**
   - Windows: Ensure PowerShell execution policy allows scripts
   - macOS: Install required dependencies via Homebrew
   - Linux: Install `bc`, `zip`, `unzip` packages

## Safety Features

- **All state-changing scripts support `--dry-run`**
- **SHA256 verification for all backups**
- **Pre-rollback snapshots before restoration**
- **3 consecutive health checks required after rollback**
- **Exponential backoff with jitter for notifications**
- **File-based fallback when webhooks are unreachable**
- **Cross-platform compatibility testing**

## Support

For issues with the guarded rollout system:

1. Check the deployment operations guide: `DEPLOYMENT_OPERATIONS_GUIDE.md`
2. Review workflow logs and artifacts
3. Verify environment configuration
4. Test with `--dry-run` first
5. Escalate to deploy operators or SRE team

---

**Next Steps**: Review `DEPLOYMENT_OPERATIONS_GUIDE.md` for detailed operational procedures and troubleshooting guides.