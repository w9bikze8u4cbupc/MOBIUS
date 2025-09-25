# MOBIUS Migration Runbook

## Overview

This runbook covers data migration, schema changes, and environment transitions for the MOBIUS Games tutorial pipeline.

## Migration Types

### 1. Golden File Migration
**When**: Golden file format changes, new validation metrics
**Frequency**: Per feature release
**Risk Level**: Medium

### 2. Media Library Migration  
**When**: Storage format changes, compression updates
**Frequency**: Quarterly maintenance
**Risk Level**: High

### 3. Database Schema Migration
**When**: New game metadata fields, index changes
**Frequency**: Per feature release  
**Risk Level**: Medium

### 4. Environment Migration
**When**: Moving between staging/production
**Frequency**: Per deployment
**Risk Level**: Low

## Pre-Migration Checklist

### Data Backup Requirements
- [ ] **Complete system backup** using `scripts/backup_library.sh`
- [ ] **Database dump** (if applicable)
- [ ] **Configuration backup** (environment variables, secrets)
- [ ] **Verification of backup integrity** (SHA256 checksums)
- [ ] **Test restore procedure** in non-production environment

### Environment Validation
- [ ] Target environment health check passed
- [ ] Sufficient disk space (3x current data size minimum)
- [ ] Network connectivity between source and target
- [ ] Required permissions and access controls
- [ ] Migration scripts tested in staging

### Team Coordination
- [ ] Migration window scheduled (during low-traffic period)
- [ ] All stakeholders notified 48 hours in advance
- [ ] On-call engineer available during migration
- [ ] Rollback plan documented and approved

## Golden File Migration

### Purpose
Update golden reference files when media processing pipeline changes.

### Prerequisites
```bash
# Verify current golden files
npm run golden:check:all

# Generate new golden files from current media
npm run golden:approve
```

### Migration Steps

1. **Backup current golden files**
   ```bash
   cd tests/golden
   tar -czf ../golden-backup-$(date +%Y%m%d).tar.gz .
   ```

2. **Update processing pipeline** (deploy new code)

3. **Generate new golden files**
   ```bash
   # For each game/media type
   npm run golden:update:sushi
   npm run golden:update:loveletter
   ```

4. **Validate new golden files**
   ```bash
   npm run golden:check:all
   ```

5. **Update test thresholds** if needed
   - SSIM threshold adjustments in package.json
   - Audio tolerance updates
   - Container validation criteria

### Rollback Procedure
```bash
# Restore previous golden files
cd tests/golden
rm -rf *
tar -xzf ../golden-backup-[DATE].tar.gz
```

## Media Library Migration

### Purpose
Move or reformat existing media library while preserving functionality.

### Prerequisites
- [ ] Current library size: `du -sh src/uploads/`
- [ ] Available space verification
- [ ] Processing pipeline compatibility check

### Migration Steps

1. **Create comprehensive backup**
   ```bash
   ./scripts/backup_library.sh
   
   # Additional verification
   cd backups
   tar -tzf [BACKUP_FILE] | wc -l  # Count files
   ```

2. **Prepare target location**
   ```bash
   mkdir -p /new/media/path
   chmod 755 /new/media/path
   ```

3. **Migration script execution**
   ```bash
   #!/bin/bash
   # Custom migration script example
   
   SOURCE="/current/media/path"
   TARGET="/new/media/path"
   
   # Rsync with progress and verification
   rsync -av --progress --checksum "$SOURCE/" "$TARGET/"
   
   # Verify file counts match
   SRC_COUNT=$(find "$SOURCE" -type f | wc -l)
   TGT_COUNT=$(find "$TARGET" -type f | wc -l)
   
   if [[ $SRC_COUNT -eq $TGT_COUNT ]]; then
     echo "Migration successful: $SRC_COUNT files"
   else
     echo "ERROR: File count mismatch"
     exit 1
   fi
   ```

4. **Update configuration**
   ```bash
   # Update OUTPUT_DIR environment variable
   echo "OUTPUT_DIR=/new/media/path" >> .env
   ```

5. **Test pipeline functionality**
   ```bash
   npm run test-pipeline
   npm run golden:check:sushi
   ```

### Validation Checklist
- [ ] All media files accessible
- [ ] File permissions correct
- [ ] Golden file tests passing
- [ ] API endpoints returning expected responses
- [ ] No broken file references in logs

## Database Migration (if applicable)

### Schema Changes
```sql
-- Example migration SQL
BEGIN TRANSACTION;

-- Add new columns
ALTER TABLE games ADD COLUMN complexity_rating INTEGER;
ALTER TABLE games ADD COLUMN last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create indexes
CREATE INDEX idx_games_complexity ON games(complexity_rating);
CREATE INDEX idx_games_updated ON games(last_updated);

-- Data migration
UPDATE games SET complexity_rating = 1 WHERE play_time < 30;
UPDATE games SET complexity_rating = 2 WHERE play_time BETWEEN 30 AND 60;
UPDATE games SET complexity_rating = 3 WHERE play_time > 60;

-- Verify migration
SELECT COUNT(*) FROM games WHERE complexity_rating IS NULL;
-- Should return 0

COMMIT;
```

### Migration Script Template
```bash
#!/bin/bash
# Database migration template

DB_BACKUP="db_backup_$(date +%Y%m%d_%H%M%S).sql"
DB_CONNECTION="postgresql://user:pass@localhost/mobius"

# Create backup
echo "Creating database backup..."
pg_dump "$DB_CONNECTION" > "$DB_BACKUP"

# Apply migration
echo "Applying migration..."
psql "$DB_CONNECTION" -f migration.sql

# Verify migration
echo "Verifying migration..."
psql "$DB_CONNECTION" -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1;"
```

## Environment Migration

### Staging to Production
```bash
# 1. Environment variables sync
diff -u staging.env production.env

# 2. Configuration validation
./scripts/deploy_dhash.sh --dry-run --env production

# 3. Database synchronization (if needed)
pg_dump staging_db | psql production_db

# 4. Media library sync
rsync -av staging:/uploads/ production:/uploads/
```

## Monitoring During Migration

### Key Metrics to Watch
- **Disk space usage**: `df -h`
- **Migration progress**: Custom progress indicators
- **Error rates**: Application and system logs
- **Performance impact**: Response times, CPU usage

### Alert Thresholds
- Disk space < 10% → Stop migration
- Error rate > 5% → Investigate immediately  
- Migration time > 2x estimate → Escalate

### Logging Strategy
```bash
# Structured logging for migration
logger -t migration "Starting media library migration"
logger -t migration "Progress: $PERCENT% complete"
logger -t migration "Migration completed successfully"
```

## Post-Migration Validation

### Functional Testing
- [ ] Full application smoke test
- [ ] Media processing pipeline test
- [ ] Golden file validation
- [ ] API endpoint testing
- [ ] User workflow testing

### Performance Validation  
- [ ] Response time baseline check
- [ ] Resource usage monitoring
- [ ] Load testing (if applicable)
- [ ] Error rate monitoring

### Data Integrity Checks
```bash
# File count validation
find src/uploads -type f | wc -l

# Checksum validation (if available)
find src/uploads -type f -exec sha256sum {} \; > post-migration-checksums.txt
diff pre-migration-checksums.txt post-migration-checksums.txt

# Database consistency checks
psql -c "SELECT COUNT(*) FROM games;"
psql -c "SELECT COUNT(DISTINCT id) FROM games;"  # Should match above
```

## Rollback Procedures

### Automatic Rollback Triggers
- Data corruption detected
- Critical functionality broken
- Performance degradation >50%
- Error rate >10% for >5 minutes

### Manual Rollback Steps

1. **Stop migration process**
   ```bash
   kill -TERM $MIGRATION_PID
   ```

2. **Restore from backup**
   ```bash
   ./scripts/rollback_dhash.sh --backup [PRE_MIGRATION_BACKUP]
   ```

3. **Verify rollback**
   ```bash
   npm run test-pipeline
   curl /health
   ```

4. **Incident response**
   - Document rollback reason
   - Notify stakeholders
   - Schedule post-mortem

## Emergency Contacts

| Emergency Type | Contact | Response Time |
|---------------|---------|---------------|
| Data Loss | SRE On-Call | 15 minutes |
| Performance Issues | Engineering Lead | 30 minutes |
| Migration Failure | DevOps Team | 15 minutes |
| Business Impact | Product Owner | 1 hour |

## Migration Templates

### Pre-Migration Communication
```
Subject: MOBIUS Migration Scheduled - [DATE/TIME]

Team,

Scheduled migration details:
- Type: [Migration Type]
- Window: [Start] - [End] UTC
- Expected Duration: [Duration]
- Impact: [Expected Impact]
- Rollback Plan: [Rollback Strategy]

Point of Contact: [Name] ([Contact Info])
```

### Post-Migration Report
```
Subject: MOBIUS Migration Complete - [STATUS]

Migration Summary:
- Status: [SUCCESS/PARTIAL/FAILED]
- Duration: [Actual Duration]
- Issues: [Any Issues Encountered]
- Performance Impact: [Metrics]
- Next Steps: [Follow-up Actions]
```

---
**Last Updated**: $(date)
**Next Review**: After each major migration
**Version**: 1.0