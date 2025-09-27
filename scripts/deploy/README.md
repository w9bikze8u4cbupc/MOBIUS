# MOBIUS Deployment Scripts

## Overview

This directory contains cross-platform deployment scripts for the MOBIUS tutorial generator. All scripts support both Unix/Linux (bash) and Windows (PowerShell) environments.

## Scripts

### Core Deployment
- `deploy-wrapper.sh` / `deploy-wrapper.ps1` - Main deployment orchestration script
- `notify-mock.sh` / `notify-mock.ps1` - Mock notification system (Slack, email)

### Support Scripts
- `backup-mock.sh` / `backup-mock.ps1` - Mock backup operations
- `rollback-mock.sh` / `rollback-mock.ps1` - Mock rollback procedures
- `monitor-mock.sh` / `monitor-mock.ps1` - Mock system monitoring

## Usage Examples

### Unix/Linux (Bash)

```bash
# Make scripts executable
chmod +x scripts/deploy/*.sh

# Run deployment (dry-run mode)
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose

# Test notifications
./scripts/deploy/notify-mock.sh --test --type slack

# Verify output files
sha256sum out/preview.mp4
```

### Windows (PowerShell)

```powershell
# Run deployment (dry-run mode)
.\scripts\deploy\deploy-wrapper.ps1 -DryRun -VerboseOutput

# Test notifications
.\scripts\deploy\notify-mock.ps1 -Test -Type slack

# Verify output files
Get-FileHash -Path .\out\preview.mp4 -Algorithm SHA256
Get-ChildItem .\out\ -Filter 'preview*' | Select-Object Name, Length, LastWriteTime
```

## Command Line Options

### Common Flags

#### Bash Scripts
- `--dry-run` - Execute in simulation mode (no actual changes)
- `--verbose` - Enable detailed logging
- `--help` - Show usage information
- `--config FILE` - Specify configuration file

#### PowerShell Scripts
- `-DryRun` - Execute in simulation mode
- `-VerboseOutput` - Enable detailed logging  
- `-Help` - Show usage information
- `-ConfigFile FILE` - Specify configuration file

## Configuration

### Environment Variables

```bash
# Required
export MOBIUS_OUTPUT_DIR="./out"
export MOBIUS_ENV="development"  # development, staging, production

# Optional
export MOBIUS_BACKUP_DIR="./backups"
export MOBIUS_LOG_LEVEL="info"    # debug, info, warn, error
export MOBIUS_NOTIFICATION_URL="https://hooks.slack.com/..."
```

### Configuration File Example

```json
{
  "deployment": {
    "outputDir": "./out",
    "backupDir": "./backups",
    "environment": "development",
    "notifications": {
      "enabled": true,
      "channels": ["slack", "email"],
      "slackWebhook": "https://hooks.slack.com/...",
      "emailRecipients": ["admin@example.com"]
    },
    "monitoring": {
      "enabled": true,
      "healthCheckUrl": "http://localhost:5001/health",
      "alertThresholds": {
        "diskUsage": 85,
        "memoryUsage": 80
      }
    }
  }
}
```

## Testing the Infrastructure

### Quick Test Commands

```bash
# Unix/Linux full test
chmod +x scripts/deploy/*.sh
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose
ls -la out/
sha256sum out/preview.mp4 2>/dev/null || echo "No preview file yet"
./scripts/deploy/notify-mock.sh --test --type slack

# Windows PowerShell full test
.\scripts\deploy\deploy-wrapper.ps1 -DryRun -VerboseOutput
Get-ChildItem .\out\ -ErrorAction SilentlyContinue
Get-FileHash -Path .\out\preview.mp4 -Algorithm SHA256 -ErrorAction SilentlyContinue
.\scripts\deploy\notify-mock.ps1 -Test -Type slack
```

### Integration Testing

The scripts are designed to work with the MOBIUS pipeline:

```bash
# Generate content and deploy
npm run render:proxy
./scripts/deploy/deploy-wrapper.sh --verbose

# With notifications
./scripts/deploy/deploy-wrapper.sh --verbose --notify
```

## Mock Systems

All scripts in this directory are "mock" implementations designed for:
- **Development testing** - Safe execution without real infrastructure
- **CI/CD validation** - Automated testing in build pipelines  
- **Cross-platform verification** - Ensuring compatibility across environments
- **Integration testing** - Validating script interfaces and data flow

### Real Implementation Notes

For production deployment, replace these mock scripts with real implementations that:
- Connect to actual notification services (Slack API, SMTP servers)
- Perform real backup operations to cloud storage or network shares
- Implement actual rollback procedures with version control
- Monitor real system metrics and application health

## Error Handling

All scripts implement comprehensive error handling:
- Exit codes indicate success (0) or failure (non-zero)
- Detailed error messages for troubleshooting
- Graceful fallbacks for optional operations
- Logging of all operations for audit trails

## Security Considerations

- Scripts validate input parameters
- Sensitive information should be passed via environment variables
- File permissions are checked before operations
- Network operations include timeout and retry logic

---

For detailed usage of individual scripts, run with `--help` or `-Help` flag.