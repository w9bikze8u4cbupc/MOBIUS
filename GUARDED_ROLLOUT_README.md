# dhash Guarded Rollout System

## Quick Start

This repository now includes a complete guarded rollout system for dhash deployments with automated monitoring, rollback capabilities, and comprehensive CI/CD integration.

### 🚀 Core Commands

```bash
# Deploy to production with 60-minute monitoring
./scripts/deploy_dhash.sh --env production

# Manual rollback if needed
./scripts/rollback_dhash.sh --env production --reason "performance-issue"

# Create backup before deployment
./scripts/backup_dhash.sh --env production

# Run database migrations
./scripts/migrate_dhash.sh --env production

# Test deployment system
./scripts/deploy_dhash.sh --dry-run --env staging
```

### 📋 Pre-Deployment Checklist

Before merging any PR with dhash changes:

1. **Run pre-merge validation**:
   ```bash
   # This runs automatically in GitHub Actions
   # Or manually trigger: .github/workflows/premerge.yml
   ```

2. **Verify required artifacts**:
   - [ ] `backups/*.zip` + corresponding `.sha256` files
   - [ ] `deploy-dryrun.log`, `migrate-dryrun.log`
   - [ ] `postdeploy-smoketests.log`, `test_logging.log`
   - [ ] Links to CI runs (Ubuntu, macOS, Windows)

3. **Get approvals**:
   - [ ] Deploy operator (@ops) sign-off
   - [ ] ≥2 approvers including ≥1 Ops/SRE
   - [ ] Branch protection rules satisfied

### 🎯 System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Deployment    │    │    Monitoring    │    │    Rollback     │
│                 │    │                  │    │                 │
│ • Pre-checks    │    │ • Health gates   │    │ • Auto-trigger  │
│ • Backup        │───▶│ • Quality gates  │───▶│ • Manual exec   │
│ • Migration     │    │ • 60min window   │    │ • Verification  │
│ • Service update│    │ • Notifications  │    │ • Recovery      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Notifications  │    │   Quality Gates  │    │   Smoke Tests   │
│                 │    │                  │    │                 │
│ • Slack/Discord │    │ • Health checks  │    │ • API tests     │
│ • Teams/Email   │    │ • Error rates    │    │ • DB tests      │
│ • Console       │    │ • Performance    │    │ • E2E tests     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### 📁 File Structure

```
├── .github/workflows/
│   └── premerge.yml              # Pre-merge validation workflow
├── scripts/
│   ├── backup_dhash.sh           # Backup creation with SHA256
│   ├── deploy_dhash.sh           # Main deployment script
│   ├── migrate_dhash.sh          # Database migration runner
│   ├── monitor_dhash.js          # 60-minute monitoring system
│   ├── rollback_dhash.sh         # Rollback with verification
│   ├── smoke_tests.sh            # Post-deployment testing
│   ├── validate_logging.js       # Logging system validation
│   └── notify.js                 # Zero-dependency notifications
├── migrations/                   # Database migration files
│   ├── 20240315_*_initial_dhash_schema.sql
│   ├── 20240320_*_add_hash_index.sql
│   └── 20240325_*_update_queue_table.sql
├── quality-gates-config.json     # Monitoring configuration
├── DEPLOYMENT_OPERATIONS_GUIDE.md # Complete operator manual
├── PR_BODY.md                    # PR template and checklist
└── backups/                      # Backup storage directory
```

### ⚙️ Configuration

Edit `quality-gates-config.json` to customize:

- **Monitoring duration**: Default 60 minutes
- **Quality gate thresholds**: Health checks, error rates, performance
- **Environment URLs**: Production, staging, canary
- **Notification settings**: Slack, Discord, Teams, email

### 🔔 Notifications

Set environment variables for notifications:

```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
export TEAMS_WEBHOOK_URL="https://outlook.office.com/webhook/..."
```

### 🧪 Testing

All scripts support `--dry-run` mode for safe testing:

```bash
# Test deployment without making changes
./scripts/deploy_dhash.sh --dry-run --env production

# Test backup creation
./scripts/backup_dhash.sh --dry-run --env production

# Test monitoring system
node scripts/monitor_dhash.js --env staging --dry-run --duration-minutes 1

# Test notifications
node scripts/notify.js --test --message "System test"
```

### 🚨 Emergency Procedures

#### Immediate Rollback
```bash
# Quick rollback to latest backup
./scripts/rollback_dhash.sh --env production --reason "emergency"

# Rollback to specific backup
./scripts/rollback_dhash.sh --env production \
  --backup backups/dhash_production_20240325_120000.zip \
  --reason "rollback-to-known-good"
```

#### Stop Monitoring (if needed)
```bash
# Find and stop monitoring process
pkill -f monitor_dhash
rm -f /tmp/dhash_monitor.pid
```

#### Manual Health Check
```bash
# Quick service health verification
curl -sf https://dhash.production.example.com/health || echo "Service down"

# Full smoke tests
./scripts/smoke_tests.sh --env production
```

### 📚 Documentation

- **[DEPLOYMENT_OPERATIONS_GUIDE.md](DEPLOYMENT_OPERATIONS_GUIDE.md)**: Complete operator manual
- **[PR_BODY.md](PR_BODY.md)**: PR template with full checklist
- **Script help**: Run any script with `--help` for detailed usage

### 🏗️ Integration with Existing CI/CD

This system integrates with your existing workflows:

1. **Existing CI** (`.github/workflows/ci.yml`) continues to run
2. **Pre-merge validation** (`.github/workflows/premerge.yml`) adds deployment checks
3. **Golden tests** continue unchanged
4. **Manual deployments** are replaced with guarded rollouts

### ✅ Success Criteria

A successful guarded rollout includes:

- ✅ Pre-merge validation passes
- ✅ Backup created and verified
- ✅ Deployment completes without errors
- ✅ Post-deployment smoke tests pass
- ✅ 60-minute monitoring period completes
- ✅ No quality gate violations
- ✅ Service remains healthy

### 🔧 Troubleshooting

#### Common Issues

**Deployment fails during pre-checks**:
```bash
# Check service connectivity
curl -v https://dhash.staging.example.com/health

# Verify configuration
node -e "console.log(require('./quality-gates-config.json'))"
```

**Monitoring not starting**:
```bash
# Check for existing processes
ps aux | grep monitor_dhash

# Check PID file
ls -la /tmp/dhash_monitor.pid

# Start manually
node scripts/monitor_dhash.js --env production &
```

**Backup verification fails**:
```bash
# List available backups
ls -la backups/dhash_*.zip

# Verify checksum manually
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
```

### 📞 Support

- **Deploy operator**: @ops
- **Media engineering**: @media-eng  
- **Emergency**: Follow standard incident response procedures
- **Documentation**: See DEPLOYMENT_OPERATIONS_GUIDE.md

---

**Ready to deploy?** Start with `./scripts/deploy_dhash.sh --dry-run --env staging` to test the system!