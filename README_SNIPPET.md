## Script Module Pattern

Script modules in this repository follow a specific pattern to prevent import-time side effects and ensure testability:

### Pattern
All script modules must export a `main()` function and avoid import-time side-effects.

```javascript
// Guard against import-time side effects in tests
const runningUnderTest = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;

// Guard top-level execution
if (!runningUnderTest && (!process.env.CI || !process.env.GITHUB_ACTIONS || process.env.FORCE_DESKTOP_SHORTCUT_RUN)) {
  main().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}
```

### Environment Variables
- `FORCE_DESKTOP_SHORTCUT_RUN`: Override CI skip behavior when explicit runs are needed
- `NODE_ENV=test` or `JEST_WORKER_ID`: Automatically detected to prevent execution during tests

### Benefits
- Scripts can be safely imported in test environments without executing side effects
- CI/CD pipelines can import modules without triggering unintended behavior
- Testability is improved through proper module isolation
- Regressions are prevented through import-safety tests and smoke tests