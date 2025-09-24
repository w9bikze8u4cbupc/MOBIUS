# MOBIUS Dhash Migration Deployment System

This directory contains the automated deployment scripts for migrating the MOBIUS game library from traditional metadata to dhash-based perceptual hashing.

## Overview

The deployment system provides a complete workflow for:
1. **Backup** - Automatic backup creation with checksums
2. **Migration** - Converting components to dhash format with confidence tracking
3. **Deployment** - Atomic deployment with verification
4. **Monitoring** - Health checks and metrics collection
5. **Rollback** - Safe rollback to previous versions

## Quick Start

### 1. Dry Run (Recommended First Step)
```bash
./scripts/deploy_dhash.sh --dry-run
```

### 2. Full Deployment
```bash
./scripts/deploy_dhash.sh -i library.json -o library.dhash.json
```

### 3. Rollback if Needed
```bash
./scripts/deploy_dhash.sh --rollback -i library.json
```

## Scripts

### `deploy_dhash.sh` - Main Deployment Script
The primary deployment orchestrator that manages the entire workflow.

**Options:**
- `--dry-run` - Preview deployment without making changes
- `-i, --input FILE` - Input library file (default: library.json)
- `-o, --output FILE` - Output dhash library file (default: library.dhash.json)
- `--no-backup` - Skip backup creation
- `--no-health-check` - Skip health checks
- `--rollback` - Rollback to previous version
- `-h, --help` - Show help message

**Examples:**
```bash
# Preview deployment
./scripts/deploy_dhash.sh --dry-run

# Custom files
./scripts/deploy_dhash.sh -i my-library.json -o my-library.dhash.json

# Rollback
./scripts/deploy_dhash.sh --rollback -i library.json

# Skip health checks
./scripts/deploy_dhash.sh --no-health-check
```

### `migrate-dhash.js` - Migration Engine
Converts traditional library format to dhash-based format.

**Options:**
- `-i, --input FILE` - Input library file
- `-o, --output FILE` - Output dhash library file
- `--dry-run` - Preview migration without writing output
- `--backup` - Create backup of input file
- `-v, --verbose` - Enable verbose logging

**Features:**
- Generates 64-bit dhash for each component
- Calculates migration confidence based on available metadata
- Preserves original metadata as legacy fields
- Comprehensive logging and error handling

### `migrate-rollback.js` - Rollback Engine
Safely rolls back from dhash format to previous version.

**Options:**
- `-i, --input FILE` - Input library file to rollback
- `--backup FILE` - Specific backup file to restore from
- `--force` - Force rollback without confirmation
- `-v, --verbose` - Enable verbose logging

**Features:**
- Automatically finds most recent backup if none specified
- Creates rollback checkpoint before proceeding
- Interactive confirmation (unless --force used)
- Validates backup file integrity

### `lcm-export.js` - Low-Confidence Management
Exports components with low migration confidence for manual review.

**Options:**
- `-i, --input FILE` - Input dhash library file
- `-o, --output PREFIX` - Output file prefix
- `--format FORMAT` - Output format: json, csv, html
- `--include-images` - Include image references in export
- `--confidence-threshold NUM` - Confidence threshold (default: 0.7)

**Export Formats:**
- **JSON** - Structured data for programmatic processing
- **CSV** - Spreadsheet-compatible format
- **HTML** - Human-readable report with styling

## NPM Scripts

Add these to your package.json for easy access:

```json
{
  "scripts": {
    "migrate:dhash": "node scripts/migrate-dhash.js",
    "migrate:dry-run": "node scripts/migrate-dhash.js --dry-run",
    "migrate:rollback": "node scripts/migrate-rollback.js",
    "lcm:export": "node scripts/lcm-export.js",
    "start:api": "cd src && node api/index.js",
    "health:check": "curl -s http://localhost:5001/health || echo 'Server not running'"
  }
}
```

## Health & Metrics Endpoints

The system provides monitoring endpoints for deployment verification:

### Health Check
```
GET http://localhost:5001/health
```

Returns:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "uptime": 3600,
  "version": "1.0.0",
  "services": {
    "api": "operational",
    "dhash": "operational",
    "database": "operational"
  }
}
```

### Dhash Metrics
```
GET http://localhost:5001/metrics/dhash
```

Returns performance and reliability metrics:
```json
{
  "timestamp": "2024-01-15T10:00:00Z",
  "performance": {
    "avg_hash_time": 25.4,
    "p95_hash_time": 180.2,
    "avg_comparison_time": 3.1
  },
  "reliability": {
    "extraction_failures_rate": 1.2,
    "hash_generation_success_rate": 99.8
  },
  "queue": {
    "low_confidence_queue_length": 5,
    "processing_queue_length": 2,
    "completed_migrations": 847
  }
}
```

## Library Format

### Input Format (Traditional)
```json
{
  "metadata": {
    "name": "Board Game Components Library",
    "version": "0.9.0",
    "created_at": "2024-01-15T10:00:00Z"
  },
  "components": [
    {
      "name": "Wooden Meeples",
      "quantity": 50,
      "description": "Small wooden game pieces",
      "image": "/images/meeples.jpg",
      "category": "pieces",
      "material": "wood"
    }
  ]
}
```

### Output Format (Dhash)
```json
{
  "metadata": {
    "name": "Board Game Components Library",
    "version": "0.9.0",
    "created_at": "2024-01-15T10:00:00Z",
    "migration": {
      "migrated_at": "2024-01-15T12:00:00Z",
      "source_file": "library.json",
      "migration_version": "1.0.0",
      "total_components": 1,
      "low_confidence_count": 0,
      "average_confidence": 1.0
    }
  },
  "components": [
    {
      "name": "Wooden Meeples",
      "quantity": 50,
      "description": "Small wooden game pieces",
      "image": "/images/meeples.jpg",
      "category": "pieces",
      "material": "wood",
      "dhash": "0eb39f154a588f48",
      "migrated_at": "2024-01-15T12:00:00Z",
      "migration_confidence": 1.0
    }
  ]
}
```

## Migration Confidence

The system calculates migration confidence based on available metadata:

- **Base confidence**: 0.5
- **Has image**: +0.3
- **Has description (>10 chars)**: +0.1
- **Has valid quantity**: +0.1
- **Maximum confidence**: 1.0

Components with confidence < 0.7 are flagged for manual review.

## Deployment Workflow

1. **Prerequisites Check** - Validates Node.js, npm, required files
2. **Backup Creation** - Creates timestamped backup with SHA256 checksum
3. **Dry Run** - Always runs dry run first to validate migration
4. **Migration** - Converts components to dhash format
5. **Verification** - Validates output file structure and content
6. **Health Checks** - Verifies API endpoints are accessible
7. **LCM Export** - Exports low-confidence components for review

## Error Handling

- All scripts use comprehensive error handling
- Detailed logging with timestamps and severity levels
- Automatic rollback on critical failures
- Backup creation before destructive operations
- Validation of input/output file formats

## Monitoring Thresholds

Recommended alert thresholds:

- `avg_hash_time` > 50ms (expected < 50ms)
- `p95_hash_time` > 200ms (expected < 200ms)  
- `extraction_failures_rate` > 5%
- `low_confidence_queue_length` unexpected spikes

## Post-Deployment

After successful deployment:

1. **Monitor metrics** for 30-60 minutes
2. **Run smoke tests** on image comparison endpoints
3. **Check logs** for any errors or warnings
4. **Review LCM exports** for manual processing
5. **Verify backup integrity** with checksums

## Troubleshooting

### Common Issues

**Migration fails with "Input file not found"**
- Verify file path is correct
- Ensure file exists and is readable

**Health checks fail**
- Start the API server: `npm run start:api`
- Verify port 5001 is available
- Check firewall settings

**Low confidence components**
- Review components using: `npm run lcm:export`
- Add missing metadata (descriptions, images)
- Rerun migration after improvements

**Rollback needed**
- Use: `./scripts/deploy_dhash.sh --rollback`
- Check available backups in `backups/` directory
- Verify backup file integrity

## File Structure

```
scripts/
├── deploy_dhash.sh          # Main deployment orchestrator
├── migrate-dhash.js         # Migration engine
├── migrate-rollback.js      # Rollback engine
└── lcm-export.js           # Low-confidence export

backups/                     # Automatic backups with checksums
├── library.json.bak.TIMESTAMP
└── library.json.bak.TIMESTAMP.sha256

logs/
└── deploy_dhash_TIMESTAMP.log  # Deployment logs
```

## Security Considerations

- Backup files contain sensitive component data
- Ensure proper file permissions on scripts and data
- Review exported low-confidence data before sharing
- Use secure channels for deployment in production environments

## Support

For issues or questions:
1. Check deployment logs in the generated log files
2. Review health and metrics endpoints
3. Validate file formats and permissions
4. Consult this documentation for common solutions