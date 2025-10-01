# Windows Development Setup Guide

This guide provides complete instructions for setting up the MOBIUS development environment on Windows using WSL2 (Windows Subsystem for Linux).

## Quick Start (Recommended)

The fastest way to get started is with our one-command bootstrap script:

```powershell
# From PowerShell (run in repository root)
.\scripts\run_mobius_from_ps.ps1 -RepoPath (pwd).Path
```

Or directly from WSL:

```bash
# From WSL terminal
curl -fsSL https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_wsl.sh -o ~/run_mobius_wsl.sh
chmod +x ~/run_mobius_wsl.sh
~/run_mobius_wsl.sh
```

The bootstrap script will:
- Install Node.js 20.18.1 via nvm
- Install ffmpeg and required build tools
- Verify Docker is available
- Clone/update the repository
- Install dependencies with `npm ci`
- Run verification tests
- Build Docker images
- Start the staging environment
- Run smoke tests
- Clean up resources

## Prerequisites

### 1. Windows 10/11 with WSL2

Enable WSL2 by running in an **Administrator PowerShell**:

```powershell
wsl --install
```

Or if WSL is already installed, ensure you're using WSL2:

```powershell
wsl --set-default-version 2
```

Install Ubuntu (recommended distribution):

```powershell
wsl --install -d Ubuntu
```

Restart your computer if prompted.

### 2. Docker Desktop for Windows

1. Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. During installation, ensure **"Use WSL 2 based engine"** is enabled
3. After installation, open Docker Desktop
4. Go to Settings → Resources → WSL Integration
5. Enable integration with your Ubuntu distribution
6. Click "Apply & Restart"

Verify Docker is accessible from WSL:

```bash
# From WSL terminal
docker --version
docker compose version
```

### 3. Visual Studio Code (Optional but Recommended)

1. Install [VS Code](https://code.visualstudio.com/)
2. Install the "Remote - WSL" extension
3. Open your project in WSL by running from WSL terminal:

```bash
code .
```

## Manual Setup Steps

If you prefer to set up the environment manually instead of using the bootstrap script:

### Step 1: Install Node.js 20.18.1

```bash
# Install nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell configuration
source ~/.bashrc

# Install Node.js 20.18.1
nvm install 20.18.1
nvm use 20.18.1
nvm alias default 20.18.1

# Verify installation
node --version  # Should output v20.18.1
npm --version
```

### Step 2: Install FFmpeg and Build Tools

```bash
# Update package lists
sudo apt-get update

# Install ffmpeg
sudo apt-get install -y ffmpeg

# Install build tools
sudo apt-get install -y build-essential

# Verify installation
ffmpeg -version
ffprobe -version
```

### Step 3: Clone Repository and Install Dependencies

```bash
# Clone the repository (if not already cloned)
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS

# Install dependencies
npm ci

# Verify installation
npm run verify-clean-genesis -- --verbose
```

### Step 4: Build and Test

```bash
# Build CI Docker image
docker build -f Dockerfile.ci -t mobius-api-ci:local .

# Start staging environment
docker compose -f docker-compose.staging.yml up -d --build

# Run smoke tests
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# View logs if needed
docker compose -f docker-compose.staging.yml logs

# Tear down when done
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

## Troubleshooting

### Docker daemon not running

**Problem**: `Cannot connect to the Docker daemon`

**Solution**:
1. Ensure Docker Desktop is running in Windows
2. Check WSL integration in Docker Desktop settings
3. Restart Docker Desktop
4. Restart WSL: `wsl --shutdown` (from PowerShell), then reopen WSL terminal

### WSL 2 not enabled

**Problem**: Docker Desktop requires WSL 2

**Solution**:
```powershell
# From Administrator PowerShell
wsl --set-default-version 2
wsl --set-version Ubuntu 2
```

### Permission denied on scripts

**Problem**: `Permission denied` when running scripts

**Solution**:
```bash
# Make scripts executable
chmod +x scripts/run_mobius_wsl.sh
chmod +x scripts/ci/smoke-tests.sh
chmod +x scripts/run_mobius_from_ps.ps1
```

### Node.js version mismatch

**Problem**: Wrong Node.js version installed

**Solution**:
```bash
# Install and use correct version
nvm install 20.18.1
nvm use 20.18.1
nvm alias default 20.18.1
```

### FFmpeg not found

**Problem**: `ffmpeg: command not found`

**Solution**:
```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

### npm ci fails

**Problem**: Dependencies installation fails

**Solution**:
```bash
# Clean npm cache and node_modules
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### Port already in use

**Problem**: Port 5001 is already in use

**Solution**:
```bash
# Find and stop the process using the port
sudo lsof -ti:5001 | xargs kill -9

# Or change the port in docker-compose.staging.yml
```

### Smoke tests fail

**Problem**: API smoke tests timeout or fail

**Solution**:
1. Check container logs: `docker compose -f docker-compose.staging.yml logs`
2. Verify containers are running: `docker compose -f docker-compose.staging.yml ps`
3. Increase timeout in smoke tests script
4. Check the generated log files: `smoke-tests.log` and `compose-logs.log`

## Configuration

### Environment Variables

Create a `.env` file in the project root if you need custom configuration:

```bash
# Example .env file
NODE_ENV=development
PORT=5001
LOG_LEVEL=debug
```

### Docker Resources

If you experience performance issues, adjust Docker Desktop resource limits:

1. Open Docker Desktop
2. Go to Settings → Resources
3. Increase Memory and CPU limits
4. Apply & Restart

Recommended minimums:
- Memory: 4 GB
- CPUs: 2
- Swap: 1 GB

## Development Workflow

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed development workflow, testing guidelines, and PR process.

## Additional Resources

- [WSL Documentation](https://docs.microsoft.com/en-us/windows/wsl/)
- [Docker Desktop WSL 2 Backend](https://docs.docker.com/desktop/windows/wsl/)
- [Node.js Documentation](https://nodejs.org/docs/latest-v20.x/api/)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)

## Getting Help

If you encounter issues not covered in this guide:

1. Check the [Windows Setup Checklist](WINDOWS_SETUP_CHECKLIST.md)
2. Review existing GitHub Issues
3. Create a new issue with:
   - Your environment details (Windows version, WSL version, Docker version)
   - Steps to reproduce the problem
   - Error messages and logs
   - Artifacts: `smoke-tests.log`, `compose-logs.log`, `verification-reports/*.json`
