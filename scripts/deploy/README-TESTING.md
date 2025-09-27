# MOBIUS Mock Deployment Scripts - Testing Guide

This directory contains cross-platform mock scripts for testing MOBIUS deployment workflows on Windows, Linux, and macOS without affecting production systems.

## Overview

The mock scripts simulate the complete deployment lifecycle:
- **backup**: Data and configuration backup operations
- **deploy-wrapper**: Main deployment orchestration
- **notify**: Notification dispatch (Slack, Teams, Email, Webhook)
- **rollback**: Rollback procedures for failed deployments
- **monitor**: System monitoring and health checks

## Quick Start

### Windows PowerShell
```powershell
# Navigate to repository
cd MOBIUS

# Run full deployment simulation
.\scripts\deploy\deploy-wrapper.ps1 -DryRun -Verbose

# Individual script tests
.\scripts\deploy\backup.ps1 -DryRun -Verbose
.\scripts\deploy\notify.ps1 -Test -Verbose
.\scripts\deploy\monitor.ps1 -Status -Verbose
```

### Windows Git Bash
```bash
# Navigate to repository  
cd MOBIUS

# Run full deployment simulation
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose

# Individual script tests
./scripts/deploy/backup.sh --dry-run --verbose
./scripts/deploy/notify.sh --test --verbose
./scripts/deploy/monitor.sh --status --verbose
```

### Linux / macOS
```bash
# Navigate to repository
cd MOBIUS

# Run full deployment simulation
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose

# Individual script tests
./scripts/deploy/backup.sh --dry-run --verbose
./scripts/deploy/notify.sh --test --verbose
./scripts/deploy/monitor.sh --status --verbose
```

## Script Details

### 1. Backup Script (`backup.sh` / `backup.ps1`)

Simulates backup operations for database, application files, and configuration.

**Features:**
- Database backup simulation
- Application file backup
- Configuration backup
- Backup manifest generation
- Cross-platform compatibility

**Usage Examples:**
```bash
# Bash version
./scripts/deploy/backup.sh --dry-run --type full --verbose
./scripts/deploy/backup.sh --backup-dir /tmp/test-backup

# PowerShell version
.\scripts\deploy\backup.ps1 -DryRun -Type full -Verbose
.\scripts\deploy\backup.ps1 -BackupDir "C:\temp\test-backup"
```

### 2. Deploy Wrapper (`deploy-wrapper.sh` / `deploy-wrapper.ps1`)

Main deployment orchestration script that coordinates all deployment phases.

**Phases:**
1. Pre-deployment checks
2. Backup (unless skipped)
3. Application deployment
4. Post-deployment verification
5. Monitoring setup
6. Notification dispatch

**Usage Examples:**
```bash
# Bash version
./scripts/deploy/deploy-wrapper.sh --dry-run --version "2.1.0" --environment staging
./scripts/deploy/deploy-wrapper.sh --skip-backup --version "hotfix-1.2.1"

# PowerShell version
.\scripts\deploy\deploy-wrapper.ps1 -DryRun -Version "2.1.0" -Environment "staging"
.\scripts\deploy\deploy-wrapper.ps1 -SkipBackup -Version "hotfix-1.2.1"
```

### 3. Notification Script (`notify.sh` / `notify.ps1`)

Simulates notification dispatch to various channels.

**Supported Types:**
- **slack**: Mock Slack webhook notifications
- **teams**: Mock Microsoft Teams notifications
- **email**: Mock email notifications
- **webhook**: Generic webhook notifications

**Usage Examples:**
```bash
# Bash version
./scripts/deploy/notify.sh --test --type slack --verbose
./scripts/deploy/notify.sh --message "Deployment completed" --channel alerts --type teams

# PowerShell version
.\scripts\deploy\notify.ps1 -Test -Type slack -Verbose
.\scripts\deploy\notify.ps1 -Message "Deployment completed" -Channel "alerts" -Type teams
```

### 4. Rollback Script (`rollback.sh` / `rollback.ps1`)

Simulates rollback procedures for failed deployments.

**Phases:**
1. Pre-rollback validation
2. Service shutdown
3. Database restore
4. Application restore
5. Configuration restore
6. Service restart
7. Post-rollback verification

**Usage Examples:**
```bash
# Bash version
./scripts/deploy/rollback.sh --dry-run --reason "Critical bug found" --verbose
./scripts/deploy/rollback.sh --target-version "1.2.3" --force

# PowerShell version
.\scripts\deploy\rollback.ps1 -DryRun -Reason "Critical bug found" -Verbose
.\scripts\deploy\rollback.ps1 -TargetVersion "1.2.3" -Force
```

### 5. Monitoring Script (`monitor.sh` / `monitor.ps1`)

Simulates system monitoring and health checks.

**Metrics:**
- CPU usage
- Memory usage
- Disk usage
- Network connectivity
- Application health
- Database connectivity

**Usage Examples:**
```bash
# Bash version
./scripts/deploy/monitor.sh --setup --verbose
./scripts/deploy/monitor.sh --status
./scripts/deploy/monitor.sh --duration 300 --interval 10

# PowerShell version
.\scripts\deploy\monitor.ps1 -Setup -Verbose
.\scripts\deploy\monitor.ps1 -Status
.\scripts\deploy\monitor.ps1 -Duration 300 -Interval 10
```

## Testing Scenarios

### Complete Deployment Test
Test the entire deployment workflow:

```bash
# 1. Setup monitoring
./scripts/deploy/monitor.sh --setup

# 2. Run deployment
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose --version "test-1.0"

# 3. Check status
./scripts/deploy/monitor.sh --status

# 4. Test notifications
./scripts/deploy/notify.sh --test --type slack
```

### Rollback Test
Test rollback procedures:

```bash
# 1. Create mock backup
./scripts/deploy/backup.sh --dry-run --type full

# 2. Simulate rollback
./scripts/deploy/rollback.sh --dry-run --reason "Testing rollback" --verbose

# 3. Verify system status
./scripts/deploy/monitor.sh --status
```

### Cross-Platform Validation
Ensure scripts work across different environments:

```bash
# Test on different shells
bash ./scripts/deploy/deploy-wrapper.sh --dry-run
sh ./scripts/deploy/deploy-wrapper.sh --dry-run

# Test with different parameters
./scripts/deploy/backup.sh --help
./scripts/deploy/notify.sh --help
```

## Output Locations

Scripts generate output in the following locations:

### Temporary Files (Safe to delete)
- `/tmp/mobius_*_notification_*.json` (Linux/macOS)
- `%TEMP%\mobius_*_notification_*.json` (Windows)

### Log Files
- `logs/monitoring/` - Monitoring logs and metrics
- `rollback_log_*.txt` - Rollback operation logs
- `deployment_status.txt` - Deployment status file

### Mock Backup Files
- `./backups/` - Mock backup files (when not in dry-run mode)

## Troubleshooting

### Permission Issues (Linux/macOS)
```bash
# Make scripts executable
chmod +x scripts/deploy/*.sh

# Check permissions
ls -la scripts/deploy/
```

### PowerShell Execution Policy (Windows)
```powershell
# Check current policy
Get-ExecutionPolicy

# Allow local scripts (if needed)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Missing Dependencies
```bash
# Check for required tools
which bash
which node
which npm

# Windows PowerShell
Get-Command bash -ErrorAction SilentlyContinue
Get-Command node -ErrorAction SilentlyContinue
```

### Script Not Found Errors
```bash
# Ensure you're in the correct directory
pwd
ls scripts/deploy/

# Use absolute paths if needed
/full/path/to/MOBIUS/scripts/deploy/backup.sh --dry-run
```

## Integration with CI/CD

The mock scripts can be integrated into CI/CD pipelines for testing:

### GitHub Actions Example
```yaml
name: Test Deployment Scripts
on: [push, pull_request]

jobs:
  test-deployment:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Test deployment wrapper
        run: ./scripts/deploy/deploy-wrapper.sh --dry-run --verbose
      - name: Test rollback
        run: ./scripts/deploy/rollback.sh --dry-run --force
```

### Jenkins Pipeline Example
```groovy
pipeline {
    agent any
    stages {
        stage('Test Deployment') {
            steps {
                sh './scripts/deploy/deploy-wrapper.sh --dry-run --verbose'
                sh './scripts/deploy/monitor.sh --status'
            }
        }
    }
}
```

## Security Considerations

- **Dry-run by default**: Scripts use `--dry-run` mode to prevent actual changes
- **No production access**: Mock scripts don't connect to production systems
- **Local testing only**: Designed for local development and testing
- **No sensitive data**: Scripts don't handle real credentials or sensitive information

## Contributing

When adding new mock scripts:

1. Follow the established naming convention
2. Include both bash and PowerShell versions
3. Add comprehensive help documentation
4. Include dry-run functionality
5. Add cross-platform compatibility notes
6. Update this README with usage examples

## Support

For issues with mock scripts:
1. Check script help: `./script.sh --help`
2. Run with verbose logging: `--verbose` or `-Verbose`
3. Verify permissions and dependencies
4. Check output in log directories
5. Create GitHub issue with full error details

---

**Note**: These are mock scripts for testing only. Do not use these scripts in production environments. Production deployment scripts should be maintained separately and follow your organization's security and deployment policies.