# FetchJson Implementation Artifacts

This directory contains complete implementations of all artifacts mentioned in the preparation summary.

## Contents

1. `fetchJson.js` - Full implementation of the fetchJson utility with retries, error mapping, and toast deduplication
2. `DevTestPage.jsx` - Complete DevTestPage component for validation
3. `extractBggHtml.test.js` - Jest unit test for extractBggHtml API helper
4. `searchImages.test.js` - Jest unit test for searchImages API helper
5. `toast-dedupe.spec.ts` - Playwright E2E test for toast deduplication
6. `qa-gating.spec.ts` - Playwright E2E test for QA gating features

## How to Use

### 1. FetchJson Implementation

Copy `fetchJson.js` to `client/src/utils/fetchJson.js`

This implementation includes:
- Consistent JSON fetch with auth header support
- Retries with exponential backoff for transient errors
- Abort signal support
- Centralized error translation using errorMap
- Toast integration with deduplication

### 2. DevTestPage Component

Copy `DevTestPage.jsx` to `client/src/components/DevTestPage.jsx`

To enable the DevTestPage in your app:
1. Set `REACT_APP_SHOW_DEV_TEST=true` in your `.env` file
2. Restart your development server
3. The DevTestPage will appear in your app

### 3. Jest Unit Tests

Copy the test files to your `client/src/api/__tests__/` directory:
- `extractBggHtml.test.js`
- `searchImages.test.js`

Run tests with:
```bash
npm test
# or
yarn test
```

### 4. Playwright E2E Tests

Copy the test files to your `tests/` directory:
- `toast-dedupe.spec.ts`
- `qa-gating.spec.ts`

Run E2E tests with:
```bash
npx playwright test
```

## Next Steps

1. Migrate remaining API calls to use fetchJson
2. Expand Jest coverage for edge cases
3. Add Playwright tests to CI pipeline
4. Integrate fetchJson telemetry hooks for observability
5. Add documentation for fetchJson options and toast deduping