# MOBIUS Deployment Framework

## Overview

This deployment framework provides a complete, production-ready deployment system for MOBIUS with guarded rollouts, comprehensive monitoring, automated rollback capabilities, and full CI/CD integration.

## Architecture

```
MOBIUS Deployment Framework
├── Scripts (scripts/deploy/)
│   ├── backup.sh                   # SHA256-verified backup creation
│   ├── premerge_orchestration.sh   # Pre-merge automation coordinator
│   ├── deploy_dryrun.sh            # Deployment validation (dry-run)
│   ├── migration_dryrun.sh         # Migration validation (dry-run)
│   ├── smoke_tests.sh              # Post-deployment verification
│   ├── monitor.sh                  # T+60 monitoring with auto-rollback
│   ├── rollback_dhash.sh           # Emergency rollback procedures
│   └── lcm_export.sh               # Lifecycle management export
├── CI/CD (.github/workflows/)
│   └── premerge-validation.yml     # Multi-platform pre-merge validation
├── Documentation (runbooks/)
│   ├── deployment_runbook.md       # Complete deployment procedures
│   └── rollback_runbook.md         # Emergency rollback procedures
└── Notifications (templates/notifications/)
    ├── slack/                      # Slack notification templates
    ├── teams/                      # Microsoft Teams templates
    └── email/                      # Email notification templates
```

## Key Features

### 🛡️ Safety-First Design

- **SHA256-verified backups** before any deployment
- **Dry-run validation** for deployments and migrations
- **Conservative auto-rollback triggers**:
  - 3 consecutive health check failures
  - Success rate <70% after ≥5 checks
  - P95 latency >5000ms consistently
  - Error rate >5% for 5+ consecutive checks
- **60-minute T+60 monitoring** with automated rollback

### 🚀 Deployment Process

1. **Pre-merge Validation** (GitHub Actions)
   - Multi-platform testing (Ubuntu/macOS/Windows)
   - Vulnerability scanning
   - Backup and deployment dry-runs
   - Artifact collection and PR comments

2. **Deployment Execution**
   - Automated backup creation with SHA256 verification
   - Deployment and migration dry-run validation
   - Service deployment with health monitoring
   - Post-deployment smoke tests

3. **Monitoring Phase**
   - 60-minute automated monitoring
   - Real-time health check validation
   - Performance metric tracking
   - Automatic rollback on threshold violations

### 🔄 Rollback Capabilities

- **Automated rollback** triggered by monitoring thresholds
- **Manual emergency rollback** with verified backups
- **Post-rollback verification** with required health checks
- **Comprehensive rollback documentation** and procedures

## Quick Start

### Prerequisites

```bash
# Ensure all deployment scripts are executable
chmod +x scripts/deploy/*.sh

# Create required directories
mkdir -p backups monitor_logs premerge_artifacts
mkdir -p config/staging config/production
```

### Basic Deployment Workflow

```bash
# 1. Pre-deployment validation
./scripts/deploy/deploy_dryrun.sh --env production

# 2. Create backup
./scripts/deploy/backup.sh --env production

# 3. Run full pre-merge orchestration
./scripts/deploy/premerge_orchestration.sh --env production

# 4. Deploy (manual step - customize per environment)
# npm ci --production
# systemctl restart services

# 5. Post-deployment verification
./scripts/deploy/smoke_tests.sh --env production

# 6. Start monitoring with auto-rollback
LATEST_BACKUP=$(ls -1 backups/dhash_production_*.zip | sort -r | head -n1)
./scripts/deploy/monitor.sh --env production --auto-rollback --backup "$LATEST_BACKUP"
```

### Emergency Rollback

```bash
# Identify latest backup
LATEST_BACKUP=$(ls -1 backups/dhash_production_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"

# Execute emergency rollback
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

## GitHub Actions Integration

### Pre-merge Validation Workflow

The `.github/workflows/premerge-validation.yml` workflow provides:

- **Multi-platform validation** across Ubuntu, macOS, and Windows
- **Automated artifact generation** and upload
- **PR comments** with validation results and checklists
- **Security scanning** with vulnerability reporting
- **Comprehensive test execution** including dry-runs and smoke tests

### Branch Protection Requirements

Configure branch protection with these required status checks:
- `premerge-validation (ubuntu-latest)`
- `premerge-validation (macos-latest)`
- `premerge-validation (windows-latest)`
- `security-scan`

## Configuration

### Environment-Specific Settings

Create configuration directories for each environment:

```
config/
├── staging/
│   ├── app.json
│   └── database.json
└── production/
    ├── app.json
    └── database.json
```

### Script Configuration

All scripts support standard options:

```bash
# Common options across all scripts
--env staging|production    # Target environment (required)
--dry-run                  # Show what would be done without executing
--verbose                  # Enable detailed logging
--help                     # Show usage information
```

## Monitoring and Alerting

### Auto-Rollback Thresholds

The monitoring system uses conservative defaults:

- **Health Checks**: 3 consecutive failures trigger rollback
- **Success Rate**: <70% after ≥5 checks triggers rollback
- **Latency**: P95 >5000ms consistently triggers rollback
- **Error Rate**: >5% for 5+ consecutive checks triggers rollback

### Notification Integration

Use the provided templates for:

- **Slack**: Rich notifications with buttons and status updates
- **Microsoft Teams**: Adaptive cards with deployment status
- **Email**: Detailed text notifications for stakeholders

## Compliance and Auditing

### Lifecycle Management Export

```bash
# Export deployment data for compliance
./scripts/deploy/lcm_export.sh --env production --days 30

# Generates comprehensive audit trail including:
# - Deployment history
# - Backup records
# - Monitoring data
# - Test results
# - System configurations
```

### Artifact Retention

- **Backups**: 10 most recent per environment
- **Logs**: 30 days retention for monitoring logs
- **Artifacts**: 7 days retention for pre-merge artifacts
- **Exports**: Retained per compliance requirements

## Best Practices

### Pre-Deployment

1. **Always run dry-run validation first**
2. **Verify all required approvals obtained**
3. **Ensure backup is created and verified**
4. **Review monitoring thresholds for the deployment**

### During Deployment

1. **Monitor the deployment actively**
2. **Have rollback procedure ready**
3. **Communicate with stakeholders**
4. **Document any issues or deviations**

### Post-Deployment

1. **Wait for full 60-minute monitoring period**
2. **Verify all smoke tests pass**
3. **Update documentation as needed**
4. **Conduct retrospective if issues occurred**

## Troubleshooting

### Common Issues

**Script Permission Errors**:
```bash
chmod +x scripts/deploy/*.sh
```

**Missing Dependencies**:
```bash
npm ci
# Ensure curl, sha256sum, zip are available
```

**Health Check Failures**:
- Verify service is running: `systemctl status mobius-*`
- Check application logs: `journalctl -u mobius-* -f`
- Verify configuration: `ls -la config/$ENV/`

**Backup Verification Failures**:
- Check SHA256 file exists: `ls -la backups/*.sha256`
- Verify backup integrity: `sha256sum -c backup.sha256`

### Emergency Contacts

- **Deploy Operator**: @ops
- **SRE On-call**: @sre-oncall
- **Engineering Lead**: @eng-lead
- **Incident Commander**: @incident-commander

## Contributing

### Script Development

1. Follow existing script patterns and conventions
2. Include comprehensive error handling
3. Support dry-run mode for all operations
4. Add verbose logging options
5. Update documentation and runbooks

### Testing

```bash
# Test all scripts in dry-run mode
for script in scripts/deploy/*.sh; do
    echo "Testing $script"
    "$script" --env staging --dry-run
done
```

---

**Framework Version**: 1.0  
**Last Updated**: $(date --iso-8601)  
**Maintainer**: MOBIUS DevOps Team