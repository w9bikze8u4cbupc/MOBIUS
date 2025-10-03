# Test Instructions

## Summary

This document provides the exact commands to run the updated WebSocketGuard tests and verify they work correctly.

## Prerequisites

Make sure you're in the root directory of the repository.

## Commands to Run Tests

1. Run all client tests:
   ```bash
   cd client && npm test
   ```

2. Run only the WebSocketGuard tests:
   ```bash
   cd client && npm test -- src/utils/__tests__/WebSocketGuard.test.js
   ```

3. Run tests in watch mode (useful for development):
   ```bash
   cd client && npm test -- --watch src/utils/__tests__/WebSocketGuard.test.js
   ```

## Expected Results

All tests should pass without any hanging or memory leaks. The enhanced afterEach cleanup ensures that:

1. Timers are properly restored to real timers
2. All pending timers are cleared
3. Mocks are properly reset and restored
4. WebSocket connections are closed
5. Math.random is restored if it was mocked

## Test Improvements

The updated test file includes:

1. Robust afterEach teardown that cleans up all resources
2. Deterministic Math.random mocking for consistent jitter testing
3. Unique test names to avoid confusion
4. Proper handling of WebSocket event callbacks
5. Comprehensive cleanup of all mocks and timers

## Troubleshooting

If you encounter any issues:

1. Make sure all dependencies are installed:
   ```bash
   npm install
   ```

2. If tests are still hanging, try running with forceExit:
   ```bash
   cd client && npm test -- --forceExit src/utils/__tests__/WebSocketGuard.test.js
   ```

3. To run tests with verbose output:
   ```bash
   cd client && npm test -- --verbose src/utils/__tests__/WebSocketGuard.test.js
   ```