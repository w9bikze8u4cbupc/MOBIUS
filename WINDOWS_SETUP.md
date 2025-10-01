# Windows Setup Guide for MOBIUS

This guide provides detailed instructions for setting up the MOBIUS development environment on Windows machines.

> **💡 Want to get started quickly?** See [QUICKSTART.md](./QUICKSTART.md) for a condensed setup guide.

## Table of Contents

1. [Recommended Setup: WSL2 + Docker Desktop](#recommended-setup-wsl2--docker-desktop)
2. [Alternative: Windows-Native PowerShell](#alternative-windows-native-powershell)
3. [Troubleshooting](#troubleshooting)
4. [Performance Tips](#performance-tips)

---

## Recommended Setup: WSL2 + Docker Desktop

**Why WSL2?** This approach is the fastest and most reliable on Windows. It avoids Windows path/permission quirks, runs bash scripts unchanged, and matches CI's Linux behavior exactly.

### Prerequisites

1. **Windows 10 version 2004+** or **Windows 11**
2. **Administrator access** to your machine
3. **Virtualization enabled** in BIOS/UEFI

### Step 1: Install WSL2

Open PowerShell as Administrator and run:

```powershell
# Enable WSL and Virtual Machine Platform
wsl --install

# Or if WSL is already installed, ensure it's WSL2
wsl --set-default-version 2
```

**Restart your computer** after installation.

Verify WSL2 is installed:
```powershell
wsl --list --verbose
```

### Step 2: Install Ubuntu on WSL2

```powershell
# Install Ubuntu (default distro)
wsl --install -d Ubuntu

# Or install a specific version
wsl --install -d Ubuntu-22.04
```

Launch Ubuntu from the Start Menu and create your user account when prompted.

### Step 3: Install Docker Desktop

1. Download [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
2. Install Docker Desktop
3. Open Docker Desktop Settings:
   - Go to **Settings** → **General**
   - ✅ Enable "Use the WSL 2 based engine"
   - Go to **Settings** → **Resources** → **WSL Integration**
   - ✅ Enable integration with your Ubuntu distro
   - Click **Apply & Restart**

Verify Docker is accessible from WSL:
```bash
wsl -d Ubuntu
docker --version
docker compose version
```

### Step 4: Setup Node.js in WSL

Open your Ubuntu WSL shell:

```bash
# Install nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.6/install.sh | bash

# Load nvm into current session
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js 20.18.1 (or latest 20.x)
nvm install 20.18.1
nvm use 20.18.1
nvm alias default 20.18.1

# Verify installation
node -v  # Should show v20.18.1
npm -v
```

### Step 5: Install FFmpeg in WSL

```bash
# Update package lists
sudo apt-get update

# Install FFmpeg
sudo apt-get install -y ffmpeg

# Verify installation
ffmpeg -version
ffprobe -version
```

### Step 6: Clone and Setup the Project

```bash
# Navigate to your workspace
# Note: Use /home/yourusername for best performance
# Avoid /mnt/c (Windows filesystem) for better I/O speed
cd ~

# Clone the repository
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS

# Install backend dependencies
npm ci

# Install frontend dependencies
cd client
npm ci
cd ..
```

### Step 7: Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Create .env file
cat > .env << 'EOF'
# OpenAI API Key (required for AI features)
OPENAI_API_KEY=your_openai_api_key_here

# Image Extractor API Key (optional)
IMAGE_EXTRACTOR_API_KEY=your_image_extractor_key

# Server Port (default: 5001)
PORT=5001

# Output Directory
OUTPUT_DIR=./src/api/uploads/MobiusGames
EOF

# Edit with your actual API keys
nano .env  # or use: vim .env
```

### Step 8: Run the Application

#### Start Backend API

```bash
# In the MOBIUS root directory
npm start
# Backend will run on http://localhost:5001
```

#### Start Frontend (New Terminal)

Open a new WSL terminal:

```bash
cd ~/MOBIUS/client
npm start
# Frontend will run on http://localhost:3000
```

Visit `http://localhost:3000` in your Windows browser.

### Step 9: Run Tests and Verification

```bash
# In the MOBIUS root directory

# Run unit tests
npm test

# Run golden video verification tests
npm run golden:check

# Generate golden reference files (if needed)
npm run golden:approve
```

### Step 10: Docker Compose Workflow (Optional)

If you're using Docker for containerized development:

```bash
# Build CI image
docker build -f Dockerfile.ci -t mobius-api-ci:local .

# Start services with docker compose
docker compose -f docker-compose.staging.yml up -d --build

# Check logs
docker compose -f docker-compose.staging.yml logs -f

# Run smoke tests (if available)
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# Tear down
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

---

## Alternative: Windows-Native PowerShell

**Note:** This approach is more fragile due to path/permission differences and bash script compatibility issues. Use WSL2 (above) if possible.

### Prerequisites

1. **Node.js 20.14+** - Install from [nodejs.org](https://nodejs.org/) or use [nvm-windows](https://github.com/coreybutler/nvm-windows)
2. **Docker Desktop** - With WSL2 backend enabled
3. **Git for Windows** - For Git Bash (to run bash scripts)

### Installation Steps

#### 1. Install Node.js

**Option A: Using nvm-windows (Recommended)**

```powershell
# Download and install nvm-windows from:
# https://github.com/coreybutler/nvm-windows/releases

# Then in PowerShell:
nvm install 20.18.1
nvm use 20.18.1
node -v
```

**Option B: Direct Installer**

Download from [nodejs.org](https://nodejs.org/) and install Node.js 20.18.1 or later.

#### 2. Install Docker Desktop

1. Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. Enable WSL2 backend in settings
3. Verify: `docker --version` in PowerShell

#### 3. Install Git for Windows

Download from [git-scm.com](https://git-scm.com/download/win) - this includes Git Bash.

#### 4. Clone and Setup

Open PowerShell:

```powershell
# Navigate to your workspace
cd C:\Users\YourUsername\Projects

# Clone repository
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS

# Install dependencies
npm ci

cd client
npm ci
cd ..
```

#### 5. Create .env File

Create `.env` in the project root with your text editor:

```env
OPENAI_API_KEY=your_openai_api_key_here
IMAGE_EXTRACTOR_API_KEY=your_image_extractor_key
PORT=5001
OUTPUT_DIR=./src/api/uploads/MobiusGames
```

#### 6. Run the Application

**Backend:**
```powershell
# In project root
npm start
```

**Frontend (New PowerShell Window):**
```powershell
cd client
npm start
```

#### 7. Run Tests

```powershell
# Unit tests
npm test

# Golden tests (may have issues on Windows)
npm run golden:check
```

#### 8. Docker Compose (if applicable)

```powershell
# Build
docker build -f Dockerfile.ci -t mobius-api-ci:local .

# Start services
docker compose -f docker-compose.staging.yml up -d --build

# Run smoke tests (requires WSL or Git Bash)
wsl bash ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
# OR if you have Git Bash:
bash ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# Tear down
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

**Important Notes:**
- Bash scripts (`.sh` files) won't run directly in PowerShell
- Use `wsl bash script.sh` or Git Bash to run them
- File paths may need adjustment (use forward slashes `/` not backslashes `\`)
- Line endings: Git should auto-convert (CRLF ↔ LF) but verify if you encounter issues

---

## Troubleshooting

### Docker Issues

#### "Cannot connect to Docker daemon"

**WSL:**
```bash
# Check Docker is running
docker ps

# If not, start Docker Desktop and ensure WSL integration is enabled
# Settings → Resources → WSL Integration → Enable for your distro
```

**PowerShell:**
- Ensure Docker Desktop is running
- Check System Tray for Docker icon
- Right-click → Settings → Ensure WSL2 backend is enabled

#### "docker: command not found" in WSL

```bash
# Check Docker Desktop WSL integration
# In Docker Desktop: Settings → Resources → WSL Integration
# Enable integration with your Ubuntu distribution
# Click Apply & Restart

# Verify Docker is in PATH
which docker
docker --version
```

#### Permission Errors with Docker Volumes

If you see permission errors (especially with UID 1001):

**WSL:**
```bash
# Add your user to docker group
sudo usermod -aG docker $USER

# Log out and back in, then verify
docker run hello-world
```

**PowerShell:**
- This is often due to mounting Windows paths into Linux containers
- Solution: Use WSL filesystem (`~/project`) instead of Windows paths (`/mnt/c/...`)

### Node.js Issues

#### "npm ERR! engine Unsupported engine"

You're using an incompatible Node version.

```bash
# WSL/Git Bash
nvm install 20.18.1
nvm use 20.18.1

# PowerShell (nvm-windows)
nvm install 20.18.1
nvm use 20.18.1
```

#### "EACCES: permission denied" npm errors

**WSL:**
```bash
# Fix npm permissions
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

**PowerShell:**
- Run PowerShell as Administrator
- Or install Node in your user directory (nvm-windows does this automatically)

#### Module not found errors

```bash
# Clean install
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# Also clean client
cd client
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### FFmpeg Issues

#### "ffmpeg: command not found"

**WSL:**
```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

**PowerShell:**
- Download from [ffmpeg.org](https://ffmpeg.org/download.html)
- Add to PATH environment variable
- Or use: `choco install ffmpeg` (if you have Chocolatey)

#### FFmpeg version too old

```bash
# WSL: Add PPA for latest FFmpeg
sudo add-apt-repository ppa:savoury1/ffmpeg4
sudo apt-get update
sudo apt-get install -y ffmpeg

# Verify version
ffmpeg -version
```

### Script Execution Issues

#### "cannot execute binary file: Exec format error"

This means you're trying to run a bash script in PowerShell.

**Solution 1 (WSL):**
```powershell
wsl bash ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
```

**Solution 2 (Git Bash):**
```powershell
bash ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
```

#### "Permission denied" when running .sh scripts

```bash
# WSL/Git Bash: Make scripts executable
chmod +x scripts/ci/*.sh
```

### Port Already in Use

#### Port 3000 or 5001 already in use

**Find and kill process:**

WSL/Git Bash:
```bash
# Find process using port 5001
lsof -i :5001
# Kill it
kill -9 <PID>

# Or use fuser
fuser -k 5001/tcp
```

PowerShell:
```powershell
# Find process
netstat -ano | findstr :5001

# Kill it (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### Testing Issues

#### Golden tests fail with "SSIM mismatch"

This is expected on Windows due to rendering differences across platforms.

**Solutions:**
1. Use WSL2 for consistent Linux-based rendering
2. Generate Windows-specific golden files:
   ```bash
   npm run golden:approve
   ```
3. Skip golden tests on Windows (tests are primarily for CI)

#### "Cannot find module" in tests

```bash
# Ensure all dependencies are installed
npm ci
cd client && npm ci && cd ..

# Clear Jest cache
npm test -- --clearCache
```

### Performance Issues

#### Slow I/O performance in WSL

**Problem:** Files on Windows filesystem (`/mnt/c`) are slow.

**Solution:** Keep project files in WSL filesystem:
```bash
# DON'T DO THIS (slow):
cd /mnt/c/Users/YourName/Projects/MOBIUS

# DO THIS (fast):
cd ~/MOBIUS  # or /home/yourusername/MOBIUS
```

#### Node modules installation takes forever

```bash
# Use npm ci instead of npm install (faster, more reliable)
npm ci

# Increase memory for npm
export NODE_OPTIONS=--max-old-space-size=4096
npm ci
```

---

## Performance Tips

### WSL2 Performance Optimization

1. **Store projects in WSL filesystem** (not `/mnt/c`)
   ```bash
   # Good: ~/projects/MOBIUS
   # Bad: /mnt/c/Users/yourname/projects/MOBIUS
   ```

2. **Allocate more resources to WSL2**
   
   Create/edit `%USERPROFILE%\.wslconfig`:
   ```ini
   [wsl2]
   memory=8GB
   processors=4
   swap=2GB
   ```
   
   Restart WSL: `wsl --shutdown` (in PowerShell)

3. **Disable Windows Defender for WSL filesystem**
   
   Add exclusion for: `%LOCALAPPDATA%\Packages\CanonicalGroupLimited.Ubuntu*`

4. **Use Windows Terminal** for better WSL experience
   
   Install from Microsoft Store

### Node.js Performance

```bash
# Set memory limits for Node
export NODE_OPTIONS="--max-old-space-size=4096"

# Add to ~/.bashrc to make permanent
echo 'export NODE_OPTIONS="--max-old-space-size=4096"' >> ~/.bashrc
```

### Docker Performance

1. **Allocate enough resources in Docker Desktop**
   - Settings → Resources
   - Memory: 6-8 GB
   - CPUs: 4+
   - Swap: 2 GB

2. **Use BuildKit for faster builds**
   ```bash
   export DOCKER_BUILDKIT=1
   export COMPOSE_DOCKER_CLI_BUILD=1
   ```

---

## Quick Reference Commands

### WSL2 Management

```powershell
# List installed distros
wsl --list --verbose

# Shutdown WSL
wsl --shutdown

# Restart a distro
wsl --terminate Ubuntu
wsl -d Ubuntu

# Set default distro
wsl --set-default Ubuntu

# Update WSL
wsl --update
```

### Docker Commands

```bash
# Check Docker status
docker ps

# View logs
docker compose logs -f

# Clean up
docker system prune -a
docker volume prune

# Reset everything
docker compose down --volumes --remove-orphans
```

### Project Commands

```bash
# Install dependencies
npm ci

# Start backend
npm start

# Start frontend
cd client && npm start

# Run tests
npm test

# Run golden tests
npm run golden:check

# Update golden references
npm run golden:approve
```

---

## Getting Help

If you encounter issues not covered here:

1. **Check GitHub Issues**: [MOBIUS Issues](https://github.com/w9bikze8u4cbupc/MOBIUS/issues)
2. **Check logs**:
   - Backend: Check terminal output
   - Frontend: Check browser console (F12)
   - Docker: `docker compose logs`
3. **Collect diagnostic info**:
   ```bash
   # System info
   node -v
   npm -v
   docker --version
   ffmpeg -version
   
   # WSL info (in PowerShell)
   wsl --list --verbose
   
   # Save logs
   docker compose -f docker-compose.staging.yml logs --no-color > compose-logs.log
   ```
4. **Create a new issue** with:
   - Operating system and version
   - Node.js version
   - Complete error message
   - Steps to reproduce

---

## Summary

**For Windows users, we strongly recommend the WSL2 + Docker Desktop approach:**

✅ Fastest and most reliable  
✅ Matches CI environment exactly  
✅ Runs all scripts unchanged  
✅ Avoids Windows path/permission issues  
✅ Better performance than Windows-native

**The Windows-native PowerShell approach is possible but:**

⚠️ More fragile  
⚠️ Requires workarounds for bash scripts  
⚠️ May have permission issues  
⚠️ Golden tests may not work correctly

Choose the setup that works best for your environment, but WSL2 will save you troubleshooting time in the long run.
