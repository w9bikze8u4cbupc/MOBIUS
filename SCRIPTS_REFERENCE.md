# MOBIUS Scripts Reference

This document provides information about scripts referenced in the PR merge checklist and their current implementation status.

## Existing Scripts ✅

### `scripts/check_golden.js`
**Purpose:** Validates golden files for media regression testing  
**Usage:** `node scripts/check_golden.js --game "Game Name" --in "input.mp4" --golden "tests/golden/game" --frames "5,10,20" --ssim "0.995" --lufs_tol "1.0" --tp_tol "1.0"`  
**Output:** SSIM comparison, audio compliance check, JUnit XML reports  
**Integration:** Used by `npm run golden:check:*` scripts

### `scripts/generate_golden.js`
**Purpose:** Generates golden reference files for media testing  
**Usage:** `node scripts/generate_golden.js --game "Game Name" --in "input.mp4" --out "tests/golden/game" --frames "5,10,20"`  
**Output:** Reference frames, audio stats, container metadata  
**Integration:** Used by `npm run golden:update:*` scripts

## Scripts Referenced in Checklist (To Be Implemented) ⚠️

### `scripts/backup_library.sh`
**Purpose:** Create timestamped backups before production deployment  
**Expected Usage:** `./scripts/backup_library.sh`  
**Expected Output:** Backup archive with SHA256 checksum  
**Status:** 🔴 Not implemented - create before production use

### `scripts/deploy_dhash.sh`
**Purpose:** Deploy MOBIUS DHash/media pipeline  
**Expected Usage:** 
- Dry run: `./scripts/deploy_dhash.sh --dry-run`
- Production: `./scripts/deploy_dhash.sh`  
**Status:** 🔴 Not implemented - create before production use

### `scripts/migrate-dhash.js`
**Purpose:** Run database/data migrations for DHash system  
**Expected Usage:**
- Dry run: `node scripts/migrate-dhash.js --dry-run`
- Production: `node scripts/migrate-dhash.js`  
**Status:** 🔴 Not implemented - create before production use

### `scripts/rollback_dhash.sh`
**Purpose:** Rollback deployment in case of issues  
**Expected Usage:** `./scripts/rollback_dhash.sh`  
**Status:** 🔴 Not implemented - create before production use

### `scripts/smoke-tests.js`
**Purpose:** Post-deployment smoke testing  
**Expected Usage:** `node scripts/smoke-tests.js`  
**Status:** 🔴 Not implemented - create before production use

## CI Workflow Scripts (Referenced but may be external)

### `scripts/capture_provenance.sh` / `scripts/capture_provenance.ps1`
**Purpose:** Capture build/deployment provenance information  
**Platform:** Unix/Windows versions  
**Status:** 🟡 Referenced in CI workflow but not found in scripts directory

### `scripts/check_audio_compliance.py` / `scripts/check_audio_compliance.ps1`
**Purpose:** Validate audio meets compliance standards  
**Platform:** Python/PowerShell versions  
**Status:** 🟡 Referenced in CI workflow but not found in scripts directory

### `scripts/check_container.sh` / `scripts/check_container.ps1`
**Purpose:** Validate container/video format compliance  
**Platform:** Unix/Windows versions  
**Status:** 🟡 Referenced in CI workflow but not found in scripts directory

## Implementation Priority

1. **High Priority (Production Blockers):**
   - `scripts/backup_library.sh`
   - `scripts/deploy_dhash.sh`
   - `scripts/rollback_dhash.sh`

2. **Medium Priority (Operational):**
   - `scripts/migrate-dhash.js`
   - `scripts/smoke-tests.js`

3. **Low Priority (CI Enhancement):**
   - CI workflow scripts (may be implemented elsewhere)

## Notes for Developers

- Scripts should follow the existing pattern in `check_golden.js` and `generate_golden.js`
- Use Node.js for JavaScript scripts to maintain consistency
- Shell scripts should have both Unix (`*.sh`) and Windows (`*.ps1`) versions where referenced in CI
- All deployment scripts should support `--dry-run` mode
- Include proper error handling and logging
- Generate artifacts that can be uploaded to CI for debugging

## Integration with NPM Scripts

Consider adding the missing scripts to `package.json` once implemented:

```json
{
  "scripts": {
    "deploy:dry-run": "scripts/deploy_dhash.sh --dry-run",
    "deploy": "scripts/deploy_dhash.sh",
    "migrate:dry-run": "node scripts/migrate-dhash.js --dry-run",
    "migrate": "node scripts/migrate-dhash.js",
    "backup": "scripts/backup_library.sh",
    "smoke-test": "node scripts/smoke-tests.js",
    "rollback": "scripts/rollback_dhash.sh"
  }
}
```