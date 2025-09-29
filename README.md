# MOBIUS - Game Tutorial Video Generator

A pipeline for generating game tutorial videos from structured game rules.

## Repository Verification

This repository includes automated tools to verify cleanliness and ensure no accidental sensitive references exist.

### Genesis Reference Verification

To verify the repository is clean of any "genesis" references:

```bash
# Quick verification
npm run verify-clean-genesis

# Detailed verification (includes binary file scanning)
npm run verify-clean-genesis-detailed
```

The verification script (`scripts/verify-clean-genesis.js`) checks:
- Current working tree files
- Git commit history  
- Temporary/backup files
- Binary file content (in detailed mode)

See `docs/genesis-verification-report.md` for full verification details.

## Scripts

- `verify-clean-genesis` - Run repository cleanliness verification
- `verify-clean-genesis-detailed` - Run detailed verification including binary files
- `test` - Run test suite
- `golden:check` - Verify golden test artifacts
- `golden:update` - Update golden test artifacts

## Development

```bash
npm install
npm test
```
