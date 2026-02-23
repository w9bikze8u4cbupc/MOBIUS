# ProV0-01 Smoke Checks Reference

**Version**: 1.0  
**Date**: 2026-02-23

## Quick Reference

### Run All Smoke Checks

```bash
npm run smoke:all
```

**Duration**: ~2 seconds  
**Exit Code**: 0 if all pass, 1 if any fail

### Individual Smoke Checks

#### 1. Syntax Validation

```bash
npm run smoke:e2e-syntax
```

**Validates**:
- `scripts/e2e/e2e-01-commission.mjs` parses cleanly
- `scripts/releases/prov0-01-run.mjs` parses cleanly
- `scripts/releases/generate-pro-v0-runlog.mjs` parses cleanly

**Duration**: < 1 second

#### 2. Dry-Run + Verification

```bash
npm run smoke:prov0-01-dry
```

**Validates**:
- Dry-run executes successfully
- Stub runlog JSON generated with `mode: "DRY_RUN"`
- Stub QC review MD generated with "DRY RUN" markers
- Both files exist at expected paths
- Content is correctly labeled

**Duration**: ~1 second

## Expected Outputs

### Syntax Validation

```
> node --check scripts/e2e/e2e-01-commission.mjs && ...

Exit Code: 0
```

### Dry-Run Execution

```
================================================================================
ProV0-01 DRY RUN MODE
================================================================================
Generating stub dossier artifacts...

✅ Stub runlog: .../PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json
✅ Stub QC review: .../PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md

================================================================================
DRY RUN COMPLETE
================================================================================
```

### Stub Verification

```
================================================================================
SMOKE TEST: Verify Dry-Run Stub Artifacts
================================================================================

Checking runlog JSON...
  ✅ File exists
  ✅ Mode: DRY_RUN
  ✅ Status: DRY_RUN_COMPLETE
  ✅ Objective QC: SKIPPED_DRY_RUN
  ✅ Artifacts: empty (as expected)

Checking QC review MD...
  ✅ File exists
  ✅ Contains "DRY RUN" marker
  ✅ Contains "DRY_RUN" verdict
  ✅ Contains no-artifacts warning

================================================================================
✅ SMOKE TEST PASSED
================================================================================
```

## Failure Scenarios

### Syntax Error

```
SyntaxError: Unexpected token ':'
```

**Fix**: Correct syntax error in indicated file

### Dry-Run Fails

```
DRY RUN FAILED
Error: Cannot write file...
```

**Fix**: Check file permissions in `docs/releases/`

### Stub Verification Fails

```
❌ SMOKE TEST FAILED

Errors:
  ❌ Runlog JSON not found: .../PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json
```

**Fix**: Ensure dry-run completed successfully before verification

### Missing DRY_RUN Marker

```
❌ Runlog mode is "PRODUCTION", expected "DRY_RUN"
```

**Fix**: Stub generation logic may be broken, check `generateDryRunStubsStandalone()`

## Integration with Test Suite

### Full Test Suite

```bash
npm run test:all
```

**Order**:
1. Smoke checks (`smoke:all`)
2. Unit tests (`test:unit`)
3. Integration tests (`test:integration`)

**Behavior**:
- Smoke checks run first (fast-fail)
- If smoke checks fail, unit/integration tests don't run
- Total duration: ~17 seconds

### CI/CD Integration

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install Dependencies
        run: npm ci
      
      - name: Smoke Checks
        run: npm run smoke:all
      
      - name: Unit Tests
        run: npm run test:unit
      
      - name: Integration Tests
        run: npm run test:integration
```

## Troubleshooting

### Smoke Checks Pass but Production Fails

**Issue**: Smoke checks only validate wiring, not actual processing

**Solution**: Run full production test with real PDF:
```bash
npm run release:prov0-01 -- \
  --pdf test.pdf \
  --confirm-file confirmations.json
```

### Stub Files Persist After Production Run

**Issue**: Dry-run stubs not cleaned up

**Solution**: Stubs are overwritten by production run. If concerned:
```bash
rm docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_*.{json,md}
```

### Verification Fails on Fresh Clone

**Issue**: Stub files don't exist yet

**Solution**: Run dry-run first:
```bash
npm run release:prov0-01:dry
node scripts/smoke/verify-dryrun-stubs.mjs
```

Or use combined command:
```bash
npm run smoke:prov0-01-dry
```

## Best Practices

### Pre-Commit

```bash
# Quick validation before commit
npm run smoke:all
```

### Pre-Push

```bash
# Full validation before push
npm run test:all
```

### Pre-Production

```bash
# Validate wiring
npm run smoke:all

# Test with real PDF (dry-run first)
npm run release:prov0-01:dry

# Then run production
npm run release:prov0-01 -- --pdf <path> --confirm-file <path>
```

### CI/CD

- Run `smoke:all` on every PR
- Block merge if smoke checks fail
- Run full test suite on main branch
- Upload stub artifacts as build artifacts

## File Locations

### Stub Artifacts

- **Runlog**: `docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json`
- **Review**: `docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md`

### Scripts

- **Dry-run**: `scripts/releases/prov0-01-run.mjs`
- **Verification**: `scripts/smoke/verify-dryrun-stubs.mjs`
- **E2E**: `scripts/e2e/e2e-01-commission.mjs`
- **Runlog generator**: `scripts/releases/generate-pro-v0-runlog.mjs`

### Documentation

- **Autonomous execution**: `docs/releases/AUTONOMOUS_EXECUTION.md`
- **Quick start**: `docs/releases/PROV0_01_QUICK_START.md`
- **Production guide**: `docs/releases/PRO_VIDEO_V0_PRODUCTION_GUIDE.md`

## Exit Codes

- **0**: All checks passed
- **1**: One or more checks failed

## Support

For issues with smoke checks:
1. Check console output for specific error
2. Verify file permissions in `docs/releases/`
3. Ensure git is available (for commit SHA)
4. Run individual checks to isolate issue

For production issues:
- See `docs/releases/AUTONOMOUS_EXECUTION.md`
- See `docs/releases/PROV0_01_QUICK_START.md`

---

**Reference Version**: 1.0  
**Last Updated**: 2026-02-23
