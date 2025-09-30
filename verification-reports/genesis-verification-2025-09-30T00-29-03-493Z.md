# Genesis Verification Report

**Generated:** 2025-09-30T00:29:03.493Z
**Repository:** MOBIUS
**Files Scanned:** 36
**Matches Found:** 6

⚠️ **MATCHES FOUND**: The following "genesis" references were detected:

### finish_mobius_release.sh

- **Line 11:** `genesis` in `VERIFY_CMD="${VERIFY_CMD:-npm run verify-clean-genesis || node scripts/verify-clean-genesis.js}"`
- **Line 11:** `genesis` in `VERIFY_CMD="${VERIFY_CMD:-npm run verify-clean-genesis || node scripts/verify-clean-genesis.js}"`

### package.json

- **Line 27:** `genesis` in `"verify-clean-genesis": "node scripts/verify-clean-genesis.js",`
- **Line 27:** `genesis` in `"verify-clean-genesis": "node scripts/verify-clean-genesis.js",`
- **Line 28:** `genesis` in `"verify-clean-genesis:detailed": "node scripts/verify-clean-genesis.js --detailed",`
- **Line 28:** `genesis` in `"verify-clean-genesis:detailed": "node scripts/verify-clean-genesis.js --detailed",`

## Recommended Actions

1. Review each match to determine if it's an accidental reference
2. Remove or replace any unintended "genesis" references
3. Re-run verification: `npm run verify-clean-genesis`
4. Commit changes if cleanup is needed

## Verification Details

- **Search Patterns:** `/genesis/gi`, `/Genesis/g`, `/GENESIS/g`
- **Excluded Patterns:** `/node_modules/`, `/\.git/`, `/\.log$/`, `/\.tmp$/`, `/package-lock\.json$/`, `/verification-reports/`, `/ci-run-logs/`, `/\.dockerignore$/`, `/Dockerfile/`, `/\.md$/i`, `/scripts\/verify-clean-genesis\.js$/`
- **Scan Method:** Recursive directory traversal
- **Script Version:** 1.0.0

