# Genesis Verification Script

This script ensures the MOBIUS repository is clean of any accidental "genesis" references, which could cause issues in production.

## Quick Usage

```bash
# Fast verification (recommended for CI)
npm run verify-clean-genesis

# Detailed verification (includes binary files and git history)
npm run verify-clean-genesis-detailed
```

## Features

### Fast Mode (Default)
- Scans all text files in working tree
- Checks git commit messages
- Excludes binary files for speed
- Typical scan time: ~25ms

### Detailed Mode
- All fast mode features
- Scans binary files
- Deep git history content search
- Checks temporary files
- More thorough but slower

## Exit Codes

- `0` = Clean (no matches found)
- `1` = Matches found (needs attention)
- `2` = Script error

## Integration

### Local Development
Run before committing changes:
```bash
npm run verify-clean-genesis
```

### CI Pipeline
Add to your workflow:
```yaml
- name: Verify Clean Genesis
  run: npm run verify-clean-genesis
```

## Report Generation

Each run generates a detailed report: `genesis-verification-report.md`

The report includes:
- Scan statistics
- Found matches with file locations and line numbers
- Recommendations for cleanup
- Timestamp and mode information

## Examples

### Clean Repository
```
Status: ✅ CLEAN
Total Matches: 0
Files Scanned: 23
Duration: 24ms
```

### Matches Found
```
Status: ❌ MATCHES FOUND
Total Matches: 2
Files Scanned: 24

❌ Matches found:
  1. file: src/config.js (line 15)
  2. file: docs/README.md (line 42)
```

## Technical Details

The script intelligently excludes:
- Its own files (`verify-clean-genesis.js`)
- Generated reports (`*-verification-report.md`)
- NPM script references in `package.json`
- Files matching `.gitignore` patterns
- System and temporary directories

## Troubleshooting

If you encounter false positives, check:
1. Are the references legitimate (e.g., documentation)?
2. Should they be excluded via the `isLegitimateReference()` function?
3. Are they in files that should be ignored?

Contact the development team if you need help interpreting results.