# CI Failure Analysis

This document analyzes the CI failures observed in the local test run and provides solutions.

## Summary of Failures

From the test run, we observed 5 test suites failing with various issues:

1. `tests/ingest/bgg.unit.test.js` - ESM module import issues
2. `src/utils/__tests__/scriptUtils.test.js` - Missing export `formatTime`
3. `tests/ingest/pdf.unit.test.js` - Test expectation not met (promise resolved instead of rejected)
4. `tests/api/ingest.integration.test.js` - Express module import issues
5. `tests/utils/ingestQueue.test.js` - Test expectation not met (promise resolved instead of rejected)

## Detailed Analysis

### 1. ESM Module Import Issues (`bgg.unit.test.js`)

**Error:**
```
Must use import to load ES Module: .../src/ingest/bgg.js
```

**Root Cause:**
The test is using `jest.requireActual()` to import an ES module, but Jest requires special handling for ESM modules.

**Solution:**
Update the test to properly import ES modules:

```javascript
// Instead of:
const { fetchBGG } = jest.requireActual('../../src/ingest/bgg.js');

// Use:
const { fetchBGG } = await import('../../src/ingest/bgg.js');
```

### 2. Missing Export (`scriptUtils.test.js`)

**Error:**
```
SyntaxError: The requested module '../scriptUtils' does not provide an export named 'formatTime'
```

**Root Cause:**
The `formatTime` function is either not exported or not exported correctly from `scriptUtils.js`.

**Solution:**
Check `src/utils/scriptUtils.js` and ensure `formatTime` is properly exported:

```javascript
// In src/utils/scriptUtils.js
export function formatTime(time) {
  // implementation
}

// Or if it's a default export:
export default function formatTime(time) {
  // implementation
}
```

### 3. Test Expectation Not Met (`pdf.unit.test.js`)

**Error:**
```
expect(received).rejects.toThrow()
Received promise resolved instead of rejected
```

**Root Cause:**
The test expects the function to reject (throw an error) but it's actually resolving successfully.

**Solution:**
Either fix the implementation to properly throw an error in the test case, or update the test expectation:

```javascript
// If the function should resolve:
await expect(extractTextAndChunks(testFilePath)).resolves.toBeDefined();

// Or fix the implementation to throw an error when expected
```

### 4. Express Module Import Issues (`ingest.integration.test.js`)

**Error:**
```
SyntaxError: The requested module 'express' does not provide an export named 'Router'
```

**Root Cause:**
The test is trying to import `Router` from express using named imports, but express uses default export.

**Solution:**
Update the import statement:

```javascript
// Instead of:
import { Router } from 'express';

// Use:
import express from 'express';
const Router = express.Router;
```

### 5. Test Expectation Not Met (`ingestQueue.test.js`)

**Error:**
```
expect(received).rejects.toThrow('queue_saturated')
Received promise resolved instead of rejected
```

**Root Cause:**
Similar to issue #3, the test expects the function to reject but it's resolving.

**Solution:**
Fix either the implementation or the test expectation based on the intended behavior.

## Recommended Fixes

### 1. Update Jest Configuration for ESM Support

Add to `package.json`:
```json
{
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js"
  },
  "jest": {
    "testEnvironment": "node",
    "transform": {
      "^.+\\.(t|j)sx?$": "babel-jest"
    },
    "extensionsToTreatAsEsm": [".js"],
    "moduleNameMapper": {
      "^(\\.{1,2}/.*)\\.js$": "$1"
    }
  }
}
```

### 2. Fix Import Statements in Tests

Update the failing test files to properly handle ESM imports.

### 3. Add Babel Configuration

Create `.babelrc`:
```json
{
  "presets": [
    ["@babel/preset-env", {
      "targets": {
        "node": "18"
      }
    }]
  ]
}
```

## Immediate Action Plan

1. **Fix the most critical ESM issues** in `bgg.unit.test.js`
2. **Update Jest configuration** to properly support ESM
3. **Run tests again** to see if the remaining issues are resolved
4. **Address individual test failures** one by one

## Commands to Test Fixes

```bash
# Run specific failing test
npm test -- tests/ingest/bgg.unit.test.js

# Run all tests
npm test

# Run with verbose output for debugging
npm test -- --verbose
```

This should help resolve the CI failures and get the PR to a green state.