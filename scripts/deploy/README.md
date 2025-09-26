# MOBIUS Deployment Framework

A complete deployment readiness framework providing modular deployment scripts, multi-OS pre-merge CI pipeline, production runbooks, and conservative T+60 monitoring with auto-rollback capabilities.

## 🚀 Quick Start

### Pre-merge Validation

1. **Create a pull request** - The framework automatically triggers validation
2. **Review CI results** - Multi-OS validation runs across Ubuntu, macOS, Windows
3. **Get approvals** - Require ≥2 reviewers including ≥1 Ops/SRE
4. **Deploy operator sign-off** - Get @ops team approval
5. **Merge** - Use rebase-and-merge for clean history

### Deployment Commands

```bash
# Create backup
./scripts/deploy/backup_dhash.sh --env production

# Run deployment dry-run
./scripts/deploy/deploy_dryrun.sh --env production

# Execute deployment (replace with your actual deployment process)
# Your deployment commands here...

# Start post-deployment monitoring
MONITOR_DURATION=3600 AUTO_ROLLBACK=true ./scripts/deploy/monitor.sh --env production &

# Run smoke tests
./scripts/deploy/smoke_tests.sh --env production
```

### Emergency Rollback

```bash
# Find latest backup
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)

# Verify and execute rollback
sha256sum -c "${LATEST_BACKUP}.sha256"
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

## 📁 Framework Structure

```
scripts/deploy/           # Deployment scripts
├── backup_dhash.sh       # SHA256-verified backups
├── deploy_dryrun.sh      # Deployment simulation
├── migration_dryrun.sh   # Migration analysis
├── smoke_tests.sh        # Post-deployment tests
├── monitor.sh            # Health monitoring with auto-rollback
├── rollback_dhash.sh     # Verified rollback procedures
├── lcm_export.sh         # Lifecycle management exports
└── premerge_orchestration.sh # Orchestrates all pre-merge checks

.github/workflows/
└── premerge-validation.yml # Multi-OS CI pipeline

runbooks/                  # Operational runbooks
├── deployment_runbook.md  # Step-by-step deployment guide
└── rollback_runbook.md    # Emergency rollback procedures

notifications/             # Communication templates
├── slack_templates.json   # Slack notifications
├── teams_templates.json   # Microsoft Teams notifications
└── email_templates.md     # Email templates
```

## 🔐 Safety Features

### Conservative Auto-rollback Thresholds

- **3 consecutive health check failures** → trigger rollback
- **Success rate < 70%** after ≥5 checks → trigger rollback  
- **p95 latency > 5000ms** consistently → trigger rollback
- **Error rate > 5%** → trigger rollback

### SHA256-verified Backups

All backups include SHA256 checksums for integrity verification:

```bash
# Backup verification
sha256sum -c backup_file.zip.sha256
```

### Multi-layer Validation

1. **Pre-merge CI**: Multi-OS validation, dependency scanning, vulnerability checks
2. **Dry-run validation**: Deployment simulation without changes
3. **Migration analysis**: Database and configuration change assessment  
4. **Post-deployment monitoring**: 60-minute health monitoring window

## 🛠️ Deployment Scripts

### backup_dhash.sh

Creates SHA256-verified backups of critical application components.

```bash
./scripts/deploy/backup_dhash.sh --env production --backup-dir /custom/path
```

**Features:**
- Includes application code, dependencies, configuration, tests
- Generates SHA256 checksums for integrity verification
- Creates backup metadata with git info and environment details
- Supports custom backup directories

### deploy_dryrun.sh

Simulates deployment process without making actual changes.

```bash
./scripts/deploy/deploy_dryrun.sh --env production --log-file deploy-dryrun.log
```

**Validation phases:**
1. Pre-deployment checks (Node.js, npm, package integrity)
2. Dependency analysis (security vulnerabilities, peer dependencies)
3. Build validation (TypeScript compilation, npm scripts)
4. Configuration validation (environment-specific settings)
5. Service health simulation
6. Risk assessment

### migration_dryrun.sh

Analyzes database and configuration migrations without execution.

```bash
./scripts/deploy/migration_dryrun.sh --env production --log-file migration-dryrun.log
```

**Analysis includes:**
- Migration script discovery and validation
- Dependency change analysis  
- Configuration schema changes
- Database migration simulation
- Rollback procedure preparation
- Risk assessment

### smoke_tests.sh

Comprehensive post-deployment verification tests.

```bash
./scripts/deploy/smoke_tests.sh --env production --api-url https://api.example.com
```

**Test categories:**
- Basic system health (Node.js, npm, package integrity)
- API health checks (endpoints, response times)
- Core functionality (application-specific tests)
- Data processing (golden test validation)
- Performance and resource validation
- Environment-specific tests

### monitor.sh

Health monitoring with automatic rollback capabilities.

```bash
# 60-minute monitoring with auto-rollback
MONITOR_DURATION=3600 AUTO_ROLLBACK=true ./scripts/deploy/monitor.sh --env production &
```

**Monitoring features:**
- Configurable monitoring duration (default: 60 minutes)
- Health check intervals (default: 30 seconds)
- Conservative auto-rollback thresholds
- Detailed metrics logging
- Real-time status reporting

### rollback_dhash.sh

Emergency rollback using SHA256-verified backups.

```bash
./scripts/deploy/rollback_dhash.sh --backup backup_file.zip --env production --force
```

**Rollback process:**
1. Backup integrity verification
2. Pre-rollback safety checks  
3. Emergency backup of current state
4. File restoration from verified backup
5. Dependency restoration
6. Post-rollback verification
7. Health check validation

## 🚦 CI/CD Pipeline

### Pre-merge Validation Workflow

The `.github/workflows/premerge-validation.yml` workflow provides:

- **Multi-OS validation** (Ubuntu, macOS, Windows)
- **Vulnerability scanning** with npm audit
- **Dependency validation** 
- **Backup creation and verification**
- **Deployment dry-run execution**
- **Migration analysis**
- **Smoke test execution**
- **Artifact uploading** for review
- **Automated PR comments** with validation results

### Workflow Triggers

- Pull request events (opened, synchronize, reopened, ready_for_review)
- Manual workflow dispatch
- Draft PRs are automatically skipped

### Artifact Collection

Each workflow run uploads:
- Validation logs (deploy-dryrun.log, migration-dryrun.log, etc.)
- Backup checksums for verification
- System information and metrics
- Vulnerability scan reports
- Test results and smoke test outputs

## 📖 Runbooks

### Deployment Runbook

Comprehensive deployment procedures in `runbooks/deployment_runbook.md`:

- Pre-deployment validation checklist
- Step-by-step deployment execution
- Monitoring and health validation
- Success criteria and completion steps
- Emergency contacts and escalation

### Rollback Runbook  

Emergency rollback procedures in `runbooks/rollback_runbook.md`:

- Automatic vs manual rollback criteria
- Emergency response procedures (0-5 minutes)
- Rollback execution phases
- Post-rollback verification
- Incident response and escalation

## 📢 Notifications

### Supported Channels

- **Slack**: Rich message cards with deployment status
- **Microsoft Teams**: Actionable message cards
- **Email**: Detailed text notifications for stakeholders

### Template Variables

All templates support dynamic content:
```
{{environment}} - staging/production
{{timestamp}} - Current timestamp
{{git_commit}} - Git commit hash
{{deploy_operator}} - Person executing deployment
{{status}} - success/failed/in-progress
{{duration}} - Deployment duration
```

### Integration Examples

```bash
# Bash integration
sed -e "s/{{environment}}/$ENV/g" \
    -e "s/{{timestamp}}/$(date)/g" \
    notifications/slack_templates.json

# Node.js integration  
const template = fs.readFileSync('notifications/slack_templates.json', 'utf8');
const message = template.replace('{{environment}}', process.env.ENV);
```

## 🔒 Security & Compliance

### Branch Protection

Recommended GitHub branch protection rules:

- Require pull request reviews before merging (≥2 reviewers)
- Require review from code owners (Ops/SRE team)
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Require conversation resolution before merging
- Restrict pushes that create files larger than 100MB

### Vulnerability Scanning

Automated security scanning in CI:
- npm audit for dependency vulnerabilities
- Blocks deployment on critical vulnerabilities
- Reports high-severity issues for review

### Audit Trail

Complete audit trail maintained:
- Deployment timestamps and operators
- Git commit and branch information  
- Backup file integrity verification
- Health monitoring results
- Rollback activities and reasons

## ⚙️ Configuration

### Environment Variables

```bash
# Deployment configuration
ENV=staging|production
API_BASE_URL=http://localhost:5001
MONITOR_DURATION=3600  # 60 minutes
AUTO_ROLLBACK=true

# Monitoring thresholds (conservative defaults)
CONSECUTIVE_FAILURE_THRESHOLD=3
SUCCESS_RATE_THRESHOLD=0.70
MAX_LATENCY_THRESHOLD=5000
ERROR_RATE_THRESHOLD=0.05
```

### Customization

Scripts support extensive customization via command-line arguments:

```bash
# Custom monitoring duration and thresholds
./scripts/deploy/monitor.sh --duration 7200 --check-interval 15

# Custom backup location
./scripts/deploy/backup_dhash.sh --backup-dir /mnt/backup/mobius

# Custom log files and API endpoints
./scripts/deploy/smoke_tests.sh --log-file custom.log --api-url https://custom-api.com
```

## 🚨 Troubleshooting

### Common Issues

**Backup integrity verification fails:**
```bash
# Re-create backup
./scripts/deploy/backup_dhash.sh --env production
```

**Deployment dry-run warnings:**
```bash
# Review warnings in deploy-dryrun.log
# Address dependency or configuration issues before deployment
```

**Smoke tests timeout:**
```bash
# Increase timeout for slow environments
./scripts/deploy/smoke_tests.sh --timeout 60
```

**Monitoring false positives:**
```bash
# Adjust monitoring thresholds
CONSECUTIVE_FAILURE_THRESHOLD=5 ./scripts/deploy/monitor.sh
```

### Emergency Procedures

**Complete deployment failure:**
1. Immediate rollback using latest verified backup
2. Escalate to senior engineering team  
3. Preserve all logs and system state
4. Follow incident response procedures

**Rollback failure:**
1. Escalate immediately to senior engineering
2. Activate disaster recovery procedures
3. Communicate impact to stakeholders
4. Implement manual recovery procedures

## 📋 Deployment Checklist

### Pre-deployment

- [ ] All pre-merge validation checks passed
- [ ] CI artifacts uploaded and reviewed
- [ ] Backup files (.zip and .sha256) attached to PR
- [ ] Deploy-dryrun.log reviewed
- [ ] Migration-dryrun.log reviewed  
- [ ] Postdeploy-smoketests.log reviewed
- [ ] ≥2 approvers including ≥1 Ops/SRE
- [ ] Deploy operator (@ops) sign-off obtained
- [ ] Branch protection contexts satisfied

### Post-deployment

- [ ] 3 consecutive OK health checks verified
- [ ] 60-minute monitoring window completed without rollback
- [ ] Manual functional testing completed
- [ ] Performance metrics within expected ranges
- [ ] No critical errors in application logs
- [ ] Stakeholders notified of successful deployment

## 🤝 Contributing

### Adding New Scripts

1. Create script in `scripts/deploy/`
2. Make executable: `chmod +x script_name.sh`
3. Add help documentation (`--help` flag)
4. Include error handling and logging
5. Update this README

### Modifying Monitoring Thresholds

Update conservative defaults in `scripts/deploy/monitor.sh`:
```bash
# Conservative auto-rollback thresholds
CONSECUTIVE_FAILURE_THRESHOLD=3
SUCCESS_RATE_THRESHOLD=0.70
MAX_LATENCY_THRESHOLD=5000
ERROR_RATE_THRESHOLD=0.05
```

### Adding Notification Channels

1. Create template file in `notifications/`
2. Include template variables support
3. Add usage examples to `notifications/README.md`
4. Update integration documentation

## 📚 Related Documentation

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Node.js Deployment Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp)
- [SHA256 Verification Guide](https://en.wikipedia.org/wiki/SHA-2)
- [Incident Response Procedures](./incident-response/)

---

**Version**: 1.0  
**Last Updated**: 2024-09-26  
**Maintained By**: MOBIUS Operations Team