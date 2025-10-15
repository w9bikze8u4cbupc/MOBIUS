# CI Troubleshooting Guide

This guide helps diagnose and resolve common CI issues encountered in the Mobius Preview Worker implementation.

## Common CI Failure Types

### 1. ESM/Jest Configuration Issues

**Symptoms:**
- Tests fail with "SyntaxError: Cannot use import statement outside a module"
- Jest fails with "ReferenceError: module is not defined"
- Tests fail with "ERR_REQUIRE_ESM" or "ERR_REQUIRE_COMMONJS"

**Solutions:**
1. Ensure `package.json` has `"type": "module"` if using ESM
2. Check Jest configuration in `package.json`:
   ```json
   "jest": {
     "testEnvironment": "node",
     "transform": {
       "^.+\\.(t|j)sx?$": "babel-jest"
     },
     "moduleNameMapper": {
       "^(\\.{1,2}/.*)\\.js$": "$1"
     }
   }
   ```
3. Run tests with experimental VM modules:
   ```bash
   NODE_OPTIONS=--experimental-vm-modules npm test
   ```

### 2. Node Version Compatibility Issues

**Symptoms:**
- Tests pass on one Node version but fail on another
- Syntax errors related to newer JavaScript features
- Missing dependencies or incorrect versions

**Solutions:**
1. Check `.github/workflows/ci.yml` for Node version matrix:
   ```yaml
   strategy:
     matrix:
       node-version: [18.x, 20.x]
   ```
2. Use `nvm` to test locally:
   ```bash
   nvm install 18
   nvm use 18
   npm ci
   npm test
   
   nvm install 20
   nvm use 20
   npm ci
   npm test
   ```

### 3. Missing Dependencies

**Symptoms:**
- "Module not found" errors
- "Cannot find package" errors
- Tests fail with import errors

**Solutions:**
1. Ensure all dependencies are listed in `package.json`
2. Run `npm ci` to install exact versions from `package-lock.json`
3. Check for platform-specific dependencies

### 4. Fast-Failing Workflows

**Symptoms:**
- Jobs fail within seconds
- "Process completed with exit code 1" immediately
- Missing environment variables or secrets

**Solutions:**
1. Check workflow syntax:
   ```yaml
   - uses: actions/checkout@v4
   - uses: actions/setup-node@v4
     with:
       node-version: 18
   ```
2. Ensure required secrets are configured in repository settings
3. Check for missing environment variables

### 5. Golden Check Failures

**Symptoms:**
- Visual regression tests fail
- Missing system dependencies
- Font rendering differences

**Solutions:**
1. Ensure headless browser dependencies are installed:
   ```yaml
   - name: Install system dependencies
     run: |
       sudo apt-get update
       sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libgbm-dev libxss1 libasound2
   ```
2. Check font installation:
   ```yaml
   - name: Install fonts
     run: |
       sudo apt-get install -y fonts-liberation fonts-noto-color-emoji
   ```

## Debugging Steps

### 1. Reproduce Locally

```bash
# Clean install
rm -rf node_modules package-lock.json
npm cache clean --force
npm ci

# Run tests
npm run test:preview-payloads
npm test

# Test with specific Node version
nvm use 18
npm test

nvm use 20
npm test
```

### 2. Check CI Logs

1. Open the failing job in GitHub Actions
2. Click on the failing step
3. Expand the logs and look for:
   - First error message
   - Stack trace
   - Exit codes
   - Missing dependencies

### 3. Run with Verbose Output

```bash
# Enable verbose logging
npm test -- --verbose

# Run specific test files
npm test -- src/__tests__/worker/previewWorker.test.js

# Run with debug output
DEBUG=* npm test
```

## Common Fixes

### 1. Update Jest Configuration

If ESM issues persist, update `package.json`:
```json
{
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js"
  },
  "jest": {
    "testEnvironment": "node",
    "transform": {
      "^.+\\.(t|j)sx?$": "babel-jest"
    }
  }
}
```

### 2. Fix Import Statements

Convert ESM imports to CommonJS for compatibility:
```javascript
// Instead of:
import { validatePayload } from './validatePreviewPayload.js';

// Use:
const { validatePayload } = require('./validatePreviewPayload.js');
```

### 3. Add Babel Configuration

Create `.babelrc` for better compatibility:
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

## Testing Matrix

Ensure compatibility across:
- Node.js 18.x and 20.x
- Ubuntu, macOS, and Windows runners
- Different npm versions
- Various dependency combinations

## Emergency Fixes

If CI continues to fail:

1. **Temporary workaround**: Pin specific dependency versions
2. **Isolate issue**: Create minimal reproduction case
3. **Rollback**: Revert recent changes and apply incrementally
4. **Skip failing tests**: Use `.skip()` temporarily while fixing root cause

## Prevention

1. Run full test matrix locally before pushing
2. Keep dependencies updated regularly
3. Monitor CI status on main branch
4. Test cross-platform compatibility
5. Document breaking changes