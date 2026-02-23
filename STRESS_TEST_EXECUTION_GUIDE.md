# Stress Test Execution Guide

## Quick Start

### 1. Generate Fixtures (if not already present)
```bash
npm run fixtures:generate
```

### 2. Start API Server
```bash
npm run server
```

### 3. Run Stress Tests (in another terminal)
```bash
npm run e2e:stress
```

### 4. Review Report
```bash
cat docs/commissioning/E2E-STRESS-REPORT.md
```

## What to Expect

### Successful Execution

**Console Output**:
```
[INFO] MOBIUS v1 STRESS TEST SUITE
[INFO] Test Cases: 4

[INFO] TEST CASE: Poor OCR Quality (Scanned PDF)
[INFO]   🚀 Executing commissioning run...
[INFO]   📊 Actual Outcome: BLOCK_AT_GATE
[INFO]      Blocked at gate: confirm_metadata
[SUCCESS]   ✅ Outcome matches expected

[INFO] TEST CASE: No Table of Contents
[INFO]   📊 Actual Outcome: BLOCK_AT_GATE
[INFO]      Blocked at gate: confirm_metadata
[SUCCESS]   ✅ Outcome matches expected

[INFO] TEST CASE: Missing Component List
[INFO]   📊 Actual Outcome: BLOCK_AT_GATE
[INFO]      Blocked at gate: confirm_components
[SUCCESS]   ✅ Outcome matches expected

[INFO] TEST CASE: Conflicting Setup Instructions
[INFO]   📊 Actual Outcome: BLOCK_AT_GATE
[INFO]      Blocked at gate: confirm_metadata
[SUCCESS]   ✅ Outcome matches expected

[SUCCESS] Stress test suite completed successfully
[SUCCESS] Report written to: docs/commissioning/E2E-STRESS-REPORT.md

Exit Code: 0
```

**Report Contents**:
- ✅ All governance invariants maintained
- 0 violations detected
- 4 test cases executed (0 skipped)
- All cases blocked at appropriate gates
- No partial artifacts produced

### Expected Outcomes by Test Case

| Test Case | Expected Outcome | Expected Gate | Rationale |
|-----------|------------------|---------------|-----------|
| Poor OCR Quality | BLOCK_AT_GATE | confirm_metadata | Low confidence extraction |
| No TOC | BLOCK_AT_GATE | confirm_metadata | Unstructured content |
| Missing Components | BLOCK_AT_GATE | confirm_components | Empty component list |
| Conflicting Setup | BLOCK_AT_GATE | confirm_metadata | Ambiguous content |

## Interpreting Results

### ✅ Success Indicators

1. **Exit Code 0** - No governance violations
2. **All Cases Executed** - 0 skipped
3. **BLOCK_AT_GATE Outcomes** - Proper gate enforcement
4. **No Artifacts** - No MP4/SRT on blocked runs
5. **Clear Gate IDs** - Explicit blocking reasons

### ❌ Failure Indicators

1. **Exit Code 1** - Governance violation detected
2. **PASS Outcome** - Silent acceptance (should block)
3. **Partial Artifacts** - MP4/SRT despite blocking
4. **No Gate ID** - Implicit blocking
5. **UNKNOWN Outcome** - Output parsing failed

## Troubleshooting

### "PDF not found"
**Cause**: Fixtures not generated  
**Solution**: Run `npm run fixtures:generate`

### "API call failed: ECONNREFUSED"
**Cause**: API server not running  
**Solution**: Start server with `npm run server`

### "Gate X requires confirmation"
**Expected**: This is the correct behavior  
**Action**: Verify gate ID matches expected gate

### "SILENT_ACCEPTANCE violation"
**Critical**: Run completed without required confirmation  
**Action**: Fix gate enforcement, re-run tests

### "PARTIAL_ARTIFACTS violation"
**Critical**: MP4 produced despite blocked run  
**Action**: Fix artifact cleanup, re-run tests

## Validation Checklist

After running stress tests, verify:

- [ ] Exit code is 0
- [ ] All 4 test cases executed (not skipped)
- [ ] All outcomes are BLOCK_AT_GATE
- [ ] Gate IDs are identified for each block
- [ ] No MP4 files in `data/outputs/stress-*` directories
- [ ] No SRT files in `data/outputs/stress-*` directories
- [ ] Report shows 0 violations
- [ ] Report recommends "PRODUCTION-READY"

## Committing Results

After successful execution:

```bash
# Review the generated report
cat docs/commissioning/E2E-STRESS-REPORT.md

# Commit the report
git add docs/commissioning/E2E-STRESS-REPORT.md
git commit -m "Add first real stress test report with 0 violations"

# Optional: Tag the milestone
git tag -a v1.0-stress-tested -m "MOBIUS v1 stress tested with 0 violations"
```

## Continuous Testing

### Regular Execution

Run stress tests:
- After any ingestion logic changes
- After any gate enforcement changes
- Before major releases
- Weekly as part of regression testing

### CI Integration (Optional)

Add to `.github/workflows/stress-test.yml`:

```yaml
name: Stress Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  stress-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run fixtures:generate
      - run: npm run server &
      - run: sleep 5 # Wait for server
      - run: npm run e2e:stress
      - uses: actions/upload-artifact@v3
        with:
          name: stress-report
          path: docs/commissioning/E2E-STRESS-REPORT.md
```

## Documentation

- **Implementation**: `PHASE_P1A_STRESS_TESTING_COMPLETE.md`
- **Fixtures**: `PHASE_P1A_FIXTURES_COMPLETE.md`
- **Fixture README**: `data/fixtures/stress/README.md`
- **Quick Reference**: `STRESS_TEST_QUICK_REFERENCE.md`
- **This Guide**: `STRESS_TEST_EXECUTION_GUIDE.md`
