# MOBIUS Deployment Readiness Framework

## Quick Start Guide

### 1. Pre-Merge Validation

Run the complete pre-merge orchestration:

```bash
# Full validation (recommended)
./scripts/deploy/premerge_orchestration.sh

# Skip certain steps if needed
SKIP_BACKUP=true SKIP_GOLDEN=true ./scripts/deploy/premerge_orchestration.sh
```

### 2. Deployment Commands

#### Create Production Backup
```bash
DEPLOY_ENV=production ./scripts/deploy/backup.sh
```

#### Deploy with Monitoring
```bash
# Start monitoring (60-minute window)
MONITOR_DURATION=3600 AUTO_ROLLBACK=true ./scripts/deploy/monitor.sh &

# Deploy your application here
# (platform-specific deployment commands)

# Monitor logs
tail -f logs/monitor_logs/monitor_*.log
```

### 3. Emergency Rollback

#### Quick Rollback Commands (for operators)
```bash
# Identify latest verified backup
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"

# Execute rollback
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production

# Verify rollback success
./scripts/deploy/smoke_tests.sh
```

## Architecture

```
MOBIUS Deployment Readiness Framework
├── scripts/deploy/          # Core deployment scripts
│   ├── backup.sh            # SHA256-verified backups
│   ├── rollback_dhash.sh    # Emergency rollback
│   ├── deploy_dryrun.sh     # Pre-deployment validation
│   ├── migration_dryrun.sh  # Database migration testing
│   ├── smoke_tests.sh       # Post-deployment validation
│   ├── monitor.sh           # T+60 monitoring with auto-rollback
│   ├── premerge_orchestration.sh  # Full pre-merge pipeline
│   └── lcm_export.sh        # Lifecycle management export
├── .github/workflows/       # CI/CD automation
│   └── premerge-validation.yml  # Multi-OS validation workflow
├── runbooks/                # Operational procedures
│   ├── deployment_runbook.md    # Step-by-step deployment guide
│   └── rollback_runbook.md      # Emergency rollback procedures
└── templates/notifications/ # Communication templates
    ├── slack_*.json         # Slack notification templates
    └── teams_*.json         # Teams notification templates
```

## Safety Features

### Automatic Rollback Triggers
- **Consecutive Failures**: 3 failed health checks in a row
- **Success Rate**: Overall success rate drops below 70%
- **High Latency**: P95 response time > 5000ms consistently
- **High Error Rate**: Error rate exceeds 5%

### Pre-Merge Gates
- ✅ Multi-OS CI validation (Ubuntu, macOS, Windows)
- ✅ SHA256-verified backup creation
- ✅ Deployment dry-run validation
- ✅ Database migration dry-run
- ✅ Golden test validation (if applicable)
- ✅ Security vulnerability scanning
- ✅ Required approvals (≥2, including ≥1 Ops/SRE)

## Configuration

### Environment Variables

Key environment variables for deployment:

```bash
# Deployment
DEPLOY_ENV=production          # Environment name
BACKUP_DIR=./backups          # Backup storage location

# Monitoring
MONITOR_DURATION=3600         # Monitor for 60 minutes
AUTO_ROLLBACK=true           # Enable auto-rollback
CONSECUTIVE_FAILURES_THRESHOLD=3  # Rollback after 3 failures

# Application
API_BASE_URL=http://localhost:5001
FRONTEND_URL=http://localhost:3000
```

See `.env.example` for complete configuration options.

## Usage Examples

### Development Environment
```bash
# Validate changes before PR
DEPLOY_ENV=development ./scripts/deploy/deploy_dryrun.sh

# Test backup/restore cycle
DEPLOY_ENV=development ./scripts/deploy/backup.sh
# ... later ...
LATEST_BACKUP=$(ls -1 backups/dhash_development_*.zip | sort -r | head -n1)
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env development
```

### Staging Environment
```bash
# Full pre-production validation
DEPLOY_ENV=staging ./scripts/deploy/premerge_orchestration.sh

# Staging deployment with monitoring
DEPLOY_ENV=staging MONITOR_DURATION=1800 ./scripts/deploy/monitor.sh &
```

### Production Environment
```bash
# Production deployment (after all gates pass)
DEPLOY_ENV=production ./scripts/deploy/backup.sh
DEPLOY_ENV=production ./scripts/deploy/monitor.sh &
# ... execute deployment ...
./scripts/deploy/smoke_tests.sh
```

## Troubleshooting

### Common Issues

1. **Backup verification fails**
   ```bash
   # Check backup integrity
   file backups/dhash_*.zip
   unzip -t backups/dhash_*.zip
   ```

2. **Health checks failing**
   ```bash
   # Check application logs
   tail -100 logs/app.log
   # Check system resources
   free -h && df -h
   ```

3. **Auto-rollback not working**
   ```bash
   # Check monitoring logs
   tail -50 logs/monitor_logs/monitor_*.log
   # Verify rollback script
   ./scripts/deploy/rollback_dhash.sh --help
   ```

### Emergency Contacts

- Deploy Operator: @ops team
- On-Call Engineer: [Your escalation procedure]
- DevOps Lead: [Contact information]

## Contributing

When adding new deployment features:

1. Follow the existing script structure and error handling patterns
2. Add comprehensive logging with timestamps
3. Include help documentation (`--help` flag)
4. Add validation checks and dry-run capabilities
5. Update the runbooks and notification templates as needed

## Security Considerations

- All backups are SHA256-verified before use
- Sensitive data is excluded from exports (set INCLUDE_SENSITIVE=false)
- Scripts use `set -euo pipefail` for safe execution
- All external inputs are validated
- Rollback requires explicit confirmation unless forced

## License

This deployment framework is part of the MOBIUS project and follows the same licensing terms.