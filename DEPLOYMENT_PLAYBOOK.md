# MOBIUS Verification System Deployment Playbook

## Overview
This playbook provides step-by-step instructions for deploying the MOBIUS verification system across development and CI environments.

## Prerequisites
- Node.js v14 or higher
- npm v6 or higher
- Git
- PowerShell (Windows) or Bash (Unix/Linux/macOS)

## Deployment Steps

### 1. Local Development Environment Setup

#### Unix/Linux/macOS/WSL
```bash
# Clone the repository
git clone <repository-url>
cd mobius-games-tutorial-generator

# Install dependencies
npm ci
cd client && npm ci && cd ..

# Make scripts executable
chmod +x mobius-verify.sh scripts/*.sh

# Verify installation
npm run mobius:verify:unix
```

#### Windows
```cmd
REM Clone the repository
git clone <repository-url>
cd mobius-games-tutorial-generator

REM Install dependencies
npm ci
cd client && npm ci && cd ..

REM Verify installation
npm run mobius:verify
```

### 2. CI/CD Integration

#### GitHub Actions Setup
The GitHub Actions workflow is automatically available once the files are merged to the main branch. No additional setup is required.

Workflow file: `.github/workflows/mobius-verify.yml`

#### Manual Trigger
To manually trigger the verification workflow:
1. Go to the repository on GitHub
2. Navigate to Actions tab
3. Select "Mobius Verify" workflow
4. Click "Run workflow"
5. Select the branch to verify
6. Click "Run workflow"

### 3. Verification Commands

#### Primary Commands
```bash
# Unix/Linux/macOS/WSL
npm run mobius:verify:unix

# Windows
npm run mobius:verify

# Universal (Node.js)
npm run mobius:verify:node
```

#### Utility Commands
```bash
# Kill processes on specific ports
./scripts/kill-ports.sh 5001 3000                    # Unix
powershell -ExecutionPolicy Bypass -File .\scripts\kill-ports.ps1 -Ports 5001,3000  # Windows

# Consolidate MOBIUS folders
./scripts/consolidate-mobius-folders.sh              # Unix
powershell -ExecutionPolicy Bypass -File .\scripts\consolidate-mobius-folders.ps1  # Windows

# Full verification (includes cleanup)
./scripts/run-full-verification.sh                   # Unix
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-verification.ps1       # Windows
```

### 4. Log File Locations

#### Unix/Linux/macOS/WSL
- Backend logs: `/tmp/mobius-backend.log`
- Frontend logs: `/tmp/mobius-frontend.log`

#### Windows
- Backend logs: `%TEMP%\mobius-backend.log`
- Frontend logs: `%TEMP%\mobius-frontend.log`

### 5. Troubleshooting

#### Common Issues

1. **Port Conflicts**
   ```bash
   # Unix
   ./scripts/kill-ports.sh 5001 3000
   
   # Windows (PowerShell)
   powershell -ExecutionPolicy Bypass -File .\scripts\kill-ports.ps1 -Ports 5001,3000
   ```

2. **Scripts Not Executable (Unix)**
   ```bash
   chmod +x mobius-verify.sh scripts/*.sh
   ```

3. **Verification Fails**
   - Check log files for detailed error information
   - Ensure all dependencies are installed
   - Verify ports 5001 and 3000 are available

4. **CI Workflow Fails**
   - Check GitHub Actions logs for detailed error information
   - Ensure all required dependencies are specified in workflow
   - Verify the smoke test command is correct

### 6. Maintenance

#### Updating Scripts
1. Modify the appropriate script files
2. Test locally on all platforms
3. Commit and push changes
4. Verify CI workflow still passes

#### Adding New Features
1. Extend existing scripts or create new ones following the same patterns
2. Ensure cross-platform compatibility
3. Update documentation
4. Test thoroughly

## Rollback Procedure

If issues are discovered after deployment:

1. Revert to the previous commit:
   ```bash
   git revert <commit-hash>
   ```

2. Push the revert:
   ```bash
   git push origin main
   ```

3. Monitor CI to ensure the revert was successful

## Monitoring

### Local Development
- Check return codes from verification scripts
- Monitor log files for errors
- Verify services start and stop correctly

### CI/CD
- Monitor GitHub Actions workflow runs
- Check for failed jobs
- Review logs for any warnings or errors

## Success Criteria

Verification is considered successful when:
1. All scripts execute without errors
2. Backend service starts on port 5001
3. Frontend service starts on port 3000
4. Health checks pass for both services
5. Smoke tests complete successfully
6. Processes are cleaned up properly
7. CI workflow passes

## Contact Information

For issues or questions regarding the verification system:
- Team Lead: [Insert contact information]
- Documentation: See `MOBIUS_SCRIPTS_SUMMARY.md`