# Repository Verification Report

**Generated:** 2025-09-30T00:03:49.886Z
**Search Term:** "genesis"
**Total Files Scanned:** 41
**Files with Matches:** 5
**Total Matches:** 6

❌ **VERIFICATION FAILED** - Found "genesis" references

## .dockerignore

- **Line 104:** `!scripts/verify-clean-genesis.js`

## Dockerfile.ci

- **Line 22:** `COPY scripts/verify-clean-genesis.js ./scripts/verify-clean-genesis.js`

## finish_mobius_release.sh

- **Line 11:** `VERIFY_CMD="${VERIFY_CMD:-npm run verify-clean-genesis || node scripts/verify-clean-genesis.js}"`

## package.json

- **Line 27:** `"verify-clean-genesis": "node scripts/verify-clean-genesis.js",`

## scripts/verify-clean-genesis.js

- **Line 4:** `* Verification script to check for unwanted "genesis" references in the codebase`
- **Line 13:** `const SEARCH_TERM = 'genesis';`

## Remediation

The following files contain "genesis" references and should be reviewed:

- .dockerignore
- Dockerfile.ci
- finish_mobius_release.sh
- package.json
- scripts/verify-clean-genesis.js
