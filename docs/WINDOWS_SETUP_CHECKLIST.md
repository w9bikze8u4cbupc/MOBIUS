# Windows WSL2 Setup Checklist

Use this checklist to track your setup progress. Check off items as you complete them.

## Prerequisites

- [ ] Windows 10 version 2004+ or Windows 11
- [ ] Administrator access to Windows

## WSL2 Installation

- [ ] WSL2 enabled (`wsl --install` from Administrator PowerShell)
- [ ] Computer restarted (if prompted)
- [ ] Ubuntu distribution installed
- [ ] WSL2 set as default version
- [ ] Ubuntu is using WSL2 (verify with `wsl -l -v` from PowerShell)

## Docker Desktop

- [ ] Docker Desktop downloaded
- [ ] Docker Desktop installed with WSL2 backend enabled
- [ ] Docker Desktop running
- [ ] WSL Integration enabled for Ubuntu in Docker Desktop settings
- [ ] Docker accessible from WSL (`docker --version` works in WSL terminal)
- [ ] Docker Compose accessible (`docker compose version` works in WSL terminal)

## Development Tools in WSL

- [ ] WSL terminal opened (Ubuntu)
- [ ] System packages updated (`sudo apt-get update`)
- [ ] nvm installed
- [ ] Node.js 20.18.1 installed via nvm
- [ ] Node.js 20.18.1 set as default
- [ ] Node version verified (`node --version` shows v20.18.1)
- [ ] FFmpeg installed (`sudo apt-get install -y ffmpeg`)
- [ ] FFmpeg verified (`ffmpeg -version` works)
- [ ] Build tools installed (`sudo apt-get install -y build-essential`)

## Repository Setup

- [ ] Repository cloned to WSL filesystem (not /mnt/c/)
- [ ] Changed to repository directory
- [ ] Dependencies installed (`npm ci`)
- [ ] Verification script executed successfully (`npm run verify-clean-genesis -- --verbose`)

## Docker & Staging Environment

- [ ] CI Dockerfile builds successfully (`docker build -f Dockerfile.ci -t mobius-api-ci:local .`)
- [ ] Staging environment starts (`docker compose -f docker-compose.staging.yml up -d --build`)
- [ ] Containers are running (`docker compose -f docker-compose.staging.yml ps`)
- [ ] Health checks passing
- [ ] Smoke tests pass (`./scripts/ci/smoke-tests.sh http://localhost:5001 30 2`)
- [ ] Environment cleaned up (`docker compose -f docker-compose.staging.yml down --volumes --remove-orphans`)

## One-Command Bootstrap (Alternative)

Instead of manual setup, you can use the bootstrap script:

- [ ] Bootstrap script downloaded or available in repo
- [ ] Script made executable (`chmod +x scripts/run_mobius_wsl.sh`)
- [ ] Bootstrap script executed successfully (`./scripts/run_mobius_wsl.sh`)
- [ ] All automated checks passed

## IDE Setup (Optional but Recommended)

- [ ] Visual Studio Code installed on Windows
- [ ] "Remote - WSL" extension installed in VS Code
- [ ] Project opened in VS Code from WSL (`code .` from WSL terminal)
- [ ] IntelliSense and extensions working

## Verification

- [ ] Can run `npm ci` successfully
- [ ] Can run golden tests (`npm run golden:check`)
- [ ] Can build Docker images
- [ ] Can start staging environment
- [ ] Can run smoke tests
- [ ] Can view logs and debug

## Common Issues Resolved

- [ ] Docker daemon accessible from WSL
- [ ] No permission issues with scripts
- [ ] Correct Node.js version in use
- [ ] FFmpeg available in PATH
- [ ] No port conflicts (5001 is available)
- [ ] WSL can access Windows Docker Desktop

## Ready to Develop!

Once all items above are checked, you're ready to start development:

- [ ] Read [CONTRIBUTING.md](../CONTRIBUTING.md) for development workflow
- [ ] Read [README.md](../README.md) for project overview
- [ ] Review [Windows Setup Guide](WINDOWS_SETUP.md) for detailed instructions

## Need Help?

If any step fails:

1. **Check the detailed guide**: [WINDOWS_SETUP.md](WINDOWS_SETUP.md) has troubleshooting sections
2. **Collect diagnostic info**:
   - Windows version: `winver` (from Windows)
   - WSL version: `wsl --version` (from PowerShell)
   - Docker version: `docker --version` (from WSL)
   - Node version: `node --version` (from WSL)
   - Error logs: `smoke-tests.log`, `compose-logs.log`, `verification-reports/*.json`
3. **Search existing issues** on GitHub
4. **Create a new issue** with your diagnostic info and error logs
