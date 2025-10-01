# Windows Setup Checklist

Use this checklist to track your MOBIUS setup progress on Windows with WSL2.

## Prerequisites

- [ ] Windows 10 version 2004+ or Windows 11
- [ ] At least 8GB RAM available
- [ ] At least 20GB free disk space
- [ ] Administrator access to Windows

## WSL2 Setup

- [ ] WSL2 installed (`wsl --install`)
- [ ] Computer restarted after WSL2 installation
- [ ] WSL2 set as default version (`wsl --set-default-version 2`)
- [ ] Linux distribution installed (Ubuntu recommended)
- [ ] WSL2 distribution verified (`wsl -l -v` shows VERSION 2)
- [ ] Username and password configured in WSL

## Docker Desktop Setup

- [ ] Docker Desktop downloaded from docker.com
- [ ] Docker Desktop installed with WSL2 backend
- [ ] Docker Desktop started
- [ ] "Use the WSL 2 based engine" enabled in Docker Settings → General
- [ ] WSL integration enabled in Docker Settings → Resources → WSL Integration
- [ ] Integration enabled for your specific distro
- [ ] Docker verified in WSL (`docker --version` works)
- [ ] Docker Compose verified in WSL (`docker compose version` works)
- [ ] Docker running verified (`docker ps` works without errors)

## Node.js Setup

- [ ] nvm (Node Version Manager) installed
- [ ] nvm loaded in shell (`source ~/.bashrc`)
- [ ] Node.js 20.18.1 installed (`nvm install 20.18.1`)
- [ ] Node.js 20.18.1 set as default (`nvm alias default 20.18.1`)
- [ ] Node.js version verified (`node --version` shows v20.18.1)
- [ ] npm verified (`npm --version` works)

## System Dependencies

- [ ] System packages updated (`sudo apt update`)
- [ ] ffmpeg installed (`sudo apt install -y ffmpeg`)
- [ ] ffmpeg verified (`ffmpeg -version` shows 4.x or later)
- [ ] ffprobe verified (`ffprobe -version` works)

## Repository Setup

- [ ] Repository cloned (`git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git`)
- [ ] Changed to repository directory (`cd MOBIUS`)
- [ ] Dependencies installed (`npm ci` or `npm install`)
- [ ] No npm errors during installation

## Repository Verification

- [ ] Scripts made executable (`chmod +x scripts/*.sh scripts/ci/*.sh`)
- [ ] Repository integrity check passed (`npm run verify-clean-genesis -- --verbose`)
- [ ] No verification errors reported

## Docker Build

- [ ] CI Docker image built (`docker build -f Dockerfile.ci -t mobius-api-ci:local .`)
- [ ] Build completed without errors
- [ ] Image listed in `docker images`

## Application Startup

- [ ] Staging stack started (`docker compose -f docker-compose.staging.yml up -d --build`)
- [ ] Containers running (`docker compose -f docker-compose.staging.yml ps`)
- [ ] Container logs show no errors (`docker compose -f docker-compose.staging.yml logs`)
- [ ] Services healthy (wait 30-60 seconds after startup)

## Smoke Tests

- [ ] Smoke tests passed (`./scripts/ci/smoke-tests.sh http://localhost:5001 30 2`)
- [ ] No test failures reported
- [ ] All API endpoints responding

## Cleanup

- [ ] Stack stopped cleanly (`docker compose -f docker-compose.staging.yml down --volumes --remove-orphans`)
- [ ] No containers left running (`docker ps` shows none)
- [ ] Cleanup completed without errors

## Optional: Quick Bootstrap

If you want to try the one-command bootstrap instead:

- [ ] Bootstrap script downloaded or available in repo
- [ ] Script made executable (`chmod +x ~/run_mobius_wsl.sh`)
- [ ] Bootstrap script executed (`~/run_mobius_wsl.sh`)
- [ ] All bootstrap steps completed successfully

Or from PowerShell:

- [ ] PowerShell script available (`scripts/run_mobius_from_ps.ps1`)
- [ ] PowerShell script executed (`.\scripts\run_mobius_from_ps.ps1 -RepoPath (pwd).Path`)
- [ ] All steps completed successfully

## Troubleshooting References

If you encounter issues, refer to the troubleshooting section in [WINDOWS_SETUP.md](WINDOWS_SETUP.md):

- [ ] Docker issues resolved
- [ ] WSL2 issues resolved
- [ ] Node.js/npm issues resolved
- [ ] ffmpeg issues resolved
- [ ] Script execution issues resolved
- [ ] Port conflicts resolved

## Next Steps

Once all items are checked:

- [ ] Read [CONTRIBUTING.md](../CONTRIBUTING.md) for development workflow
- [ ] Understand project structure and testing guidelines
- [ ] Ready to start developing!

## Notes

Use this space to note any issues encountered and how you resolved them:

```
Issue: 
Solution: 

Issue: 
Solution: 
```

---

**Setup completed on:** _______________

**Time taken:** _______________

**Any issues?** _______________
