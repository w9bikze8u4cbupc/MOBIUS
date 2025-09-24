# MOBIUS DHash Deployment Guide

## Overview

This document provides comprehensive deployment procedures for the MOBIUS dhash migration system, including automated backup, migration, verification, and rollback capabilities.

## System Requirements

- Node.js (for npm scripts)
- Bash 4+ (for deployment scripts)
- curl (for health checks)
- jq or Python 3 (for JSON validation)
- Unix-like environment (Linux/macOS)

## Pre-Deployment Checklist

### Mandatory Steps

1. **Confirm CI Status**
   ```bash
   # Verify all CI checks are green on release branch
   # Check Linux/macOS/Windows matrix + sandbox/timeouts
   ```

2. **Verify Backup Accessibility & Checksum**
   ```bash
   cp library.json library.json.bak.$(date -u +"%Y%m%dT%H%M%SZ")
   sha256sum library.json*
   ```

3. **Run Dry-Run Locally**
   ```bash
   # Option 1: Using deployment script
   ./scripts/deploy_dhash.sh --dry-run
   
   # Option 2: Using npm script
   npm run deploy:dry-run
   
   # Option 3: Direct npm command
   npm run migrate:dry-run -i library.json --out migrate-dryrun.json
   ```

4. **Validate Health Endpoints on Staging**
   ```bash
   curl -f http://localhost:5001/health
   curl -f http://localhost:5001/metrics/dhash
   ```

5. **Export Low-Confidence Queue**
   ```bash
   npm run lcm:export -- --include-images --format html
   ```

6. **Schedule Maintenance Window**
   - Notify ops/on-call team
   - Set maintenance mode if applicable
   - Plan for rollback window

## Deployment Process

### Automated Deployment

The primary deployment method uses the automated script:

```bash
# Full deployment (interactive)
./scripts/deploy_dhash.sh

# Full deployment (non-interactive)
./scripts/deploy_dhash.sh --force

# Dry-run only
./scripts/deploy_dhash.sh --dry-run
```

### Manual Step-by-Step Process

If you need to run steps manually:

1. **Create Backup**
   ```bash
   ./scripts/deploy_dhash.sh backup
   ```

2. **Run Dry-Run Migration**
   ```bash
   ./scripts/deploy_dhash.sh dry-run
   ```

3. **Health Check**
   ```bash
   ./scripts/deploy_dhash.sh health
   ```

4. **Perform Migration**
   ```bash
   npm run migrate -i library.json
   ```

5. **Post-Migration Verification**
   ```bash
   # Verify JSON integrity
   jq . library.json > /dev/null
   
   # Health checks
   curl -f http://localhost:5001/health
   curl -f http://localhost:5001/metrics/dhash
   
   # Basic functionality test
   npm test
   ```

6. **Cleanup Old Backups**
   ```bash
   ./scripts/deploy_dhash.sh cleanup
   ```

## Expected Runtime and Disk Usage

### Runtime Estimates

- **Backup Creation**: 1-5 seconds
- **Dry-Run Migration**: 30-120 seconds (depends on library size)
- **Actual Migration**: 1-10 minutes (depends on complexity and size)
- **Health Checks**: 5-15 seconds
- **Rollback**: 10-30 seconds

### Disk Usage

- **Backup Files**: ~1MB per backup (typical library.json size)
- **Log Files**: ~100KB per deployment
- **Temporary Files**: ~5-50MB during migration (cleaned up automatically)
- **Retention**: 7 daily backups by default (~7MB total)

**Total Estimated Disk Impact**: 50-100MB for complete deployment pipeline

## Rollback Procedures

### Automatic Rollback

The deployment script automatically performs rollback if:
- Post-migration verification fails
- Health checks fail
- Migration process encounters errors

### Manual Rollback

#### Quick Rollback (Latest Backup)
```bash
# Using rollback script
./scripts/rollback_dhash.sh

# Using deployment script
./scripts/deploy_dhash.sh rollback

# Using npm script
npm run deploy:rollback
```

#### Rollback to Specific Backup
```bash
# List available backups
./scripts/rollback_dhash.sh --list

# Rollback to specific backup
./scripts/rollback_dhash.sh --backup backups/library.json.bak.20240924T160000Z
```

#### Emergency Manual Rollback
```bash
# Stop services
pkill -f deploy_dhash.sh
pkill -f migrate

# Restore latest backup manually
cp backups/library.json.bak.$(ls -t backups/ | grep library.json.bak | head -1) library.json

# Verify checksum
sha256sum -c backups/library.json.bak.*.sha256

# Restart services (if applicable)
```

## Monitoring and Verification

### Post-Deployment Monitoring (First 30-60 minutes)

Monitor these key metrics:

1. **avg_hash_time**: Expected < ~50ms
2. **p95_hash_time**: Expected < ~200ms  
3. **extraction_failures_rate**: Alert if >5%
4. **low_confidence_queue_length**: Watch for unexpected spikes
5. **deployment health endpoint**: `/health` status

### Health Check Commands

```bash
# Basic health check
curl -f http://localhost:5001/health

# Detailed metrics
curl -s http://localhost:5001/metrics/dhash | jq .

# Low-confidence queue status
npm run lcm:export
```

## Security and Permissions

### Recommended Security Measures

1. **Least-Privilege Execution**
   ```bash
   # Create restricted deployment user
   sudo useradd -r -s /bin/bash deploy-user
   sudo usermod -G deploy-group deploy-user
   
   # Run deployments under restricted user
   sudo -u deploy-user ./scripts/deploy_dhash.sh
   ```

2. **File Permissions**
   ```bash
   # Secure deployment scripts
   chmod 750 scripts/deploy_dhash.sh
   chmod 750 scripts/rollback_dhash.sh
   
   # Secure library and backup files
   chmod 640 library.json
   chmod -R 640 backups/
   ```

3. **CI/CD Integration**
   ```yaml
   # Example GitHub Actions job with limited permissions
   deploy:
     runs-on: ubuntu-latest
     permissions:
       contents: read
       deployments: write
     steps:
       - uses: actions/checkout@v4
       - name: Deploy dhash
         run: ./scripts/deploy_dhash.sh --force
   ```

## Backup Management

### Automatic Backup Retention

- Default retention: 7 days
- Automatic cleanup during deployment
- Manual cleanup: `./scripts/deploy_dhash.sh cleanup`

### Backup Verification

All backups include SHA256 checksums for integrity verification:

```bash
# Verify specific backup
sha256sum -c backups/library.json.bak.20240924T160000Z.sha256

# Verify all backups
for backup in backups/*.sha256; do
    echo "Verifying $(basename "$backup" .sha256)..."
    sha256sum -c "$backup"
done
```

### Custom Retention Policy

```bash
# Set custom retention (14 days)
./scripts/deploy_dhash.sh --backup-retention 14

# One-time cleanup of old backups
find backups/ -name "library.json.bak.*" -mtime +14 -delete
find backups/ -name "*.sha256" -mtime +14 -delete
```

## Troubleshooting

### Common Issues

1. **Migration Timeout**
   ```bash
   # Check for long-running processes
   ps aux | grep migrate
   
   # Check disk space
   df -h
   
   # Check logs
   tail -f logs/migration-*.log
   ```

2. **Backup Verification Failed**
   ```bash
   # Check file integrity
   sha256sum library.json
   
   # Restore from known good backup
   ./scripts/rollback_dhash.sh --list
   ./scripts/rollback_dhash.sh --backup <specific-backup>
   ```

3. **Health Check Failures**
   ```bash
   # Check service status
   curl -v http://localhost:5001/health
   
   # Check service logs
   tail -f logs/service.log
   
   # Restart services if needed
   npm run restart
   ```

### Log Locations

- **Deployment Logs**: `logs/migration-TIMESTAMP.log`
- **Dry-Run Logs**: `logs/dry-run-TIMESTAMP.log` 
- **Rollback Logs**: `logs/rollback-TIMESTAMP.log`
- **Backup Directory**: `backups/`

## Integration Points

### CI/CD Pipeline Integration

```yaml
# Example deployment pipeline
stages:
  - name: pre-deploy-checks
    script: |
      ./scripts/deploy_dhash.sh dry-run
      npm run test
      
  - name: deploy
    script: |
      ./scripts/deploy_dhash.sh --force
      
  - name: post-deploy-verification
    script: |
      sleep 30  # Allow services to stabilize
      curl -f http://localhost:5001/health
      npm run test:smoke
```

### Monitoring Integration

```bash
# Example monitoring script
#!/bin/bash
while true; do
    if ! curl -sf http://localhost:5001/health > /dev/null; then
        echo "ALERT: Health check failed" | mail -s "MOBIUS Health Alert" ops@company.com
    fi
    sleep 60
done
```

## Support and Escalation

### Emergency Contacts

1. **First Response**: Run automated rollback
2. **Dev Team**: Check deployment logs and investigate
3. **DevOps**: Infrastructure and service recovery
4. **On-Call**: After-hours support

### Escalation Procedure

1. Immediate rollback if system is down
2. Preserve logs and artifacts for investigation
3. Document timeline and impact
4. Post-incident review and process improvements

## Changelog

- **v1.0.0**: Initial deployment infrastructure
- **v1.0.1**: Added security recommendations
- **v1.0.2**: Enhanced monitoring and troubleshooting sections

---

For questions or issues, please contact the development team or create an issue in the repository.