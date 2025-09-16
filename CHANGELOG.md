# Changelog

## [Unreleased]

### Added
- PERF_BASELINE_PATH environment variable support in compare_perf_to_baseline.cjs for flexible baseline file location
- Branch-aware warn-only default behavior (warn-only on non-main branches, strict on main)
- Promotion guardrails in promote_baselines.cjs:
  - Only main branch can promote baselines
  - Commit must include [baseline] or [perf-baseline] trailer
  - Baseline lowering requires ALLOW_REGRESSION_REASON
  - DRY_RUN=1 prints intent without changing files
- Translation toggles in src/utils/translation.js:
  - TRANSLATE_MODE environment variable with three modes: disabled|optional|required
  - LT_URL environment variable for custom LibreTranslate endpoint
  - Health check before translation calls in required mode with 3-second timeout
- Unit tests for detectLowering function in promotion guardrails

### Changed
- Updated compare_perf_to_baseline.cjs to use candidate paths for baseline file with fallback logic
- Enhanced JUnit reporting in perf baseline comparator with detailed test cases and system output payloads
- Improved translation error handling with graceful fallback in optional mode

### CI/CD Improvements
- Added TRANSLATE_MODE: disabled to CI job environment for network-safe validation
- Configured PERF_BASELINE_PATH: baselines/perf.json in CI job environment
- Ensured JUnit artifact upload with if-no-files-found: error
- Disabled matrix fail-fast and pinned caches for more stable builds
- Enhanced step summary to show perf metrics and artifact pointers

### Security
- Verified 0 vulnerabilities in production dependencies with npm audit --omit=dev

## [1.0.0] - 2025-09-15
### Added
- Initial release of Mobius Games Tutorial Generator
- Pipeline for generating game tutorial videos from structured game rules
- Cross-platform support (Windows, macOS, Linux)
- Visual/audio regression testing
- Audio compliance with EBU R128 standards
- Video container specification validation
- Per-OS baseline comparisons
- System/toolchain information capture for reproducibility