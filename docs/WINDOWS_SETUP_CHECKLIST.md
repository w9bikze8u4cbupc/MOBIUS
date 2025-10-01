# Windows Setup Checklist

Use this checklist to track your progress setting up MOBIUS on Windows with WSL2.

## Phase 1: Prerequisites

- [ ] Windows 10 version 2004+ or Windows 11
- [ ] WSL2 installed and running
  - [ ] Run `wsl --install` (Administrator)
  - [ ] Restart computer
  - [ ] Verify: `wsl --list --verbose` shows VERSION 2
- [ ] Docker Desktop installed
  - [ ] Downloaded from docker.com
  - [ ] Installed with WSL2 backend enabled
  - [ ] Docker Desktop is running
- [ ] Docker WSL integration configured
  - [ ] Settings → General → "Use WSL 2 based engine" ✓
  - [ ] Settings → Resources → WSL Integration → Ubuntu enabled
- [ ] Verify Docker in WSL:
  - [ ] `wsl docker --version` works
  - [ ] `wsl docker compose version` works

## Phase 2: WSL Environment Setup

- [ ] Open WSL terminal (Ubuntu)
- [ ] Install Node.js via nvm
  - [ ] `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash`
  - [ ] `source ~/.bashrc`
  - [ ] `nvm install 20.18.1`
  - [ ] `nvm use 20.18.1`
  - [ ] `nvm alias default 20.18.1`
  - [ ] Verify: `node --version` shows v20.18.1
- [ ] Install ffmpeg
  - [ ] `sudo apt update`
  - [ ] `sudo apt install -y ffmpeg`
  - [ ] Verify: `ffmpeg -version` works

## Phase 3: Repository Setup

- [ ] Clone repository
  - [ ] `cd ~`
  - [ ] `git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git`
  - [ ] `cd MOBIUS`
- [ ] Install dependencies
  - [ ] `npm ci` completes successfully
  - [ ] No error messages
- [ ] Run verification
  - [ ] `npm run verify-clean-genesis -- --verbose`
  - [ ] Verification passes

## Phase 4: Docker Setup

- [ ] Make scripts executable
  - [ ] `chmod +x scripts/run_mobius_wsl.sh`
  - [ ] `chmod +x scripts/ci/smoke-tests.sh`
- [ ] Build CI image
  - [ ] `docker build -f Dockerfile.ci -t mobius-api-ci:local .`
  - [ ] Build completes without errors
- [ ] Start staging environment
  - [ ] `docker compose -f docker-compose.staging.yml up -d --build`
  - [ ] Containers start successfully
  - [ ] `docker ps` shows running containers
- [ ] Run smoke tests
  - [ ] `./scripts/ci/smoke-tests.sh http://localhost:5001 30 2`
  - [ ] All tests pass
- [ ] Tear down
  - [ ] `docker compose -f docker-compose.staging.yml down --volumes --remove-orphans`
  - [ ] Clean shutdown

## Phase 5: Quick Start Validation

- [ ] Test one-command bootstrap
  - [ ] Download: `curl -fsSL https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_wsl.sh -o ~/run_mobius_wsl.sh`
  - [ ] Make executable: `chmod +x ~/run_mobius_wsl.sh`
  - [ ] Run: `~/run_mobius_wsl.sh`
  - [ ] Script completes successfully
- [ ] OR test PowerShell wrapper
  - [ ] From PowerShell: `.\scripts\run_mobius_from_ps.ps1 -RepoPath (pwd).Path`
  - [ ] Script completes successfully

## Phase 6: Development Environment (Optional)

- [ ] Install Windows Terminal (optional but recommended)
  - [ ] Install from Microsoft Store
  - [ ] Set Ubuntu as default profile (optional)
- [ ] Install VS Code with WSL extension
  - [ ] Install VS Code
  - [ ] Install "Remote - WSL" extension
  - [ ] Test: `code .` from WSL MOBIUS directory
  - [ ] VS Code opens with WSL connection

## Phase 7: Verify Everything Works

- [ ] Run test suite
  - [ ] `npm test`
  - [ ] Tests pass
- [ ] Run golden checks
  - [ ] `npm run golden:check` (may need golden files first)
- [ ] Check artifacts are created
  - [ ] `ls -la verification-reports/`
  - [ ] JSON reports exist
- [ ] Access from Windows
  - [ ] Navigate to `\\wsl$\Ubuntu\home\yourusername\MOBIUS` in Explorer
  - [ ] Files are accessible

## Troubleshooting Completed Issues

Track any issues you encountered and resolved:

- [ ] Issue: ___________________________________
  - Resolution: ___________________________________

- [ ] Issue: ___________________________________
  - Resolution: ___________________________________

- [ ] Issue: ___________________________________
  - Resolution: ___________________________________

## Performance Verification

- [ ] Code location optimized
  - [ ] Repository is in WSL filesystem (`~/MOBIUS`), not `/mnt/c/`
- [ ] Docker has adequate resources
  - [ ] Docker Desktop → Settings → Resources → Memory ≥ 6GB
  - [ ] Docker Desktop → Settings → Resources → CPUs ≥ 2
- [ ] Test performance
  - [ ] `time npm ci` completes in reasonable time
  - [ ] `time docker build -f Dockerfile.ci -t test .` completes in reasonable time

## Documentation Review

- [ ] Read [WINDOWS_SETUP.md](./WINDOWS_SETUP.md)
- [ ] Read [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] Read [README.md](../README.md)
- [ ] Bookmarked for future reference

## Ready for Development!

- [ ] All phases complete
- [ ] Environment working smoothly
- [ ] Ready to contribute to MOBIUS

## Notes

Use this space for notes, custom configurations, or reminders:

```
_____________________________________________
_____________________________________________
_____________________________________________
_____________________________________________
```

## Quick Reference Commands

Once setup is complete, use these daily:

```bash
# Start development
cd ~/MOBIUS
code .

# Run tests
npm test
npm run verify-clean-genesis

# Start staging
docker compose -f docker-compose.staging.yml up -d
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# Stop staging
docker compose -f docker-compose.staging.yml down --volumes

# Update dependencies
npm ci

# Check Docker
docker ps
docker compose -f docker-compose.staging.yml logs
```

---

**Last Updated:** Check this document after major updates or when troubleshooting.
