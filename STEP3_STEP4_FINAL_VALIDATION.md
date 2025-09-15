# Step 3 & 4 Final Validation

## Requirements Verification

### ✅ Step 3 — Perf baseline, warn-only, JUnit strictness, promotion guardrails

#### 3.A — Baseline path mismatch: quick fix now vs. permanent fix
- **Quick fix**: Already in use (keeping perf_baseline.json at repo root)
- **Permanent fix**: Implemented support for PERF_BASELINE_PATH env var with fallback to:
  1. `process.env.PERF_BASELINE_PATH`
  2. `baselines/perf.json` (new standard location)
  3. `perf_baseline.json` (legacy location)

#### 3.B — Warn-only behavior you can reliably reproduce
- Verified that warn-only mode correctly maps performance regressions to JUnit "skipped" status
- Tested with tightened baseline (increased FPS requirement) to force regression
- Confirmed exit code 0 with "skipped" in JUnit when PERF_WARN_ONLY=1

#### 3.C — JUnit strictness in CI
- Confirmed negative test by relocating JUnit XMLs works correctly
- Verified GH Actions can enforce JUnit file presence with:
  - `actions/upload-artifact@v4` with `if-no-files-found: error`
  - Optional guard step that fails if zero JUnit files are found

#### 3.D — Baseline promotion guardrails
- Implemented comprehensive guardrails in promote_baselines.cjs:
  - Only main branch can promote baselines
  - Commits must include [baseline] or [perf-baseline] trailers
  - Proper handling of regression reasons
  - Dry-run support for safe testing

### ✅ Step 4 — LibreTranslate mode: disable/mock in CI, local override

#### 4.A — Minimal toggle in code
- Added TRANSLATE_MODE environment variable support in translation.js
- Three modes implemented:
  - 'disabled': Completely skips translation
  - 'optional': Gracefully falls back to source text on errors
  - 'required': Fails hard on translation errors (default behavior)
- Added LT_URL environment variable support for custom LibreTranslate endpoints

#### 4.B — CI: disable translation
- Configured CI to use TRANSLATE_MODE=disabled to prevent network dependencies
- Verified that npm run ci:validate works correctly with disabled translation

#### 4.C — Local LibreTranslate via Docker (optional)
- Documented Docker-based local LibreTranslate server setup
- Provided health check commands for Windows/macOS/Linux

## Test Results Summary

All tests passed successfully:

| Test | Status | Notes |
|------|--------|-------|
| Baseline path fix | ✅ | PERF_BASELINE_PATH works correctly |
| Warn-only regression | ✅ | Maps to JUnit "skipped" with exit code 0 |
| Promotion guardrails | ✅ | Properly block inappropriate promotions |
| Translation mode toggles | ✅ | All three modes work as expected |
| CI validation | ✅ | Works with TRANSLATE_MODE=disabled |

## Files Modified

1. `scripts/compare_perf_to_baseline.cjs` - Added baseline path flexibility
2. `scripts/promote_baselines.cjs` - Added promotion guardrails
3. `src/utils/translation.js` - Added translation mode toggles

## Patch Files Created

1. `compare_perf_to_baseline.patch` - Diff for baseline path changes
2. `promote_baselines.patch` - Diff for promotion guardrails
3. `translation.patch` - Diff for translation mode toggles

## Implementation Summary

The implementation provides a robust, CI-friendly performance validation and baseline management system with proper guardrails and flexibility for different environments. All requirements from Steps 3 and 4 have been successfully implemented and validated.