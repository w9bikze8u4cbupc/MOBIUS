# Windows Setup Checklist for MOBIUS

Use this interactive checklist to track your setup progress.

## Pre-Setup

- [ ] Windows 10 version 2004+ or Windows 11 installed
- [ ] Administrator access to your Windows machine
- [ ] Stable internet connection

## WSL2 Installation

- [ ] Opened PowerShell as Administrator
- [ ] Ran `wsl --install`
- [ ] Restarted computer (if required)
- [ ] Set WSL2 as default: `wsl --set-default-version 2`
- [ ] Verified WSL2 is installed: `wsl --list --verbose`
- [ ] Installed Ubuntu distribution: `wsl --install -d Ubuntu`
- [ ] Created Ubuntu user account and password
- [ ] Successfully started WSL terminal

## Docker Desktop

- [ ] Downloaded Docker Desktop for Windows
- [ ] Installed Docker Desktop
- [ ] Restarted computer (if required)
- [ ] Started Docker Desktop
- [ ] Enabled WSL2 backend in Docker settings
- [ ] Enabled WSL integration with Ubuntu (Settings → Resources → WSL Integration)
- [ ] Verified Docker is running in WSL: `docker ps`

## WSL Environment Setup

### System Dependencies

- [ ] Opened WSL terminal (type `wsl` in PowerShell or Windows Terminal)
- [ ] Updated package lists: `sudo apt-get update`
- [ ] Installed ffmpeg: `sudo apt-get install -y ffmpeg`
- [ ] Verified ffmpeg installation: `ffmpeg -version`

### Node.js via NVM

- [ ] Downloaded NVM installer script
- [ ] Installed NVM: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash`
- [ ] Reloaded shell: `source ~/.bashrc`
- [ ] Verified NVM installation: `nvm --version`
- [ ] Installed Node.js 20.18.1: `nvm install 20.18.1`
- [ ] Set Node.js 20.18.1 as active: `nvm use 20.18.1`
- [ ] Set Node.js 20.18.1 as default: `nvm alias default 20.18.1`
- [ ] Verified Node.js version: `node --version` (should show v20.18.1)
- [ ] Verified npm version: `npm --version`

### Git Configuration (Optional)

- [ ] Configured git user name: `git config --global user.name "Your Name"`
- [ ] Configured git email: `git config --global user.email "your.email@example.com"`
- [ ] (Optional) Set up SSH key for GitHub
- [ ] (Optional) Added SSH key to GitHub account

## Repository Setup

- [ ] Navigated to home directory: `cd ~`
- [ ] Cloned repository: `git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git`
- [ ] Changed to repository directory: `cd MOBIUS`
- [ ] Verified repository structure: `ls -la`

## Dependency Installation

- [ ] Attempted `npm ci`
- [ ] If `npm ci` failed, ran `npm install` instead
- [ ] Verified no major errors in installation output
- [ ] Checked that `node_modules` directory exists

## Verification

- [ ] Ran verification script: `npm run verify-clean-genesis`
- [ ] Verification completed successfully (or noted errors for troubleshooting)

## Docker Setup (Optional but Recommended)

- [ ] Built CI Docker image: `docker build -f Dockerfile.ci -t mobius-api-ci:local .`
- [ ] Started staging environment: `docker compose -f docker-compose.staging.yml up -d --build`
- [ ] Ran smoke tests: `./scripts/ci/smoke-tests.sh http://localhost:5001 30 2`
- [ ] Verified services are running: `docker ps`
- [ ] Stopped staging environment: `docker compose -f docker-compose.staging.yml down --volumes --remove-orphans`

## One-Command Setup Alternative

If you prefer the automated approach:

- [ ] Downloaded bootstrap script: `curl -fsSL https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_wsl.sh -o ~/run_mobius_wsl.sh`
- [ ] Made script executable: `chmod +x ~/run_mobius_wsl.sh`
- [ ] Ran bootstrap script: `~/run_mobius_wsl.sh`
- [ ] Reviewed script output for any errors

## Testing & Validation

- [ ] Ran test suite: `npm test`
- [ ] All tests passed (or noted failures)
- [ ] Verified you can access the repository files from WSL
- [ ] Verified you can access the repository files from Windows (e.g., `\\wsl$\Ubuntu\home\username\MOBIUS`)

## Final Checks

- [ ] Reviewed [WINDOWS_SETUP.md](./WINDOWS_SETUP.md) for any additional information
- [ ] Reviewed [CONTRIBUTING.md](../CONTRIBUTING.md) for development workflow
- [ ] Bookmarked troubleshooting section in WINDOWS_SETUP.md
- [ ] Setup is complete and you're ready to develop!

## Troubleshooting

If you checked a box but encountered issues:

1. Go back and verify the step was completed correctly
2. Check the [Troubleshooting section in WINDOWS_SETUP.md](./WINDOWS_SETUP.md#troubleshooting)
3. Search existing GitHub issues
4. Create a new issue if the problem persists

## Quick Commands Reference

```bash
# Check versions
wsl --list --verbose          # Windows: Check WSL distributions
node --version                 # WSL: Check Node.js version
npm --version                  # WSL: Check npm version
ffmpeg -version                # WSL: Check ffmpeg version
docker --version               # WSL: Check Docker version

# Common commands
wsl                            # Windows: Enter WSL
wsl --shutdown                 # Windows: Restart WSL
docker ps                      # WSL: List running containers
npm ci                         # WSL: Install dependencies
npm test                       # WSL: Run tests

# Navigation
cd ~/MOBIUS                    # WSL: Go to repository
explorer.exe .                 # WSL: Open current directory in Windows Explorer
code .                         # WSL: Open in VS Code (if installed)
```

## Next Steps After Setup

Once all boxes are checked:

1. ✅ Read the project README.md
2. ✅ Familiarize yourself with the repository structure
3. ✅ Review the development workflow in CONTRIBUTING.md
4. ✅ Try running the example pipelines
5. ✅ Start contributing!

---

**Tip:** Keep this checklist handy for setting up MOBIUS on additional machines or for helping team members with their setup.
