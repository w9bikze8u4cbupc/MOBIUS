# Stress Test Quick Reference

## Quick Start

### Run Stress Test Suite
```bash
npm run e2e:stress
```

### View Results
```bash
cat docs/commissioning/E2E-STRESS-REPORT.md
```

## Test Cases

| ID | Name | Expected Outcome | Expected Gate |
|----|------|------------------|---------------|
| stress-01-poor-ocr | Poor OCR Quality | BLOCK_AT_GATE | confirm_ocr_hazards |
| stress-02-no-toc | No Table of Contents | BLOCK_AT_GATE | confirm_metadata |
| stress-03-missing-components | Missing Component List | BLOCK_AT_GATE | confirm_components |
| stress-04-conflicting-setup | Conflicting Setup Instructions | BLOCK_AT_GATE | confirm_setup_logic |

## Outcomes

### Valid Outcomes
- **PASS** - Full run completes with MP4 + SRT
- **BLOCK_AT_GATE** - Run halts cleanly at specific gate
- **FAIL_HARD** - Run aborts with explicit error
- **SKIPPED** - PDF fixture not available

### Violations (Invalid Outcomes)
- **SILENT_ACCEPTANCE** - Run completes without required confirmation
- **PARTIAL_ARTIFACTS** - MP4/SRT produced despite blocked/failed run
- **IMPLICIT_BLOCK** - Gate blocking without clear identification
- **SILENT_FAILURE** - Hard failure without explicit error message

## Adding Fixtures

1. **Create/obtain PDFs** matching specifications in `data/fixtures/stress/README.md`
2. **Place in directory**: `data/fixtures/stress/`
3. **Use exact filenames**:
   - `poor-ocr-rulebook.pdf`
   - `no-toc-rulebook.pdf`
   - `missing-components-rulebook.pdf`
   - `conflicting-setup-rulebook.pdf`
4. **Run stress test**: `npm run e2e:stress`

## Interpreting Results

### Exit Codes
- **0** - No violations detected (system robust)
- **1** - Violations detected (requires remediation)

### Report Location
`docs/commissioning/E2E-STRESS-REPORT.md`

### Key Sections
- **Executive Summary** - Overall pass/fail
- **Test Cases Table** - Quick overview
- **Detailed Results** - Per-case analysis
- **Violation Analysis** - Severity assessment
- **Recommendations** - Next steps

## Governance Invariants Checked

- ✅ No silent acceptance of low-confidence claims
- ✅ Explicit gate blocking when confirmation required
- ✅ No partial artifacts on blocked/failed runs
- ✅ Explicit error messages on hard failures
- ✅ Append-only artifact storage
- ✅ Canonical path enforcement

## Common Scenarios

### All Fixtures Missing
```
Result: All test cases SKIPPED
Exit Code: 0
Report: Generated with SKIPPED outcomes
Action: Add fixtures to run actual tests
```

### All Tests Block at Gates
```
Result: All test cases BLOCK_AT_GATE
Exit Code: 0 (expected behavior)
Report: Shows gate IDs and no violations
Action: System is robust, no action needed
```

### Silent Acceptance Detected
```
Result: Test case shows PASS when BLOCK_AT_GATE expected
Exit Code: 1 (violation detected)
Report: Shows SILENT_ACCEPTANCE violation
Action: Fix gate enforcement, re-run tests
```

### Partial Artifacts Produced
```
Result: MP4 exists despite BLOCK_AT_GATE outcome
Exit Code: 1 (violation detected)
Report: Shows PARTIAL_ARTIFACTS violation
Action: Fix artifact cleanup, re-run tests
```

## Troubleshooting

### "PDF not found"
**Cause**: Fixture file missing  
**Solution**: Add PDF to `data/fixtures/stress/` with exact filename

### "Unknown outcome"
**Cause**: Output parsing failed  
**Solution**: Check commissioning runner output format

### "Timeout"
**Cause**: Test case taking too long  
**Solution**: Increase timeout in stress suite (default: 5 minutes)

## Documentation

- Full implementation: `PHASE_P1A_STRESS_TESTING_COMPLETE.md`
- Fixture specs: `data/fixtures/stress/README.md`
- Generated report: `docs/commissioning/E2E-STRESS-REPORT.md`
- This quick reference: `STRESS_TEST_QUICK_REFERENCE.md`
