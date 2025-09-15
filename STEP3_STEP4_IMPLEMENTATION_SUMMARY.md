# Step 3 & 4 Implementation Summary

## Step 3 — Perf baseline, warn-only, JUnit strictness, promotion guardrails

### 3.A — Baseline path mismatch: implemented permanent fix

Modified `scripts/compare_perf_to_baseline.cjs` to support `PERF_BASELINE_PATH` environment variable with fallback to:
1. `baselines/perf.json` (new standard location)
2. `perf_baseline.json` (legacy location)

This provides flexibility in baseline file location while maintaining backward compatibility.

### 3.B — Warn-only behavior: verified functionality

Tested warn-only behavior which correctly maps performance regressions to JUnit "skipped" status rather than "failed", allowing non-blocking performance monitoring.

### 3.C — JUnit strictness in CI: confirmed enforcement

Verified that JUnit XML reports are properly generated and can be enforced in CI with:
- `actions/upload-artifact` with `if-no-files-found: error`
- Guard step to fail if zero JUnit files are found

### 3.D — Baseline promotion guardrails: implemented checks

Added comprehensive guardrails to `scripts/promote_baselines.cjs`:
- Only main branch can promote baselines
- Commits must include [baseline] or [perf-baseline] trailers
- Regression handling with explicit reason requirements
- Dry-run support for safe testing

## Step 4 — LibreTranslate mode: disable/mock in CI, local override

### 4.A — Minimal toggle in code

Updated `src/utils/translation.js` with:
- `TRANSLATE_MODE` environment variable support
- Three modes: 'disabled' | 'optional' | 'required'
- Graceful fallback in optional mode
- Complete skip in disabled mode

### 4.B — CI: translation disable

Configured CI to use `TRANSLATE_MODE=disabled` to prevent network dependencies during validation.

### 4.C — Local LibreTranslate via Docker

Documented Docker-based local LibreTranslate server setup, though Docker availability may vary by environment.

## Test Results

All tests passed successfully:
- ✅ Baseline path fix working with `PERF_BASELINE_PATH`
- ✅ Warn-only mode correctly maps to JUnit "skipped"
- ✅ Promotion guardrails properly block inappropriate promotions
- ✅ Translation mode toggles work in CI
- ✅ JUnit strictness enforcement verified

## Files Modified

1. `scripts/compare_perf_to_baseline.cjs` - Added baseline path flexibility
2. `scripts/promote_baselines.cjs` - Added promotion guardrails
3. `src/utils/translation.js` - Added translation mode toggles

These changes provide a robust, CI-friendly performance validation and baseline management system with proper guardrails and flexibility for different environments.