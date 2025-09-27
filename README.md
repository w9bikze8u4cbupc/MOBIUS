# MOBIUS - Game Tutorial Generation with DHash Guarded Rollout

A comprehensive pipeline for generating game tutorial videos from structured game rules, now featuring enterprise-grade deployment automation with guarded rollout capabilities for the dhash component.

## 🚀 Quick Start - DHash Guarded Rollout

### Production Deployment
```bash
# Full production deployment with all safety features
./quick-deploy.sh production

# This automatically includes:
# - Pre-deployment backup with SHA256 verification
# - Health checks and environment validation  
# - 60-minute post-deployment monitoring
# - Quality gates with auto-rollback
# - Multi-channel notifications
# - Comprehensive smoke tests
```

### Emergency Rollback
```bash
# Find and verify latest backup
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"

# Execute emergency rollback
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force
```

## 🛡️ Guarded Rollout Features

### ✅ Complete Implementation
- **Deployment automation** with environment validation and health checks
- **SHA256-verified backups** with automated retention policies  
- **60-minute monitoring** with adaptive polling (30s → 120s intervals)
- **Configurable quality gates** with automatic rollback triggers
- **Multi-channel notifications** (Slack/Teams/Discord/Email) with fallback
- **Cross-platform CI validation** (Ubuntu/macOS/Windows)
- **Comprehensive testing** (smoke tests, logging validation, integration tests)
- **Complete documentation** with operator runbooks and troubleshooting guides

### 🎯 Quality Gates (Production Defaults)
- **Health failures**: >2 consecutive → auto-rollback
- **Extraction failure rate**: >5% over 10 minutes → auto-rollback  
- **P95 hash time**: >2000ms over 15 minutes → auto-rollback
- **Queue length**: >1000 items → auto-rollback

## �� Project Structure

```
MOBIUS/
├── scripts/
│   ├── backup_dhash.sh          # Backup creation with SHA256 verification
│   ├── deploy_dhash.sh          # Deployment orchestrator 
│   ├── migrate_dhash.sh         # Database migration runner
│   ├── rollback_dhash.sh        # Verified rollback with validation
│   ├── monitor_dhash.js         # 60-minute monitoring with quality gates
│   ├── notify.js                # Multi-channel notification system
│   ├── smoke_tests.sh           # Multi-tier smoke tests
│   ├── validate_logging.js      # Logging validation with redaction
│   └── deploy/
│       └── deploy-notify.js     # Deployment-specific notifications
├── .github/workflows/
│   └── premerge.yml            # Cross-platform CI validation
├── templates/
│   ├── PR_BODY.md              # Standardized PR template
│   └── notifications/          # Notification templates
├── quality-gates-config.json   # Quality gate thresholds per environment
├── quick-deploy.sh             # Quick deployment wrapper
├── GUARDED_ROLLOUT_README.md   # Quick start guide
└── DEPLOYMENT_OPERATIONS_GUIDE.md  # Complete operations manual
```

## 🔧 System Requirements

- **Node.js** 18+ (for monitoring and notifications)
- **Bash** 4+ (for deployment scripts)
- **Basic tools**: `zip`, `unzip`, `sha256sum`, `bc`
- **CI/CD**: GitHub Actions (cross-platform validation)

## 🚀 Usage Examples

### Development/Staging
```bash
# Staging deployment
./quick-deploy.sh staging

# Development with custom options
./quick-deploy.sh development --skip-monitoring

# Dry-run testing
./quick-deploy.sh production --dry-run
```

### Manual Step-by-Step
```bash
# 1. Create backup
./scripts/backup_dhash.sh --env production

# 2. Run migrations  
./scripts/migrate_dhash.sh --env production --dry-run

# 3. Deploy with monitoring
./scripts/deploy_dhash.sh --env production --backup-first

# 4. Validate with smoke tests
./scripts/smoke_tests.sh --env production --tier all
```

### Monitoring & Notifications
```bash
# Manual monitoring
node scripts/monitor_dhash.js --env production

# Send custom notification  
node scripts/notify.js --type deploy --env production --message "Custom deployment update"

# Validate logging system
node scripts/validate_logging.js --env production
```

## 🔐 Security Features

- **No secrets in code** - all webhooks/tokens via environment variables
- **SHA256 verification** for all backups and artifacts  
- **Pre-rollback snapshots** before any restoration
- **Audit logging** for all notifications and actions
- **Cross-platform security validation** in CI

## 📊 CI/CD Integration

The system includes comprehensive GitHub Actions workflows:

- **Pre-merge validation** across Ubuntu/macOS/Windows
- **Artifact generation** and validation
- **Security scanning** and dependency checks  
- **Integration testing** with full workflow simulation
- **Automated PR comments** with deployment status

## 📚 Documentation

- **[GUARDED_ROLLOUT_README.md](GUARDED_ROLLOUT_README.md)** - Quick start guide
- **[DEPLOYMENT_OPERATIONS_GUIDE.md](DEPLOYMENT_OPERATIONS_GUIDE.md)** - Complete operations manual
- **[templates/PR_BODY.md](templates/PR_BODY.md)** - PR template for deployments

## 🆘 Support & Troubleshooting

### Quick Diagnostics
```bash
# Test all components (dry-run)
./scripts/backup_dhash.sh --env staging --dry-run
./scripts/deploy_dhash.sh --env staging --dry-run  
./scripts/smoke_tests.sh --env staging --dry-run
node scripts/notify.js --type test --env staging --message "Test" --dry-run
```

### Emergency Contacts
- **Deploy Operator**: @ops
- **SRE On-Call**: @sre-oncall  
- **Incident Commander**: @incident-lead
- **Media Engineering**: @media-eng

## 🎮 Original Game Tutorial Features

This project also includes the original game tutorial generation capabilities:

- Video generation from game rules
- Multi-language support
- Component extraction and analysis
- Golden file testing for video validation

See the existing scripts in `scripts/` for golden file generation and validation.

---

## 🏗️ Architecture

The guarded rollout system follows enterprise deployment best practices:

1. **Safety First**: All operations support dry-run mode
2. **Verification**: SHA256 checksums for all artifacts
3. **Monitoring**: Adaptive polling with quality gates
4. **Notifications**: Multi-channel with fallback options
5. **Documentation**: Complete operator guides and runbooks
6. **Testing**: Cross-platform validation and integration tests

Built for production reliability with zero-downtime deployment capabilities.
