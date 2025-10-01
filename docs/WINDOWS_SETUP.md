# Windows Setup Guide for MOBIUS

This guide provides instructions for setting up the MOBIUS development environment on Windows using WSL2 (Windows Subsystem for Linux).

## Table of Contents

- [Quick Start (One-Command)](#quick-start-one-command)
- [Prerequisites](#prerequisites)
- [Detailed Setup](#detailed-setup)
- [Troubleshooting](#troubleshooting)
- [Alternative Setup Options](#alternative-setup-options)

## Quick Start (One-Command)

The fastest way to get started is using our one-command WSL bootstrap script:

### From WSL (Recommended)

```bash
# Download and run the bootstrap script
curl -fsSL https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_wsl.sh -o ~/run_mobius_wsl.sh
chmod +x ~/run_mobius_wsl.sh
~/run_mobius_wsl.sh
```

### From Windows PowerShell

```powershell
# Download the PowerShell wrapper
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_from_ps.ps1" -OutFile ".\run_mobius_from_ps.ps1"

# Run the bootstrap
.\run_mobius_from_ps.ps1
```

## Prerequisites

### 1. Windows 10/11 with WSL2

**Check if WSL2 is installed:**

```powershell
wsl --list --verbose
```

**If WSL2 is not installed:**

```powershell
# Run as Administrator
wsl --install

# After installation, restart your computer
# Then set WSL2 as default
wsl --set-default-version 2
```

**Install Ubuntu (recommended distribution):**

```powershell
wsl --install -d Ubuntu
```

### 2. Docker Desktop for Windows

Download and install Docker Desktop from: https://www.docker.com/products/docker-desktop/

**Configuration:**
- Enable WSL2 integration in Docker Desktop settings
- Go to Settings → Resources → WSL Integration
- Enable integration with your Ubuntu distribution

### 3. Git for Windows (Optional)

If you want to use Git from Windows (not required if using Git inside WSL):

Download from: https://git-scm.com/download/win

## Detailed Setup

### Step 1: Open WSL Terminal

1. Open Windows Terminal or PowerShell
2. Type `wsl` and press Enter to start your Ubuntu environment

### Step 2: Install System Dependencies

```bash
# Update package lists
sudo apt-get update

# Install ffmpeg (required for video processing)
sudo apt-get install -y ffmpeg

# Verify installation
ffmpeg -version
```

### Step 3: Install Node.js via NVM

```bash
# Install NVM (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell configuration
source ~/.bashrc

# Install Node.js 20.18.1
nvm install 20.18.1
nvm use 20.18.1

# Verify installation
node --version  # Should output v20.18.1
npm --version
```

### Step 4: Clone the Repository

```bash
# Clone from inside WSL
cd ~
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS
```

### Step 5: Install Dependencies

```bash
# Install Node.js dependencies
npm ci

# If npm ci fails, try npm install
npm install
```

### Step 6: Verify Installation

```bash
# Run the verification script
npm run verify-clean-genesis
```

### Step 7: Build and Run with Docker (Optional)

```bash
# Build the CI Docker image
docker build -f Dockerfile.ci -t mobius-api-ci:local .

# Start the staging environment
docker compose -f docker-compose.staging.yml up -d --build

# Run smoke tests
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# Stop the environment
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

## Troubleshooting

### WSL2 Issues

**Problem: WSL command not found**
- Solution: Install WSL2 following the prerequisites section

**Problem: Ubuntu distribution not starting**
- Solution: Run `wsl --shutdown` in PowerShell, then try again

**Problem: Network connectivity issues in WSL**
```bash
# Reset DNS in WSL
sudo rm /etc/resolv.conf
sudo bash -c 'echo "nameserver 8.8.8.8" > /etc/resolv.conf'
sudo chattr +i /etc/resolv.conf
```

### Docker Issues

**Problem: Docker daemon not accessible from WSL**
- Solution: Ensure Docker Desktop is running and WSL integration is enabled

**Problem: Permission denied when running docker commands**
```bash
# Add your user to the docker group
sudo usermod -aG docker $USER

# Log out and log back in, or run:
newgrp docker
```

### Node.js Issues

**Problem: npm ci fails with EUSAGE error**
- Solution: Use `npm install` to update package-lock.json, then try `npm ci` again

**Problem: Node version mismatch**
```bash
# Switch to the correct version
nvm install 20.18.1
nvm use 20.18.1

# Set as default
nvm alias default 20.18.1
```

### FFmpeg Issues

**Problem: ffmpeg not found**
```bash
# Install ffmpeg
sudo apt-get update
sudo apt-get install -y ffmpeg

# Verify installation
which ffmpeg
ffmpeg -version
```

### Repository Access Issues

**Problem: Git authentication fails**
- Solution: Set up SSH keys or use personal access tokens
```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your_email@example.com"

# Add to GitHub: https://github.com/settings/keys
cat ~/.ssh/id_ed25519.pub
```

## Alternative Setup Options

### Option 1: Manual Step-by-Step

Follow the Detailed Setup section above for complete control over each step.

### Option 2: Using the PowerShell Wrapper

The PowerShell wrapper (`run_mobius_from_ps.ps1`) allows you to run the WSL bootstrap from Windows:

```powershell
# Run from repository root
.\scripts\run_mobius_from_ps.ps1 -RepoPath (pwd).Path

# Or run without specifying path (uses ~/run_mobius_wsl.sh in WSL)
.\scripts\run_mobius_from_ps.ps1
```

### Option 3: Native Windows (Not Recommended)

While possible to run directly on Windows, we strongly recommend using WSL2 for the following reasons:

- Better compatibility with Linux-based tools (ffmpeg, shell scripts)
- Consistent environment with CI/CD pipeline
- Better performance for file I/O operations
- Easier troubleshooting and support

If you must use native Windows:
1. Install Node.js 20.18.1 from nodejs.org
2. Install ffmpeg from ffmpeg.org
3. Add both to your PATH
4. Install Git for Windows
5. Use Git Bash or PowerShell for commands

## Verification Checklist

After setup, verify everything is working:

- [ ] WSL2 is installed and running
- [ ] Ubuntu distribution is accessible
- [ ] Docker Desktop is running with WSL integration
- [ ] Node.js 20.18.1 is installed (`node --version`)
- [ ] NPM is available (`npm --version`)
- [ ] ffmpeg is installed (`ffmpeg -version`)
- [ ] Repository is cloned
- [ ] Dependencies are installed (`npm ci` or `npm install` succeeds)
- [ ] Verification passes (`npm run verify-clean-genesis`)
- [ ] Docker commands work (`docker ps`)

See also: [WINDOWS_SETUP_CHECKLIST.md](./WINDOWS_SETUP_CHECKLIST.md) for an interactive checklist.

## Next Steps

- Review [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines
- Check out [README.md](../README.md) for project overview
- Run the test suite: `npm test`
- Build your first tutorial video following the main documentation

## Support

If you encounter issues not covered in this guide:

1. Check the [Troubleshooting](#troubleshooting) section
2. Search existing GitHub issues
3. Create a new issue with:
   - Your Windows version
   - WSL version (`wsl --list --verbose`)
   - Node version (`node --version`)
   - Complete error messages
   - Steps to reproduce

## Additional Resources

- [WSL Documentation](https://docs.microsoft.com/en-us/windows/wsl/)
- [Docker Desktop WSL2 Backend](https://docs.docker.com/desktop/windows/wsl/)
- [NVM for Node Version Management](https://github.com/nvm-sh/nvm)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
