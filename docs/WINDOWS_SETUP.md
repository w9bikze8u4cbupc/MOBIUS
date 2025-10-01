# Windows Setup Guide for MOBIUS

This guide helps Windows developers set up MOBIUS using WSL2 (Windows Subsystem for Linux 2) with Docker Desktop.

## Quick Start (Recommended)

**One-command bootstrap** that installs everything you need:

```bash
# Download and run the bootstrap script
curl -fsSL https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_wsl.sh -o ~/run_mobius_wsl.sh
chmod +x ~/run_mobius_wsl.sh
~/run_mobius_wsl.sh
```

Or from PowerShell (if you already have the repo):

```powershell
.\scripts\run_mobius_from_ps.ps1 -RepoPath (pwd).Path
```

This script will:
- ✅ Install Node.js 20.18.1 via nvm
- ✅ Install ffmpeg
- ✅ Validate Docker is running
- ✅ Clone or update the repository
- ✅ Install npm dependencies
- ✅ Run repository integrity verification
- ✅ Build Docker images
- ✅ Start the application stack
- ✅ Run smoke tests
- ✅ Clean up containers

## Prerequisites

### 1. Windows 10/11 with WSL2

**Install WSL2:**

```powershell
# Run in PowerShell as Administrator
wsl --install
```

After installation, restart your computer and set up your Linux username/password.

**Update to WSL2 (if needed):**

```powershell
wsl --set-default-version 2
```

**Verify WSL2:**

```bash
wsl -l -v
```

You should see VERSION 2 for your distribution.

### 2. Docker Desktop for Windows

1. Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. During installation, ensure "Use WSL 2 instead of Hyper-V" is selected
3. After installation, open Docker Desktop
4. Go to Settings → General → Enable "Use the WSL 2 based engine"
5. Go to Settings → Resources → WSL Integration
   - Enable "Enable integration with my default WSL distro"
   - Enable integration with your specific distro (e.g., Ubuntu)

**Verify Docker in WSL:**

```bash
# In WSL terminal
docker --version
docker compose version
docker ps
```

All commands should work without errors.

## Manual Setup (Alternative)

If you prefer to set up manually instead of using the bootstrap script:

### 1. Install Node.js 20.18.1

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
node --version  # Should show v20.18.1
npm --version
```

### 2. Install ffmpeg

```bash
sudo apt update
sudo apt install -y ffmpeg

# Verify installation
ffmpeg -version
ffprobe -version
```

### 3. Clone Repository and Install Dependencies

```bash
# Clone the repository
cd ~
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS

# Install npm dependencies
npm ci

# Run repository verification
npm run verify-clean-genesis -- --verbose
```

### 4. Build and Start Application

```bash
# Build the CI image
docker build -f Dockerfile.ci -t mobius-api-ci:local .

# Start the staging stack
docker compose -f docker-compose.staging.yml up -d --build

# Wait for services to be ready (about 30 seconds)
sleep 30

# Run smoke tests
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# View logs if needed
docker compose -f docker-compose.staging.yml logs

# Stop the stack
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

## Troubleshooting

### Docker issues

**"Cannot connect to the Docker daemon"**
- Ensure Docker Desktop is running
- Check WSL integration is enabled in Docker Desktop settings
- Restart Docker Desktop
- Run: `docker ps` to verify

**"permission denied while trying to connect to the Docker daemon socket"**
```bash
# Add your user to the docker group
sudo usermod -aG docker $USER

# Log out and log back in to WSL
exit
# Then open WSL again
```

### WSL2 issues

**Slow file access**
- Store your code in WSL filesystem (`~/MOBIUS`), not in Windows filesystem (`/mnt/c/...`)
- WSL2 has much faster access to files in its own filesystem

**WSL2 not using enough memory/CPU**
Create or edit `~/.wslconfig` in Windows (in `C:\Users\YourUsername\.wslconfig`):

```ini
[wsl2]
memory=8GB
processors=4
swap=2GB
```

Then restart WSL:
```powershell
wsl --shutdown
```

### Node.js/npm issues

**"node: command not found"**
```bash
# Ensure nvm is loaded
source ~/.bashrc

# Set default Node version
nvm alias default 20.18.1
nvm use default
```

**npm install fails**
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### ffmpeg issues

**"ffmpeg: command not found"**
```bash
# Update and install ffmpeg
sudo apt update
sudo apt install -y ffmpeg
```

**ffmpeg version incompatibility**
The project requires ffmpeg 4.x or later. Check version:
```bash
ffmpeg -version
```

### Script execution issues

**"Permission denied" when running scripts**
```bash
# Make scripts executable
chmod +x scripts/run_mobius_wsl.sh
chmod +x scripts/ci/smoke-tests.sh
chmod +x scripts/run_mobius_from_ps.ps1
```

### Port conflicts

**"Port 5001 already in use"**
```bash
# Find and kill the process using port 5001
lsof -ti:5001 | xargs kill -9

# Or change the port in docker-compose.staging.yml
```

## Configuration

### Environment Variables

Create a `.env` file in the project root (this is ignored by git):

```bash
# API Configuration
PORT=5001
NODE_ENV=development

# Add other environment variables as needed
```

### Docker Resources

If builds or tests are slow, increase Docker Desktop resources:
1. Open Docker Desktop
2. Go to Settings → Resources
3. Increase CPU and Memory limits
4. Apply & Restart

## Development Workflow

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed development workflow, testing guidelines, and code style conventions.

## Checklist

Track your setup progress with the [Windows Setup Checklist](WINDOWS_SETUP_CHECKLIST.md).

## Additional Resources

- [WSL2 Documentation](https://docs.microsoft.com/en-us/windows/wsl/)
- [Docker Desktop WSL2 Backend](https://docs.docker.com/desktop/windows/wsl/)
- [nvm Documentation](https://github.com/nvm-sh/nvm)
- [ffmpeg Documentation](https://ffmpeg.org/documentation.html)

## Getting Help

If you encounter issues not covered here:
1. Check the [troubleshooting section](#troubleshooting)
2. Review the [Windows Setup Checklist](WINDOWS_SETUP_CHECKLIST.md)
3. Check existing GitHub issues
4. Create a new issue with:
   - Your Windows version
   - WSL version (`wsl -l -v`)
   - Docker version (`docker --version`)
   - Node version (`node --version`)
   - Complete error logs
   - Contents of verification artifacts if available:
     - `smoke-tests.log`
     - `compose-logs.log`
     - `verification-reports/*.json`
