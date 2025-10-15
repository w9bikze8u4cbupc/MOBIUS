# Cross-Platform Deployment Scripts

## Overview

This project now includes paired PowerShell (.ps1) and bash (.sh) scripts for all critical deployment operations, ensuring cross-platform compatibility for Windows, Linux, and macOS environments.

## Script Pairs

### 1. Build and Push Scripts
- **PowerShell**: [build-and-push.ps1](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/build-and-push.ps1)
- **Bash**: [build-and-push.sh](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/build-and-push.sh)

**Function**: Builds the Docker image and pushes it to GHCR with secure authentication.

**Usage**:
- Windows: `.\build-and-push.ps1`
- Unix/Linux/macOS: `./build-and-push.sh`

### 2. Update Manifests Scripts
- **PowerShell**: [update-manifests.ps1](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/update-manifests.ps1)
- **Bash**: [update-manifests.sh](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/update-manifests.sh)

**Function**: Updates Kubernetes manifests with the correct image name.

**Usage**:
- Windows: `.\update-manifests.ps1`
- Unix/Linux/macOS: `./update-manifests.sh`

### 3. Apply Manifests Scripts
- **PowerShell**: [apply-manifests.ps1](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/apply-manifests.ps1)
- **Bash**: [apply-manifests.sh](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/apply-manifests.sh)

**Function**: Applies Kubernetes manifests to deploy the application.

**Usage**:
- Windows: `.\apply-manifests.ps1`
- Unix/Linux/macOS: `./apply-manifests.sh`

### 4. Full Deployment Scripts
- **PowerShell**: [deploy-preview-worker.ps1](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/deploy-preview-worker.ps1)
- **Bash**: [deploy-preview-worker.sh](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/deploy-preview-worker.sh)

**Function**: Combines all deployment steps into a single script.

**Usage**:
- Windows: `.\deploy-preview-worker.ps1`
- Unix/Linux/macOS: `./deploy-preview-worker.sh`

### 5. Verification Scripts
- **PowerShell**: [verify-deployment.ps1](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/verify-deployment.ps1)
- **Bash**: [verify-deployment.sh](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/verify-deployment.sh)

**Function**: Verifies the current deployment status.

**Usage**:
- Windows: `.\verify-deployment.ps1`
- Unix/Linux/macOS: `./verify-deployment.sh`

## Security Features

All scripts implement secure handling of sensitive information:
- GHCR Personal Access Tokens (PATs) are read securely without displaying in console
- PATs are cleared from memory after use
- Docker login uses password-stdin when possible to avoid command-line exposure

## Cross-Platform Compatibility

All scripts follow platform-specific conventions:
- PowerShell scripts use Windows-style paths and commands
- Bash scripts use Unix-style paths and commands
- Both script types produce standardized output with clear status indicators
- File permissions are set appropriately for execution

## Idempotent Design

All deployment scripts are designed to be idempotent:
- Can be safely run multiple times without unintended side effects
- Check for existing resources before creating new ones
- Update operations are designed to be repeatable

## CI/CD Integration

The deployment scripts are integrated with GitHub Actions for automated deployments:
- **[.github/workflows/preview-worker-build.yaml](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/.github/workflows/preview-worker-build.yaml)**: Automatically builds and pushes Docker images
- **[.github/workflows/preview-worker-deploy.yaml](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/.github/workflows/preview-worker-deploy.yaml)**: Automatically deploys to Kubernetes

## CLI Tool

A unified CLI tool is available for easier deployment operations:
- **[cli/mobius-deploy.js](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/cli/mobius-deploy.js)**: Node.js-based CLI that works across platforms
- **[CLI_DEPLOYMENT_TOOL.md](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/CLI_DEPLOYMENT_TOOL.md)**: Documentation for the CLI tool

## Usage Instructions

1. **Choose the appropriate script for your platform**
   - Windows users: Use .ps1 scripts
   - Unix/Linux/macOS users: Use .sh scripts

2. **Run the build and push script first**
   ```
   # Windows
   .\build-and-push.ps1
   
   # Unix/Linux/macOS
   ./build-and-push.sh
   ```

3. **Update the manifests**
   ```
   # Windows
   .\update-manifests.ps1
   
   # Unix/Linux/macOS
   ./update-manifests.sh
   ```

4. **Deploy to Kubernetes (when ready)**
   ```
   # Windows
   .\apply-manifests.ps1
   
   # Unix/Linux/macOS
   ./apply-manifests.sh
   ```

5. **Verify deployment status**
   ```
   # Windows
   .\verify-deployment.ps1
   
   # Unix/Linux/macOS
   ./verify-deployment.sh
   ```

6. **Use the CLI tool for simplified operations**
   ```
   # Deploy the application
   node cli/mobius-deploy.js deploy
   
   # Verify deployment status
   node cli/mobius-deploy.js verify
   ```

## Automated Testing

Scripts are automatically tested to ensure they function correctly:
- **[scripts/test-verification-scripts.ps1](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/scripts/test-verification-scripts.ps1)**: Tests PowerShell scripts
- **[scripts/test-verification-scripts.sh](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/scripts/test-verification-scripts.sh)**: Tests bash scripts

## Troubleshooting

If you encounter issues:
1. Ensure Docker is running
2. Verify Kubernetes is properly configured
3. Check that all required dependencies are installed
4. Confirm you have appropriate permissions for Docker and Kubernetes operations