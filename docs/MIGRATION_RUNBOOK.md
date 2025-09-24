# DHash Migration Runbook

**Version:** 1.0.0  
**Last Updated:** December 2024  
**Target:** Production deployment of DHash image similarity pipeline  

## Overview

This runbook provides step-by-step instructions for safely migrating the MOBIUS image processing pipeline to include DHash (Difference Hash) fingerprinting for duplicate detection and image similarity matching.

## Prerequisites

### System Requirements
- Node.js 20+ installed
- FFmpeg installed and accessible in PATH
- Sufficient disk space for backups and temporary files
- Network access for monitoring endpoints (if applicable)

### Pre-Migration Checklist
- [ ] All dependencies installed (`npm ci`)
- [ ] FFmpeg version verified (`ffmpeg -version`)
- [ ] Backup storage verified and accessible
- [ ] Production library file accessible and validated
- [ ] Monitoring systems enabled
- [ ] Maintenance window scheduled
- [ ] On-call team notified
- [ ] Rollback plan reviewed and tested

## Migration Process

### Phase 1: Pre-Migration Validation

#### 1.1 Environment Setup
```bash
# Verify Node.js and npm
node --version  # Should be 20+
npm --version

# Install dependencies
npm ci

# Verify FFmpeg installation
ffmpeg -version
ffprobe -version
```

#### 1.2 Library Validation
```bash
# Validate current library format
node -e "
const fs = require('fs');
const lib = JSON.parse(fs.readFileSync('library.json', 'utf8'));
console.log('Images:', lib.images?.length || 0);
console.log('Format valid:', Array.isArray(lib.images));
"
```

#### 1.3 Dry Run Migration
```bash
# Perform dry-run migration
npm run migrate:dry-run -i library.json --out migrate-dryrun.json

# Inspect dry-run results
ls -la migrate-dryrun.json
head -50 migrate-dryrun.json
```

### Phase 2: Backup and Safety

#### 2.1 Create Production Backup
```bash
# Create timestamped backup
BACKUP_FILE="library.json.bak.$(date -u +"%Y%m%dT%H%M%SZ")"
cp library.json "$BACKUP_FILE"

# Verify backup integrity
if [ "$(stat -c%s library.json)" = "$(stat -c%s "$BACKUP_FILE")" ]; then
    echo "✓ Backup verified: $BACKUP_FILE"
else
    echo "✗ Backup verification failed!"
    exit 1
fi

# Create backup checksum
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
```

#### 2.2 Setup Monitoring
```bash
# Ensure log directory exists
mkdir -p logs

# Start monitoring (if applicable)
# tail -f logs/migration.log &
```

### Phase 3: Migration Execution

#### 3.1 Run DHash Migration
```bash
# Execute migration with backup
npm run migrate:dhash \
    -i library.json \
    -o library.dhash.json \
    --backup \
    --batch-size 100 \
    --threshold 10 \
    2>&1 | tee logs/migration-$(date +%Y%m%d-%H%M%S).log

# Verify migration completion
echo "Migration exit code: $?"
```

#### 3.2 Validate Migration Results
```bash
# Check output file exists and is valid JSON
node -e "
const fs = require('fs');
const lib = JSON.parse(fs.readFileSync('library.dhash.json', 'utf8'));
const withDHash = lib.images.filter(img => img.dhash).length;
console.log('Total images:', lib.images.length);
console.log('Images with DHash:', withDHash);
console.log('Migration stats:', lib.dhash_migration);
"
```

#### 3.3 Review Migration Report
```bash
# Extract key metrics from migration log
grep -E "(Migration Report|Total images|Successfully processed|Errors|Duplicates found)" logs/migration-*.log

# Review any duplicate detections
node -e "
const lib = JSON.parse(fs.readFileSync('library.dhash.json', 'utf8'));
if (lib.dhash_duplicates?.length > 0) {
    console.log('Duplicates found:', lib.dhash_duplicates.length);
    lib.dhash_duplicates.forEach((dup, i) => {
        console.log(\`\${i+1}. \${dup.duplicate} ~ \${dup.original} (distance: \${dup.hammingDistance})\`);
    });
}
"
```

### Phase 4: Low-Confidence Queue Management

#### 4.1 Export Low-Confidence Matches
```bash
# Export matches that need manual review
npm run lcm:export \
    -i library.dhash.json \
    -o low-confidence-queue.json \
    --min-distance 8 \
    --max-distance 15 \
    --include-images \
    --review-dir ./manual-review

# Review queue size
node -e "
const queue = JSON.parse(fs.readFileSync('low-confidence-queue.json', 'utf8'));
console.log('Low-confidence matches:', queue.totalMatches);
"
```

#### 4.2 Manual Review Process (Optional)
```bash
# Generate HTML review interface
npm run lcm:export \
    -i library.dhash.json \
    --format html \
    -o manual-review/review.html \
    --include-images

echo "Manual review interface: manual-review/review.html"
echo "Review images in: manual-review/images/"
```

### Phase 5: Deployment

#### 5.1 Atomic Deployment
```bash
# Deploy new library atomically
if [ -f "library.dhash.json" ]; then
    # Move current library to staging
    mv library.json library.json.pre-dhash
    
    # Deploy new library
    mv library.dhash.json library.json
    
    echo "✓ Library deployed successfully"
else
    echo "✗ Migration file not found!"
    exit 1
fi
```

#### 5.2 Service Restart (if applicable)
```bash
# Restart application services
# systemctl restart mobius-service
# docker restart mobius-container
# pm2 restart mobius-app

echo "Services restarted"
```

### Phase 6: Post-Deployment Verification

#### 6.1 Health Checks
```bash
# Verify application startup
# curl -s http://localhost:5001/health | jq .

# Test DHash functionality
node -e "
const { DHashProcessor } = require('./src/dhash.js');
const processor = new DHashProcessor();
console.log('DHash processor initialized successfully');
"
```

#### 6.2 Sample Testing
```bash
# Test image similarity matching (example)
# node -e "
# const { DHashProcessor } = require('./src/dhash.js');
# const processor = new DHashProcessor();
# const hash1 = processor.generateHash('test-image-1.jpg');
# const hash2 = processor.generateHash('test-image-2.jpg');
# const distance = processor.compareHashes(hash1, hash2);
# console.log('Sample match distance:', distance);
# "
```

#### 6.3 Performance Monitoring
```bash
# Monitor key metrics for 30-60 minutes
echo "Monitoring metrics..."
echo "- avg_hash_time: Monitor hash generation performance"
echo "- p95_hash_time: Monitor 95th percentile response time"  
echo "- extraction_failures_rate: Monitor processing error rate"
echo "- low_confidence_queue_length: Monitor manual review queue"

# Log sample performance data
node -e "
const start = Date.now();
const { DHashProcessor } = require('./src/dhash.js');
const processor = new DHashProcessor();
// Simulate hash generation timing
const end = Date.now();
console.log('DHash initialization time:', end - start, 'ms');
"
```

## Rollback Procedures

### Emergency Rollback (Fast)
```bash
# Quick rollback using pre-migration backup
BACKUP_FILE=$(ls library.json.bak.* | head -1)
if [ -f "$BACKUP_FILE" ]; then
    cp "$BACKUP_FILE" library.json
    echo "✓ Emergency rollback completed using $BACKUP_FILE"
else
    echo "✗ No backup file found!"
    exit 1
fi

# Restart services if needed
# systemctl restart mobius-service
```

### Controlled Rollback
```bash
# List available backups
npm run migrate:rollback -i library.json --list-backups

# Rollback to specific backup
npm run migrate:rollback \
    -i library.json \
    -b library.json.bak.2024MMDDTHHMMSSZ

# Or remove DHash data only (keep other changes)
npm run migrate:rollback \
    -i library.json \
    --remove-dhash
```

### Rollback Verification
```bash
# Verify rollback success
node -e "
const lib = JSON.parse(fs.readFileSync('library.json', 'utf8'));
const withDHash = lib.images.filter(img => img.dhash).length;
console.log('Images with DHash after rollback:', withDHash);
console.log('Rollback successful:', withDHash === 0);
"
```

## Monitoring and Alerts

### Key Metrics to Monitor

1. **Hash Generation Performance**
   - `avg_hash_time`: Average time to generate DHash
   - `p95_hash_time`: 95th percentile hash generation time
   - Target: < 50ms average, < 200ms p95

2. **Error Rates**
   - `extraction_failures_rate`: Rate of hash generation failures
   - `image_processing_errors`: General image processing errors
   - Target: < 1% failure rate

3. **Queue Management**
   - `low_confidence_queue_length`: Number of matches needing review
   - `duplicate_detection_rate`: Rate of duplicate detection
   - Monitor for unexpected spikes

4. **Resource Usage**
   - CPU usage during batch processing
   - Memory consumption
   - Disk I/O for image processing
   - Network I/O if images are remote

### Alert Thresholds

- **Critical:** Hash generation failure rate > 5%
- **Warning:** Average hash time > 100ms
- **Info:** Low confidence queue length > 100

## Troubleshooting

### Common Issues

#### 1. FFmpeg Not Found
```bash
# Install FFmpeg
# Ubuntu/Debian: sudo apt-get install ffmpeg
# CentOS/RHEL: sudo yum install ffmpeg
# macOS: brew install ffmpeg
# Windows: choco install ffmpeg
```

#### 2. Out of Memory During Migration
```bash
# Reduce batch size
npm run migrate:dhash -i library.json --batch-size 50

# Monitor memory usage
# top -p $(pgrep node)
```

#### 3. Image File Not Found Errors
```bash
# Check image paths in library
node -e "
const lib = JSON.parse(fs.readFileSync('library.json', 'utf8'));
const missing = lib.images.filter(img => !require('fs').existsSync(img.path));
console.log('Missing images:', missing.length);
missing.slice(0, 5).forEach(img => console.log('  -', img.path));
"
```

#### 4. Migration Stuck or Slow
```bash
# Check progress
tail -f logs/migration-*.log

# Monitor system resources
# htop
# iostat -x 1
```

### Recovery Procedures

#### Corrupted Migration State
1. Stop migration process
2. Restore from backup
3. Check disk space and system resources
4. Restart migration with smaller batch size

#### Partial Migration Failure
1. Check migration log for specific errors
2. Fix underlying issues (missing files, permissions, etc.)
3. Resume migration from checkpoint (if supported)
4. Or rollback and restart

## Testing and Validation

### Pre-Production Testing
```bash
# Create test library subset
node -e "
const lib = JSON.parse(fs.readFileSync('library.json', 'utf8'));
const testLib = { ...lib, images: lib.images.slice(0, 100) };
fs.writeFileSync('test-library.json', JSON.stringify(testLib, null, 2));
"

# Test migration on subset
npm run migrate:dhash -i test-library.json -o test-library.dhash.json
```

### Post-Migration Testing
```bash
# Verify hash consistency
node -e "
const { DHashProcessor } = require('./src/dhash.js');
const processor = new DHashProcessor();
// Test same image produces same hash
const hash1 = processor.generateHash('test-image.jpg');
const hash2 = processor.generateHash('test-image.jpg');
console.log('Hash consistency:', hash1 === hash2);
"

# Test similarity detection
# (Add specific test cases based on your image collection)
```

## Security Considerations

1. **Backup Security**: Ensure backups are stored securely and encrypted if containing sensitive data
2. **File Permissions**: Verify proper file permissions on migrated library files
3. **Temporary Files**: Ensure temporary files are cleaned up properly
4. **Access Logging**: Enable logging for migration operations

## Performance Tuning

### Optimization Settings
```bash
# For large libraries (>10,000 images)
npm run migrate:dhash \
    -i library.json \
    --batch-size 200 \
    --parallel 8 \
    --temp-dir /fast-storage/tmp

# For slower systems
npm run migrate:dhash \
    -i library.json \
    --batch-size 25 \
    --parallel 2
```

### System Tuning
- Increase file descriptor limits if processing many files
- Use SSD storage for temporary files if possible
- Consider memory mapping for very large image files

## Contact and Escalation

- **Primary Contact**: Operations team
- **Secondary Contact**: Development team  
- **Emergency Contact**: On-call engineer
- **Documentation**: This runbook and API documentation
- **Logs Location**: `logs/migration-*.log`
- **Monitoring Dashboard**: [Link to monitoring system]

---

**Document Version History**
- v1.0.0 - Initial version for DHash v1.0.0 release
- [Add version history as document evolves]