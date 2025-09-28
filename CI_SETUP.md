# CI Workflow Setup Instructions

## Overview
This CI workflow provides comprehensive testing for the MOBIUS Node.js + React application across multiple platforms (Ubuntu, macOS, Windows).

## Features
- **Multi-platform testing**: Ubuntu, macOS, and Windows
- **Node.js API testing**: Linting, testing, and smoke tests for the Express API
- **React client testing**: Build and test the React frontend
- **Authentication testing**: Tests endpoints with ALLOWED_TOKEN
- **Staging E2E**: Full end-to-end testing on staging branch
- **Graceful error handling**: Continues testing even if API has syntax issues

## Required Setup

### 1. Add ALLOWED_TOKEN Secret
The workflow requires an `ALLOWED_TOKEN` secret for authentication testing.

**To add the secret:**
1. Go to your repository Settings
2. Navigate to "Secrets and variables" → "Actions"
3. Click "New repository secret"
4. Name: `ALLOWED_TOKEN`
5. Value: Generate a secure CI-only token

**Generate the token value:**
```bash
echo "mobius-ci-$(openssl rand -hex 16)-$(date +%Y%m)"
```

**⚠️ Important:** Do NOT use production credentials. This should be a CI-only token.

### 2. Branch Configuration
The workflow triggers on:
- **Push**: `main`, `staging`, and any `**/feature/**` branches
- **Pull Request**: targeting `main` or `staging`

### 3. Workflow Jobs

#### `lint-and-test`
- Runs on all three platforms
- Installs Node.js dependencies for both root and client
- Runs linting and tests (gracefully handles missing test configurations)
- Builds the React client
- Uploads test artifacts

#### `api-smoke-test`
- Runs only on Ubuntu after lint-and-test succeeds
- Performs syntax check on API files
- Starts the Node.js API server (if syntax is valid)
- Tests basic and authenticated endpoints
- Gracefully handles API startup failures

#### `staging-e2e` 
- **Only runs on `staging` branch**
- Full end-to-end testing with both API and React client
- Tests service health and basic functionality
- Collects logs for debugging

## Local Validation

### Test API Server
```bash
cd src/api
node -c index.js  # Syntax check
node index.js     # Start server
```

### Test Client Build
```bash
cd client
npm ci
npm run build
```

### Test Dependencies
```bash
# Root dependencies
npm ci
npm test --if-present

# Client dependencies  
cd client
npm ci
npm test --if-present
```

## Error Handling
The workflow is designed to be resilient:
- Continues testing even if API has syntax errors
- Gracefully handles missing test scripts
- Provides detailed logging for debugging
- Uses timeouts to prevent hanging processes

## Artifacts
The workflow uploads test results and logs as artifacts for debugging failed builds.