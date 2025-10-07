## fix(desktop): prevent import-time side effects; add import-safety test

### Summary
This release addresses critical import-time side effects in the desktop shortcut scripts that were causing CI failures and preventing proper test execution.

### Changes
- **Desktop Scripts**: Wrapped main logic in exported `main()` functions for both desktop scripts
  - `scripts/create-desktop-shortcut.mjs`
  - `scripts/verify-desktop-shortcuts.mjs`
- **Import-time Guards**: Added guards to prevent execution during import in test environments
- **CI Environment Handling**: Preserved `FORCE_DESKTOP_SHORTCUT_RUN` override for explicit runs
- **Testing**: Added import-safety Jest tests and CI smoke-test for fast import checks
- **CI Workflow**: Updated to run both root and client tests to ensure proper test coverage

### Benefits
- Fixes CI failures caused by import-time side effects
- Enables safe import of scripts in test environments
- Adds preventive measures to avoid future regressions
- Maintains all existing functionality while improving reliability

### Technical Details
Script modules now follow the recommended pattern:
```javascript
const runningUnderTest = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
if (!runningUnderTest && (!process.env.CI || !process.env.GITHUB_ACTIONS || process.env.FORCE_DESKTOP_SHORTCUT_RUN)) {
  main().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}
```

### Verification
All tests pass locally and in CI. The import-safety smoke test runs on every PR/push to catch regressions early.