# Enhance API Layer with Production-Ready fetchJson Implementation

## Description

This PR introduces a production-ready `fetchJson` utility that centralizes all API interactions with robust features including retry logic with jitter and Retry-After handling, in-flight request deduplication, structured error mapping, and telemetry-ready metadata. It also migrates existing axios calls to use this new utility and adds comprehensive testing.

### Key Improvements

#### 1. Enhanced fetchJson Utility (`client/src/utils/fetchJson.js`)
- **In-flight Deduplication**: Prevents duplicate concurrent requests using a module-level Map with proper cleanup to avoid memory leaks
- **Abortable Backoff**: Retry delays now respect AbortSignal for immediate cancellation during backoff periods
- **Retry-After Handling**: Properly parses both numeric and HTTP-date formats in Retry-After headers for 429 responses
- **Enhanced Error Diagnostics**: Includes backendRaw property for debugging JSON parse failures and attempt count/timing metadata
- **Telemetry-Ready**: Exposes timing and attempt count information for observability
- **Jittered Retries**: Adds randomized delays to prevent thundering herd
- **Max Timeout**: Caps total retry time to prevent indefinite hanging requests

#### 2. API Helper Migration
- Migrated `extractBggHtml` and `searchImages` helpers to use the new fetchJson utility
- Updated all axios calls to fetchJson throughout the codebase
- Removed axios dependency completely

#### 3. DevTestPage Improvements
- Enhanced with proper accessibility attributes (ARIA labels)
- Added data-testid selectors for reliable E2E testing
- Implemented explicit reset functionality
- Added safety measures to prevent shipping enabled by default

#### 4. Comprehensive Test Coverage
- **Jest Unit Tests**: Cover retry behavior with fake timers, deduplication concurrency, and abort handling
- **Playwright E2E Tests**: Use deterministic selectors, capture artifacts on failure, and include trace collection
- **CI Configuration**: GitHub Actions workflow with proper browser installation and artifact uploads

### Migration Notes

1. **Parameter Changes**: `timeoutMs` has been renamed to `maxTimeout` in fetchJson options
2. **Response Format**: fetchJson now returns metadata along with data: `{ data, status, headers, timing, attempts }`
3. **Error Objects**: Enhanced with `backendRaw`, `attempts`, and `timing` properties for better debugging
4. **Dedupe Pattern**: Updated to use proper in-flight request tracking with cleanup

### Testing

- All Jest tests pass with full coverage
- Playwright tests pass locally and in CI dry-run
- ESLint and Prettier applied consistently

## Changed Files

```
client/src/utils/fetchJson.js
client/src/api/extractBggHtml.js
client/src/api/searchImages.js
client/src/components/DevTestPage.jsx
client/src/api/__tests__/extractBggHtml.test.js
client/src/api/__tests__/searchImages.test.js
client/src/utils/__tests__/fetchJson.test.js
tests/toast-dedupe.spec.js
tests/qa-gating.spec.js
.github/workflows/ci-tests.yml
```

## Checklist

- [x] Code compiles and app runs locally
- [x] All unit tests pass: `npm test -- --coverage`
- [x] Playwright tests pass locally: `npx playwright test`
- [x] ESLint and Prettier applied: `npx eslint . --fix && npx prettier --write .`
- [x] axios removed from package.json
- [x] GitHub Actions workflow configured and tested
- [x] Artifact upload working in CI
- [x] README updated with fetchJson options and dedupe notes