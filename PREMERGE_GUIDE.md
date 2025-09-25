# Pre-merge Automation Guide

This repository includes automated pre-merge validation to ensure code quality and deployment readiness before merging pull requests.

## 🚀 Quick Start

### Automatic Validation (Recommended)

The pre-merge validation runs automatically on all pull requests. No action needed!

1. **Create a pull request** - The validation workflow starts automatically
2. **Wait for completion** - Check the PR for the validation results comment
3. **Review artifacts** - Download logs and backups from the workflow run if needed
4. **Fix issues** - If validation fails, fix the issues and push changes to re-trigger

### Manual Validation (Local Testing)

You can run pre-merge validation locally before creating a PR:

```bash
# Basic run with defaults
./scripts/premerge_run.sh

# Custom configuration
ARTIFACT_DIR=my_artifacts AUTO_CREATE_PR=false ./scripts/premerge_run.sh

# Skip smoke tests (not recommended)
SKIP_SMOKE=true ./scripts/premerge_run.sh
```

## 📋 What Gets Validated

The pre-merge workflow performs these checks:

### 1. Git State Validation ✅
- Ensures working tree is clean (no uncommitted changes)
- Verifies the branch exists and can be rebased
- Fetches latest changes from origin

### 2. Backup Creation & Verification ✅
- Creates timestamped ZIP backup of the codebase
- Generates SHA256 checksum for integrity verification
- Tests backup integrity before proceeding

### 3. Deploy Dry-run ✅
- Validates deployment prerequisites (Node.js, FFmpeg, Python)
- Checks project structure and dependencies
- Simulates staging deployment without making changes
- Captures deployment logs for review

### 4. Migration Dry-run ✅
- Validates database migration scripts
- Checks for pending migrations
- Simulates migration execution without applying changes
- Logs migration plan and potential issues

### 5. Logging Validation ✅
- Tests all log levels (debug, info, warn, error)
- Validates log message formatting
- Checks video processing specific logging
- Ensures log structure compliance

### 6. Smoke Tests ✅
- Verifies Node.js and system dependencies
- Checks project structure integrity
- Tests package dependencies
- Validates FFmpeg video processing capabilities
- Verifies golden test infrastructure

### 7. Artifact Collection ✅
- Collects all logs and reports
- Creates metadata file with run information
- Prepares artifacts for CI upload or PR attachment

## 🎛️ Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HEAD_BRANCH` | current branch | Branch to validate |
| `BASE_BRANCH` | `origin/main` | Base branch for rebase check |
| `BACKUP_DIR` | `backups` | Directory for backup files |
| `ARTIFACT_DIR` | `premerge_artifacts` | Directory for collected artifacts |
| `DRY_RUN_ENV` | `staging` | Environment for deploy dry-run |
| `LOG_DIR` | `logs` | Directory for log files |
| `AUTO_CREATE_PR` | `false` | Whether to auto-create PR (not recommended) |
| `CREATE_PR_CMD_FILE` | `CREATE_PR_COMMAND.txt` | File with PR creation commands |
| `CI_UPLOAD_CMD` | (none) | Command to upload artifacts to CI |
| `SKIP_SMOKE` | `false` | Skip smoke tests (not recommended) |

### GitHub Actions Configuration

You can customize the workflow behavior:

```yaml
# Manual trigger with options
workflow_dispatch:
  inputs:
    skip_smoke:
      description: 'Skip smoke tests (not recommended)'
      default: 'false'
      type: boolean
```

## 📁 Generated Artifacts

After validation, these artifacts are created:

### Backup Files
- `dhash_TIMESTAMP.zip` - Complete codebase backup
- `dhash_TIMESTAMP.zip.sha256` - SHA256 checksum for verification

### Log Files
- `deploy-dryrun-TIMESTAMP.log` - Deploy dry-run output
- `migrate-dryrun-TIMESTAMP.log` - Migration dry-run output
- `tests-TIMESTAMP.log` - Logging and smoke test results

### Metadata
- `premerge_meta_TIMESTAMP.json` - Run metadata (branch, timestamp, config)

## 🔧 Exit Codes

The pre-merge script uses specific exit codes for different failure types:

| Code | Category | Description |
|------|----------|-------------|
| 0 | Success | All pre-merge checks passed |
| 10 | Git/Branch | Git validation or rebase failed |
| 20 | Backup | Backup creation or verification failed |
| 30 | Deploy/Migration | Dry-run deploy or migration failed |
| 40 | Tests | Smoke tests or logging validation failed |
| 50 | Artifacts | Artifact collection failed |
| other | Unexpected | Unexpected error occurred |

## 🐛 Troubleshooting

### Common Issues

**Rebase conflicts:**
```bash
# Fix conflicts manually, then re-run
git rebase origin/main
# Fix conflicts
git add .
git rebase --continue
./scripts/premerge_run.sh
```

**FFmpeg not found:**
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg
```

**Missing dependencies:**
```bash
npm ci  # Install Node.js dependencies
```

**Permission issues:**
```bash
chmod +x scripts/*.sh  # Make scripts executable
```

### Debug Mode

For more verbose output:
```bash
SKIP_SMOKE=false LOG_LEVEL=debug ./scripts/premerge_run.sh
```

### Manual Component Testing

Test individual components:
```bash
# Test backup creation
./scripts/backup_library.sh --out test_backup.zip

# Test deploy dry-run
./scripts/deploy_dhash.sh --env staging --dry-run

# Test migration dry-run
node scripts/migrate-dhash.js --dry-run

# Test logging validation
node scripts/test_logging.js

# Test smoke tests
node scripts/smoke-tests.js --quick
```

## 🔒 Security Considerations

- Backups contain sensitive code - store securely
- Deploy dry-runs don't affect production systems
- Migration dry-runs don't modify databases
- Logs may contain configuration details - review before sharing
- Auto-PR creation is disabled by default for security

## 📞 Support

If you encounter issues:

1. Check the workflow logs in GitHub Actions
2. Review the generated artifact files
3. Run individual component tests to isolate the problem
4. Check the troubleshooting section above
5. Create an issue with logs and error details

## 🔄 Workflow Integration

The pre-merge validation integrates with:

- **Pull Requests** - Automatic validation on PR events
- **CI/CD Pipeline** - Artifact upload and status reporting  
- **Code Review Process** - Results posted as PR comments
- **Deployment Pipeline** - Validates deployment readiness

This ensures consistent quality gates before any code reaches the main branch.