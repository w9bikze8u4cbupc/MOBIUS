# MOBIUS Scripts Summary

This document provides an overview of all the verification and utility scripts created for the MOBIUS system.

## Verification Scripts

### 1. mobius-verify.sh (Bash - Unix/macOS/WSL/Linux)
A robust cross-platform verification script that:
- Starts both backend and frontend services
- Waits for services to be ready by checking health endpoints
- Runs smoke tests
- Cleans up processes and handles port conflicts
- Provides detailed logging

**Usage:**
```bash
chmod +x mobius-verify.sh
./mobius-verify.sh
```

### 2. mobius-verify.cmd (Windows Batch)
A Windows-compatible verification script that:
- Starts both backend and frontend services
- Waits for services to be ready using PowerShell web requests
- Runs smoke tests
- Provides detailed logging

**Usage:**
```cmd
mobius-verify.cmd
```

### 3. npm scripts
Added to package.json for easy execution:
- `npm run mobius:verify` - Runs the Windows batch script
- `npm run mobius:verify:unix` - Runs the bash script

## Utility Scripts

### 1. kill-ports.sh (Bash)
Kills processes running on specified ports.

**Usage:**
```bash
./scripts/kill-ports.sh 5001 3000
```

### 2. kill-ports.ps1 (PowerShell)
Kills processes running on specified ports.

**Usage:**
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\kill-ports.ps1 -Ports 5001,3000
```

### 3. consolidate-mobius-folders.sh (Bash)
Consolidates scattered folders into a canonical MOBIUS workspace.

**Usage:**
```bash
./scripts/consolidate-mobius-folders.sh
```

### 4. consolidate-mobius-folders.ps1 (PowerShell)
Consolidates scattered folders into a canonical MOBIUS workspace.

**Usage:**
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\consolidate-mobius-folders.ps1
```

## CI/CD Workflow

### 1. GitHub Actions Workflow
Created `.github/workflows/mobius-verify.yml` for running verification in CI:
- Uses Ubuntu runner
- Sets up Node.js environment
- Installs dependencies
- Runs the bash verification script

## Key Improvements

1. **Cross-Platform Compatibility**: All critical scripts are provided in both bash (.sh) and PowerShell (.ps1) versions.

2. **Robust Process Management**: Scripts now properly handle process cleanup and port conflicts.

3. **Health Checks**: Scripts wait for services to be ready by checking actual health endpoints rather than just waiting for a fixed time.

4. **Better Error Handling**: Improved error messages and exit codes for easier debugging.

5. **Standardized Logging**: Consistent logging format with clear status indicators.

6. **CI Integration**: GitHub Actions workflow for automated verification.

## Script Details

### mobius-verify.sh
- Uses `set -euo pipefail` for strict error handling
- Dynamically determines script directory
- Uses `curl` to check service readiness
- Redirects service logs to `/tmp/` files
- Properly tracks and cleans up background processes
- Uses signal traps for cleanup on exit

### mobius-verify.cmd
- Uses PowerShell commands to check service readiness
- Redirects service logs to `%TEMP%` files
- Uses `netstat` to find and kill processes on ports
- Provides clear status messages

### kill-ports.sh
- Accepts multiple ports as arguments
- Uses `lsof` to find processes on ports
- Provides informative output
- Handles missing `lsof` gracefully

### kill-ports.ps1
- Accepts multiple ports as parameters
- Uses `Get-NetTCPConnection` to find processes
- Provides detailed success/failure messages
- Handles errors gracefully

### consolidate-mobius-folders.sh
- Accepts destination directory as argument
- Uses configurable sources array
- Uses `rsync` for efficient copying
- Provides progress information

### consolidate-mobius-folders.ps1
- Accepts destination directory and sources as parameters
- Uses `robocopy` for efficient copying
- Provides progress information

## Usage Examples

### Local Development
```bash
# Unix/macOS/WSL/Linux
./mobius-verify.sh

# Windows
mobius-verify.cmd

# Or using npm
npm run mobius:verify
npm run mobius:verify:unix
```

### CI/CD
The GitHub Actions workflow can be triggered manually from the GitHub UI.

### Utility Commands
```bash
# Kill processes on specific ports
./scripts/kill-ports.sh 5001 3000
powershell -ExecutionPolicy Bypass -File ./scripts/kill-ports.ps1 -Ports 5001,3000

# Consolidate folders
./scripts/consolidate-mobius-folders.sh
powershell -ExecutionPolicy Bypass -File ./scripts/consolidate-mobius-folders.ps1
```

## Next Steps

1. **Playwright Integration**: For more comprehensive UI testing, consider adding Playwright:
   ```bash
   npm install -D @playwright/test
   ```

2. **Enhanced Smoke Tests**: Expand the smoke test suite to cover more checklist items.

3. **Documentation Updates**: Update README and other documentation to reflect the new scripts.

4. **Team Communication**: Announce the new scripts to the development team.