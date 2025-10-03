# WebSocketGuard Test Troubleshooting Guide

## Common Issues and Solutions

### 1. Tests Hanging or Timing Out

**Symptoms**: Tests appear to hang indefinitely or timeout during execution.

**Solutions**:
- Ensure `jest.useRealTimers()` is called in the `afterEach` block
- Verify all `jest.useFakeTimers()` calls have corresponding `jest.useRealTimers()` calls
- Check that `jest.clearAllTimers()` is called in `afterEach`
- Confirm `Math.random` mocks are properly restored with `jest.restoreAllMocks()`

**Debug Commands**:
```bash
# Run with verbose output to see which test is hanging
cd client && npx jest src/utils/__tests__/WebSocketGuard.test.js --verbose

# Run with detectOpenHandles to identify unclosed resources
cd client && npx jest src/utils/__tests__/WebSocketGuard.test.js --detectOpenHandles

# Run a specific test to isolate the issue
cd client && npx jest src/utils/__tests__/WebSocketGuard.test.js -t "test name pattern"
```

### 2. Math.random Mocking Issues

**Symptoms**: Jitter calculations produce inconsistent results, causing tests to fail intermittently.

**Solutions**:
- Ensure `jest.spyOn(global.Math, 'random').mockImplementation(() => 0.X)` is used in tests that verify jitter
- Verify `global.Math.random.mockRestore()` is called in `afterEach` or at the end of each test
- Check that the mocked value produces the expected delay calculation

### 3. WebSocket Event Handler Errors

**Symptoms**: Tests fail with "Cannot read property 'onopen' of undefined" or similar errors.

**Solutions**:
- Use conditional calls for WebSocket event handlers: `if (typeof mockWebSocket.onopen === 'function') mockWebSocket.onopen()`
- Ensure mockWebSocket object includes all necessary event handler properties
- Verify WebSocket mock is properly set up in `beforeEach`

### 4. Timer Advance Issues

**Symptoms**: Tests fail because expected callbacks don't execute within the advanced time.

**Solutions**:
- Calculate the minimum required delay based on exponential backoff formula
- Add a small buffer to the advance time (e.g., 10-20ms extra)
- Use deterministic Math.random values to calculate exact delays

**Example**:
```javascript
// For retryCount = 0, initialDelay = 100ms
// Delay = 100 * 2^0 = 100ms + jitter
// With Math.random = 0.1 and jitter range 0-0.5:
// Jitter = 100 * 0.1 * 0.5 = 5ms
// Total delay = 100 + 5 = 105ms
// Advance by 110ms to ensure execution
jest.advanceTimersByTime(110);
```

### 5. ESLint Rule Violations

**Symptoms**: Linting fails with "Do not access process.env directly" errors.

**Solutions**:
- Replace direct `process.env.VAR` access with the helper function
- Import the helper: `import { getShowDevTest } from './utils/env'`
- Use the helper: `const showDevTest = getShowDevTest()`

### 6. Module Import Errors

**Symptoms**: "Cannot find module" or "Module not found" errors.

**Solutions**:
- Verify file paths in import statements are correct
- Check that new files are properly staged with `git add`
- Ensure the file extension matches the import (`.js` vs `.jsx`)

## Debugging Commands

### Run Tests with Maximum Verbosity
```bash
cd client
npx jest src/utils/__tests__/WebSocketGuard.test.js --verbose --detectOpenHandles --runInBand
```

### Run a Specific Test
```bash
cd client
npx jest src/utils/__tests__/WebSocketGuard.test.js -t "unique test name"
```

### Check for Open Handles
```bash
cd client
npx jest src/utils/__tests__/WebSocketGuard.test.js --detectOpenHandles --forceExit
```

### Run with Coverage Report
```bash
cd client
npx jest src/utils/__tests__/WebSocketGuard.test.js --coverage
```

## Environment Setup

### Node.js Version
Ensure you're using a supported Node.js version (16.x or 18.x).

Check your version:
```bash
node --version
```

### Dependency Installation
If tests fail due to missing dependencies:
```bash
cd client
npm ci
```

## CI/CD Considerations

### GitHub Actions Debugging
If CI fails but local tests pass:
1. Check Node.js version in CI matches local environment
2. Verify all files are committed and pushed
3. Ensure no local-only configuration affects tests
4. Check for platform-specific issues (Windows vs Unix line endings)

## Contact Support

If issues persist after trying these solutions:
1. Capture the full error output
2. Include Node.js and npm versions
3. Note the operating system
4. Provide the specific test that's failing