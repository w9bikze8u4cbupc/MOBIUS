# Storage Path Canonicalization - MILESTONE COMPLETE

## Status: ✅ LOCKED MILESTONE

**This implementation is complete and authoritative.**

Any deviation from the canonical storage paths or coherence requirements is considered a **regression** and requires:
1. Explicit proposal with justification
2. Rollback plan
3. Team approval

## Overview

This document describes the canonical storage path structure for MOBIUS 2.0, which eliminates state divergence through **two layers of canonicalization**:

1. **Mechanical Canonicalization**: Single data root + deterministic path resolution
2. **Semantic Coherence**: Explicit artifact authority + DB↔filesystem validation (MANDATORY)

## Locked Invariants

After cutover, the following are **MANDATORY** and cannot be disabled:

✅ **DB ↔ Filesystem Coherence**: Database and filesystem must stay in sync
✅ **Legacy Path Write Blocking**: Writes to legacy paths hard-fail (no exceptions)
✅ **Artifact Authority Tracking**: No artifact is implicitly canonical
✅ **Mandatory Validation**: Coherence checks required before cutover and in CI

These invariants are **locked** - any violation is a regression requiring immediate resolution.

## Problem Statement

Previously, MOBIUS had multiple database files and upload directories scattered across the codebase:
- Two SQLite databases: `data/projects.db` and `src/api/projects.db`
- Two upload directories: `data/uploads/` and `src/api/uploads/`
- Multiple output directories: `output/`, `out/`, `src/api/uploads/MobiusGames/`

This caused:
- Ghost projects (data in one DB but not the other)
- Broken asset references (files in one uploads dir but not the other)
- Nondeterministic renders (outputs scattered across locations)
- Difficult debugging and maintenance
- **No semantic coherence** between database and filesystem

## Solution: Canonical Data Root + Semantic Coherence

### Layer 1: Mechanical Canonicalization

All data is stored under a single canonical data root with a well-defined structure:

```
data/
├── db/           - SQLite database files
│   └── projects.sqlite
├── uploads/      - User-uploaded files (PDFs, assets)
│   ├── pdf_images/
│   └── [uploaded files]
├── outputs/      - Rendered videos and artifacts
│   └── [project-id]/
│       ├── output.mp4
│       ├── preview.mp4
│       ├── thumbnail.jpg
│       └── artifact_manifest.json  ← Authority metadata
└── tmp/          - Temporary files (auto-cleaned)
```

### Layer 2: Semantic Coherence

**Artifact Authority**: No artifact is implicitly canonical. Each output has a manifest declaring:
- Stage (preview, draft, final)
- Provenance (inputs, derivation chain)
- Authority status (requires explicit grant)

**Coherence Validation**: Automated checks detect:
- Orphaned files (filesystem but not in DB)
- Missing artifacts (DB references but not on disk)
- Invalid manifests
- Competing artifacts (multiple versions for same stage)
- Authority conflicts (multiple authoritative versions)

**Legacy Write Blocking**: After cutover, writes to legacy paths are hard-blocked to prevent future drift.

## Configuration

### Environment Variables

- **`MOBIUS_DATA_ROOT`** (recommended): Override the default data directory location
  ```bash
  MOBIUS_DATA_ROOT=/custom/path/to/data
  ```

- **`DATA_DIR`** (legacy, deprecated): Backward compatibility with old configuration
  ```bash
  DATA_DIR=/custom/path/to/data
  ```

### DEV-ONLY Overrides (UNSUPPORTED in Production)

⚠️ **WARNING**: The following flags weaken mandatory invariants and should **NEVER** be used in production:

- **`SKIP_LEGACY_CHECK`**: Skip legacy path validation (DEV-ONLY)
  - Use only during migration or testing
  - After cutover, this should NEVER be enabled
  
- **`SKIP_LEGACY_WRITE_GUARD`**: Skip legacy write blocking (DEV-ONLY)
  - Use only for emergency rollback
  - This is a locked invariant

**After cutover, using these flags in production is considered a REGRESSION.**

### Default Behavior

If no environment variables are set, the data root defaults to `./data` relative to the project root.

## Usage

### In Code

```javascript
import { 
  getDataDirs, 
  getDbPath, 
  getUploadPath, 
  getOutputPath 
} from './src/config/storage.js';

// Get all canonical directories
const dirs = getDataDirs();
console.log(dirs.uploads); // /path/to/data/uploads

// Get database path
const dbPath = getDbPath();
console.log(dbPath); // /path/to/data/db/projects.sqlite

// Get upload path for a file
const uploadPath = getUploadPath('game.pdf');
console.log(uploadPath); // /path/to/data/uploads/game.pdf

// Get output path for a project
const outputPath = getOutputPath('project-123', 'video.mp4');
console.log(outputPath); // /path/to/data/outputs/project-123/video.mp4
```

### Validation

**Mechanical validation** (paths exist, no legacy paths):

```bash
npm run storage:validate
```

**Semantic coherence** (DB↔filesystem consistency - MANDATORY):

```bash
npm run storage:coherence
```

This validation is **MANDATORY** and will:
- Require better-sqlite3 (hard dependency)
- Detect orphaned files and missing artifacts
- Validate artifact manifests
- Check for competing artifacts
- Verify authority claims
- Exit non-zero on violations (no exceptions)

**After cutover, coherence validation is a locked invariant.**

### Migration

If you have existing data in legacy locations, migrate it:

```bash
# Dry run (see what would be migrated)
npm run storage:migrate:dry-run

# Perform migration (copy-only, non-destructive)
npm run storage:migrate

# Migrate and perform cutover in one step
npm run storage:migrate -- --cutover
```

The migration script will:
1. Scan for legacy data
2. Show what will be migrated
3. **Copy** data to canonical locations (originals preserved)
4. Provide instructions for next steps

**Important**: Migration is copy-only by default. Original files are NOT deleted.

## Cutover Process - MILESTONE LOCK

Cutover is an **explicit, one-way operation** that locks the storage canonicalization milestone.

### Pre-Cutover Requirements

- [ ] Migration complete (`npm run storage:migrate`)
- [ ] Data verified in canonical locations
- [ ] Application tested and working
- [ ] **MANDATORY coherence validation passes** (`npm run storage:coherence`)
- [ ] Team ready to enforce canonical paths
- [ ] better-sqlite3 installed and working

### Performing Cutover

```bash
# Perform cutover (MANDATORY validation enforced)
npm run storage:cutover
```

**What happens during cutover:**
1. MANDATORY coherence validation (including DB checks)
2. Write cutover marker with validation hash
3. Re-validate to ensure cutover is clean
4. Enable legacy write blocking (hard-fail mode)

**After cutover:**
- Legacy path writes are **HARD-BLOCKED** (no exceptions)
- Coherence validation is **MANDATORY**
- Any violation is a **REGRESSION**

### Post-Cutover Checklist

- [ ] Cutover marker written (`.mobius_cutover.json`)
- [ ] Application restarted
- [ ] No legacy path errors in logs
- [ ] Coherence validation passes
- [ ] Legacy paths manually removed (after verification)
- [ ] Final validation confirms cleanup

### Rollback (Emergency Only)

If critical issues are discovered:

1. Remove cutover marker: `rm data/.mobius_cutover.json`
2. Set `SKIP_LEGACY_WRITE_GUARD=true` (DEV-ONLY)
3. Fix underlying issues
4. Re-run cutover when ready

**Note**: Rollback is for emergency use only. After cutover, the milestone is considered locked.

## Startup Validation

The application validates storage paths at startup (unless `SKIP_LEGACY_CHECK=true`).

If legacy paths are detected, the application will:
1. Print a detailed error message
2. List all legacy paths found
3. Provide remediation instructions
4. Exit with error code 1

Example error:

```
❌ LEGACY DATA PATHS DETECTED

The following legacy paths contain data and must be migrated:

  📄 src/api/projects.db (12345 bytes)
  📁 src/api/uploads (42 files)

REMEDIATION:
  1. Run: node scripts/migrate-legacy-data.js
  2. Verify migration completed successfully
  3. Restart the application

To bypass this check (NOT RECOMMENDED):
  Set environment variable: SKIP_LEGACY_CHECK=true
```

## Docker

The Dockerfile creates the canonical structure:

```dockerfile
# Create canonical data directory structure
RUN mkdir -p /app/data/db \
             /app/data/uploads \
             /app/data/outputs \
             /app/data/tmp

# Set environment variable for data root
ENV MOBIUS_DATA_ROOT=/app/data
```

Mount a volume to persist data:

```bash
docker run -v /host/data:/app/data mobius-app
```

## Testing

### Unit Tests

```bash
npm test -- src/__tests__/storage.test.js
```

Tests verify:
- Path resolution
- Environment variable handling
- Directory structure
- Path consistency

### Integration Tests

```bash
npm test -- tests/integration/storage-integration.test.js
```

Tests verify:
- End-to-end data flow
- No files created outside data root
- Single database usage
- Canonical path usage across all operations

## Migration Guide

### For Developers

1. **Update imports**: Use `src/config/storage.js` instead of `src/api/utils.js` or `src/config/paths.js`

   ```javascript
   // Old
   import { getDataDir, getUploadsDir } from './api/utils.js';
   
   // New
   import { getDataDirs, getUploadPath } from './config/storage.js';
   ```

2. **Update path references**: Use helper functions instead of manual path construction

   ```javascript
   // Old
   const uploadPath = path.join(__dirname, 'uploads', filename);
   
   // New
   const uploadPath = getUploadPath(filename);
   ```

3. **Update output paths**: Use `getOutputPath` for render outputs

   ```javascript
   // Old
   const outputDir = path.join(__dirname, 'uploads', 'MobiusGames');
   
   // New
   const outputDir = getOutputPath(projectId);
   ```

### For Operators

1. **Validate current setup**:
   ```bash
   npm run storage:validate
   ```

2. **Migrate existing data**:
   ```bash
   npm run storage:migrate
   ```

3. **Verify migration**:
   - Check that data exists in `data/` directory
   - Test application functionality
   - Verify renders work correctly

4. **Clean up legacy paths** (after verification):
   ```bash
   rm -rf src/api/projects.db
   rm -rf src/api/uploads
   rm -rf uploads
   rm -rf output
   ```

5. **Update deployment scripts** to use canonical paths

## Backward Compatibility

The following modules are maintained for backward compatibility but are deprecated:

- `src/api/utils.js` - Wraps `src/config/storage.js`
- `src/config/paths.js` - Wraps `src/config/storage.js`

New code should import directly from `src/config/storage.js`.

## Troubleshooting

### Application won't start - legacy paths detected

**Solution**: Run the migration script:
```bash
npm run storage:migrate
```

### Database not found

**Solution**: Ensure `MOBIUS_DATA_ROOT` or `DATA_DIR` points to the correct location, or use the default `./data`.

### Uploads not accessible

**Solution**: Check that the Express static middleware is configured correctly:
```javascript
app.use('/uploads', express.static(dataDirs.uploads));
```

### Renders fail with "output directory not found"

**Solution**: Use `getOutputPath(projectId)` to get the correct output directory. The function automatically creates the directory if it doesn't exist.

### Multiple databases exist

**Solution**: 
1. Determine which database has the correct data
2. Copy it to the canonical location: `data/db/projects.sqlite`
3. Remove other database files
4. Restart the application

## Benefits

1. **Single source of truth**: Exactly one database, one uploads directory, one outputs directory
2. **Predictable behavior**: All operations use the same paths
3. **Easier debugging**: All data in one location
4. **Simpler deployment**: Mount one volume for all data
5. **Better testing**: Isolated test data directories
6. **Cleaner codebase**: Centralized path management

## Future Enhancements

- Automatic cleanup of tmp directory
- Configurable retention policies for outputs
- Storage usage monitoring and alerts
- Backup and restore utilities
- Multi-tenant data isolation

## References

- Implementation: `src/config/storage.js`
- Migration script: `scripts/migrate-legacy-data.js`
- Validation script: `scripts/validate-storage.js`
- Unit tests: `src/__tests__/storage.test.js`
- Integration tests: `tests/integration/storage-integration.test.js`
