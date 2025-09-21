# Enhance API layer with improved fetchJson, deduplication, and testability

## Description

This PR enhances our API layer by improving the fetchJson utility with better retry logic, deduplication, and telemetry. It also improves testability of our components and tests, and adds comprehensive CI configuration.

### Key improvements:

* **Enhanced fetchJson utility**:
  * Added jitter to backoff to avoid thundering herd
  * Explicit 429 handling with Retry-After header parsing
  * Max timeout option to cap total retry time
  * Improved deduplication with in-flight request tracking
  * Response metadata for telemetry (timing, attempts)
  * Better error handling with raw text inclusion

* **Improved DevTestPage**:
  * Proper environment gating read at boot
  * Added ARIA attributes and keyboard focus handling
  * Data-testid attributes for reliable Playwright selectors
  * Explicit "reset" button for test state
  * Safety measures to prevent shipping enabled by default

* **Enhanced Jest Tests**:
  * Used fake timers to avoid long sleeps during retry testing
  * Added tests for retry behavior with sequential responses
  * Added deduplication testing with toast spying
  * Added concurrency testing for multiple fetches

* **Improved Playwright E2E Tests**:
  * Used deterministic selectors for stable element selection
  * Added screenshot capture for CI debugging
  * Added accessibility verification
  * Added concurrency deduplication tests

* **CI Configuration**:
  * Added GitHub Actions workflow for Jest and Playwright tests
  * Configured artifact upload for test results and coverage
  * Set up proper environment variables for testing
  * Added matrix testing for multiple Node.js versions

### Migration notes:

The improved fetchJson utility now returns response metadata in addition to the data. API helpers need to be updated to access the data property. The DevTestPage now uses data-testid attributes for better testability.

### Testing:

* Run unit tests: `npm test`
* Run E2E tests: `npx playwright test`
* Check CI workflow in GitHub Actions

## Checklist

- [ ] Code compiles and app runs locally
- [ ] All unit tests pass: `npm test`
- [ ] Playwright tests pass locally: `npx playwright test`
- [ ] ESLint and Prettier applied: `npx eslint . --fix && npx prettier --write .`
- [ ] GitHub Actions workflow configured and tested
- [ ] Artifact upload working in CI
- [ ] Add PR reviewers and link to this summary

## Files changed

* `client/src/utils/fetchJson.js` - Enhanced with jitter, 429 handling, max timeout, improved deduplication
* `client/src/components/DevTestPage.jsx` - Improved with accessibility, testability, and safety features
* `client/src/api/__tests__/extractBggHtml.test.js` - Enhanced with fake timers and deduplication testing
* `client/src/api/__tests__/searchImages.test.js` - Enhanced with fake timers and deduplication testing
* `tests/toast-dedupe.spec.ts` - Improved with deterministic selectors and artifact capture
* `tests/qa-gating.spec.ts` - Improved with accessibility verification
* `.github/workflows/ci-tests.yml` - Added GitHub Actions workflow for CI testing

## Next steps

1. Update API helpers to handle new fetchJson response format
2. Update existing tests to match new interfaces
3. Monitor CI for test stability and performance
4. Add documentation for new features