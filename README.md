# MOBIUS - Game Tutorial Video Generation with dhash Guarded Rollout

A comprehensive pipeline for generating game tutorial videos from structured game rules, now featuring enterprise-grade dhash deployment automation with guarded rollout capabilities.

## Features

### Video Generation Pipeline
- Automated tutorial video generation from game rules
- Support for multiple game formats and structures
- Golden test infrastructure for video quality validation
- Multi-platform support (Ubuntu/macOS/Windows)

### dhash Guarded Rollout System 🚀
**NEW**: Complete enterprise guarded production rollout system for dhash service:

- **🔒 Pre-merge Validation**: Automated CI/CD pipeline with multi-platform testing
- **💾 Automated Backups**: SHA256-verified backups with integrity checking
- **📊 Quality Gates**: Configurable monitoring with auto-rollback triggers
- **🔔 Multi-channel Notifications**: Slack/Teams/Discord/Email with fallback
- **🔄 Auto-rollback**: Automatic restoration on quality gate failures
- **📋 Operator Runbooks**: Complete documentation and troubleshooting guides

## Quick Start

### dhash Deployment
```bash
# Standard production deployment
./scripts/deploy_dhash.sh --env production --backup-first

# Start 60-minute monitoring with auto-rollback
node scripts/monitor_dhash.js --env production

# Quick deployment utility
./quick-deploy.sh production
```

### Emergency Rollback
```bash
# Find latest backup
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)

# Verify and rollback
sha256sum -c "${LATEST_BACKUP}.sha256"
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

## Documentation

- **[Guarded Rollout System](./GUARDED_ROLLOUT_README.md)**: Complete system overview and architecture
- **[Deployment Operations Guide](./DEPLOYMENT_OPERATIONS_GUIDE.md)**: Detailed operator procedures and troubleshooting
- **[PR Template](./templates/PR_BODY.md)**: Ready-to-paste PR description template

## Quality Gates (Production Defaults)

- **Health failures**: >2 consecutive non-OK checks → Auto-rollback
- **Extraction failure rate**: >5% over 10 minutes → Auto-rollback  
- **P95 hash time**: >2000ms over 15 minutes → Auto-rollback
- **Low-confidence queue**: >1000 items → Auto-rollback
- **Memory usage**: >85% → Alert only
- **Error rate**: >3% over 5 minutes → Alert only

*See `quality-gates-config.json` for environment-specific configuration.*

## Installation

```bash
# Install dependencies
npm ci

# Set up notification channels (optional)
cp .env.notifications.example .env.notifications
# Edit .env.notifications with your webhook URLs

# Verify deployment scripts
./scripts/backup_dhash.sh --help
./scripts/deploy_dhash.sh --help
./scripts/monitor_dhash.js --help
```

## Scripts Overview

### Deployment Scripts
- `scripts/backup_dhash.sh` - Automated backups with SHA256 verification
- `scripts/deploy_dhash.sh` - Service deployment with health checks
- `scripts/migrate_dhash.sh` - Database migrations with rollback support
- `scripts/rollback_dhash.sh` - Automated rollback with validation

### Monitoring & Testing
- `scripts/monitor_dhash.js` - Quality gate monitoring with auto-rollback
- `scripts/smoke_tests.sh` - Post-deployment validation tests
- `scripts/validate_logging.js` - Logging system validation
- `health-check.sh` - Quick health status utility

### Notifications
- `scripts/notify.js` - Multi-channel notification system
- `scripts/deploy/deploy-notify.js` - Deployment-specific notifications

### Utilities
- `quick-deploy.sh` - Simplified deployment workflow
- All scripts support `--help` for detailed usage information

## CI/CD Integration

The system includes comprehensive pre-merge validation:

```yaml
# .github/workflows/premerge.yml
- Multi-platform testing (Ubuntu/macOS/Windows)
- Deployment script validation  
- Dry-run deployment testing
- Quality gate configuration validation
- Notification system testing
- Artifact bundle generation
- Required approval gates (2 reviewers + 1 Ops/SRE)
```

## Monitoring Dashboard

Monitor deployment status in real-time:

```bash
# Follow monitoring logs
tail -f monitor_logs/dhash_production_*.log

# Check quality gate status  
grep "Quality gate" monitor_logs/dhash_production_*.log | tail -10

# View health status
./health-check.sh --verbose

# Check notification history
cat monitor_logs/notification_fallback.jsonl | tail -5 | jq .
```

## Contributing

1. Create feature branch with descriptive name
2. Ensure all scripts have `--dry-run` and `--help` options
3. Add comprehensive error handling and logging
4. Test across multiple environments (dev/staging/production)
5. Update documentation and notification templates
6. Ensure pre-merge validation passes before requesting review

## Support & Escalation

- **Release Owner**: Responsible for pre-merge artifacts and validation
- **Deploy Operator** (@ops): Executes production deployments and T+60 monitoring  
- **Media Engineering** (@media-eng): Golden validation and media QA
- **Triage Lead**: Ops/SRE team member handles rollbacks and incident response

## License

MIT License - See LICENSE file for details.

---

*This system provides enterprise-grade deployment safety through comprehensive validation, monitoring, and automated rollback capabilities.*