# Pull Request: Add Cross-Platform Verification Scripts and CI Workflow

## Summary
This PR introduces a complete set of cross-platform verification scripts for the MOBIUS system, along with a CI workflow for automated testing. The changes include:

1. Enhanced verification scripts for both Unix and Windows environments
2. Utility scripts for port management and folder consolidation
3. GitHub Actions workflow for CI integration
4. Updated package.json with new verification commands

## Changes Included

### 1. Verification Scripts
- `mobius-verify.sh` - Robust bash script for Unix/macOS/WSL/Linux
- `mobius-verify.cmd` - Enhanced Windows batch script with PowerShell integration

### 2. Utility Scripts
- `scripts/kill-ports.sh` and `scripts/kill-ports.ps1` - Kill processes on specified ports
- `scripts/consolidate-mobius-folders.sh` and `scripts/consolidate-mobius-folders.ps1` - Consolidate scattered folders

### 3. CI/CD Integration
- `.github/workflows/mobius-verify.yml` - GitHub Actions workflow for automated verification

### 4. Package.json Updates
```json
"mobius:verify": "mobius-verify.cmd",
"mobius:verify:unix": "bash mobius-verify.sh"
```

## Features

### Cross-Platform Compatibility
All critical scripts are provided in both bash (.sh) and PowerShell (.ps1) versions to ensure compatibility across development environments.

### Robust Process Management
Scripts properly handle process cleanup and port conflicts, ensuring reliable verification runs.

### Health Checks
Scripts wait for services to be ready by checking actual health endpoints rather than using fixed timeouts.

### Standardized Logging
Consistent logging format with clear status indicators for easy debugging.

### CI Integration
GitHub Actions workflow enables automated verification in CI environments.

## How to Use

### Local Development
```bash
# Unix/macOS/WSL/Linux
chmod +x mobius-verify.sh scripts/*.sh
npm run mobius:verify:unix

# Windows
npm run mobius:verify
```

### CI/CD
The GitHub Actions workflow can be triggered manually from the GitHub UI.

## Log Locations

- Unix: `/tmp/mobius-backend.log` and `/tmp/mobius-frontend.log`
- Windows: `%TEMP%\mobius-backend.log` and `%TEMP%\mobius-frontend.log`

## Testing
The verification scripts have been tested on both Unix and Windows environments and successfully start both backend and frontend services, wait for readiness, run smoke tests, and clean up processes.

## Next Steps
After merging this PR, consider:
1. Adding UI smoke tests with Playwright for enhanced UI stability in CI
2. Hardening health endpoints and long-task status endpoints on the backend
3. Creating a single Node-based orchestrator for even cleaner cross-platform process management