# Testing Guide

This document explains how to run the various tests for the Mobius Games Tutorial Generator client.

## Unit Tests

Unit tests are written with Jest and focus on testing individual functions and components in isolation.

### Running Unit Tests

```bash
# Run all unit tests
npm test

# Run unit tests in watch mode
npm test -- --watch

# Run tests for a specific file
npm test src/api/__tests__/extractBggHtml.test.js

# Run tests with coverage
npm test -- --coverage
```

### Test Structure

- `src/api/__tests__/` - Tests for API helper functions
- `src/utils/__tests__/` - Tests for utility functions
- `src/components/__tests__/` - Tests for React components

## End-to-End (E2E) Tests

E2E tests are written with Playwright and test the application as a real user would interact with it.

### Running E2E Tests

First, make sure the development server is running:

```bash
# In one terminal, start the development server
npm start
```

Then, in another terminal, run the E2E tests:

```bash
# Run all E2E tests
npx playwright test

# Run a specific test file
npx playwright test e2e/toastDeduplication.test.js

# Run tests in headed mode (browser window visible)
npx playwright test --headed

# Run tests with trace viewer for debugging
npx playwright test --trace on
```

### Test Structure

- `e2e/toastDeduplication.test.js` - Tests for toast notification deduplication
- `e2e/qaGating.test.js` - Tests for QA gating functionality
- `e2e/apiSmokeTest.test.js` - Comprehensive tests for API interactions

## Test Environment

The tests use the same environment variables as the development environment. Make sure your `.env` file is properly configured.

For E2E tests, the following environment variables are particularly important:

- `REACT_APP_SHOW_DEV_TEST` - When set to 'true', shows the DevTestPage
- `REACT_APP_QA_LABELS` - When set to 'true', enables QA debugging features

## Writing New Tests

### Unit Tests

1. Create a `__tests__` directory next to the code you're testing
2. Name your test file with the same name as the source file, but with `.test.js` extension
3. Use Jest's mocking capabilities to isolate the code under test
4. Test both success and error cases

### E2E Tests

1. Place new test files in the `e2e/` directory
2. Use Playwright's locator API to find elements by role, text, or test ID
3. Test user interactions and expected outcomes
4. Use `page.addInitScript()` to set up environment variables for specific test scenarios

## Debugging Tests

### Unit Tests

```bash
# Run tests in debug mode
npm test -- --inspect-brk
```

### E2E Tests

```bash
# Run tests with browser visible
npx playwright test --headed

# Generate trace files for debugging
npx playwright test --trace on

# View trace files
npx playwright show-trace test-results/path-to-trace.zip
```