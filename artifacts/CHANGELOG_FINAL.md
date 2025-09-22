# Changelog

## [Unreleased]

### Added

- Production-ready `fetchJson` utility with comprehensive features:
  - In-flight request deduplication with proper cleanup to prevent memory leaks
  - Abortable backoff that respects AbortSignal during sleep periods
  - Retry-After header parsing for both numeric and HTTP-date formats
  - Enhanced error diagnostics with backendRaw property for debugging
  - Telemetry-ready metadata including timing and attempt counts
  - Jittered retries to prevent thundering herd
  - Max timeout option to prevent indefinite hanging requests
- Comprehensive test suite:
  - Jest unit tests covering retry behavior with fake timers
  - Playwright E2E tests with deterministic selectors and artifact capture
  - CI configuration with GitHub Actions workflow
- DevTestPage improvements:
  - Accessibility attributes (ARIA labels)
  - Data-testid selectors for reliable testing
  - Explicit reset functionality
  - Safety measures to prevent shipping enabled by default

### Changed

- Migrated all API helper modules to use fetchJson instead of axios
- Updated extractBggHtml and searchImages helpers with new fetchJson interface
- Renamed timeoutMs parameter to maxTimeout in fetchJson options
- Enhanced error objects with additional debugging information
- Improved response format to include metadata alongside data

### Removed

- Complete removal of axios dependency from the codebase
- Legacy axios-based API calls throughout the application

### Fixed

- Memory leak issues with in-flight request deduplication
- Abort handling during backoff periods
- Retry-After header parsing for 429 responses
- Error diagnostics for JSON parse failures
- Test flakiness with fake timer implementations

### Migration Notes

1. Parameter Changes: timeoutMs has been renamed to maxTimeout in fetchJson options
2. Response Format: fetchJson now returns metadata along with data: { data, status, headers, timing, attempts }
3. Error Objects: Enhanced with backendRaw, attempts, and timing properties for better debugging
4. Dedupe Pattern: Updated to use proper in-flight request tracking with cleanup
