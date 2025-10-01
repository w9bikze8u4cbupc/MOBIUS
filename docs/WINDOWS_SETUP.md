# Windows Setup Guide (WSL2)

This guide provides a complete setup for running MOBIUS on Windows using WSL2 (Windows Subsystem for Linux).

## Prerequisites

Before starting, ensure you have:

1. **Windows 10/11** with WSL2 installed
   - If not installed, follow [Microsoft's WSL installation guide](https://docs.microsoft.com/en-us/windows/wsl/install)
   - Recommended: Ubuntu 20.04 or 22.04 LTS

2. **Docker Desktop for Windows**
   - Download from [Docker's official website](https://www.docker.com/products/docker-desktop)
   - Configure Docker Desktop to use WSL2 backend:
     - Open Docker Desktop → Settings → General
     - Check "Use the WSL 2 based engine"
   - Enable WSL integration for your Ubuntu distro:
     - Docker Desktop → Settings → Resources → WSL Integration
     - Enable integration for your Ubuntu distribution

3. **Administrator rights** (for initial setup only)

## Quick Start

### Option 1: Run the WSL Bootstrap Script

This is the fastest and most reliable method. The script will:
- Install Node.js (v20.18.1) via nvm
- Install ffmpeg
- Clone/update the repository
- Install project dependencies
- Run verification tests
- Build and start the Docker stack
- Run smoke tests

1. Save the following script as `run_mobius_wsl.sh` in your WSL home directory:

```bash
#!/usr/bin/env bash
set -euo pipefail

# CONFIG - adjust if needed
NODE_VERSION="20.18.1"
REPO_URL="https://github.com/w9bikze8u4cbupc/MOBIUS.git"
REPO_DIR="$HOME/mobius"
SMOKE_TARGET="http://localhost:5001"
SMOKE_TIMEOUT=30
SMOKE_RETRIES=2

echo "=== 1) Install nvm & Node ${NODE_VERSION} (if needed) ==="
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != "v${NODE_VERSION}" ]]; then
  if ! command -v nvm >/dev/null 2>&1; then
    echo "Installing nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.6/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  else
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  fi
  echo "Installing Node ${NODE_VERSION}..."
  nvm install "${NODE_VERSION}"
  nvm use "${NODE_VERSION}"
fi
echo "node $(node -v) / npm $(npm -v)"

echo "=== 2) Ensure ffmpeg installed ==="
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Installing ffmpeg..."
  sudo apt-get update -y
  sudo apt-get install -y ffmpeg
fi
echo "ffmpeg $(ffmpeg -version | head -n1)"

echo "=== 3) Check Docker availability ==="
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker CLI not available in WSL. Start Docker Desktop and enable WSL integration."
  exit 2
fi
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: docker daemon not accessible. Open Docker Desktop and ensure WSL integration is enabled for this distro."
  exit 2
fi
echo "Docker is available."

echo "=== 4) Clone repo (or update) ==="
if [ -d "$REPO_DIR" ]; then
  echo "Repo directory exists: $REPO_DIR — pulling latest on current branch"
  cd "$REPO_DIR"
  git pull --ff-only || true
else
  git clone "$REPO_URL" "$REPO_DIR"
  cd "$REPO_DIR"
fi

echo "=== 5) Install project deps ==="
# Use npm ci for clean install if package-lock.json exists
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "=== 6) Run verification ==="
npm run verify-clean-genesis --silent || {
  echo "verify-clean-genesis failed — inspect verification-reports/ or run with -- --verbose"
  ls -la verification-reports || true
  exit 3
}
echo "Verification passed."

echo "=== 7) Build CI image ==="
docker build -f Dockerfile.ci -t mobius-api-ci:local .

echo "=== 8) Start compose stack ==="
docker compose -f docker-compose.staging.yml up -d --build

# small wait before smoke-tests
sleep 3

echo "=== 9) Run smoke-tests (logs saved to smoke-tests.log) ==="
./scripts/ci/smoke-tests.sh "${SMOKE_TARGET}" "${SMOKE_TIMEOUT}" "${SMOKE_RETRIES}" > smoke-tests.log 2>&1 || {
  echo "Smoke tests failed. Collecting artifacts..."
  docker compose -f docker-compose.staging.yml logs --no-color > compose-logs.log || true
  echo "Listing verification-reports"
  ls -lah verification-reports || true
  echo "Artifacts saved: smoke-tests.log, compose-logs.log, verification-reports/*"
  # keep containers up for debugging (do not auto-down). Exit non-zero
  exit 4
}

echo "=== 10) Tear down ==="
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans

echo "SUCCESS: Mobius stack smoke-tests passed locally."
```

2. Make it executable and run:

```bash
chmod +x ~/run_mobius_wsl.sh
~/run_mobius_wsl.sh
```

### Option 2: PowerShell Wrapper (Run from Windows)

If you prefer to run from PowerShell on Windows:

1. Save the WSL script above to your WSL home directory
2. Save the following as `run_mobius_from_ps.ps1`:

```powershell
# PowerShell wrapper: runs the WSL script (assumes it's saved at ~/run_mobius_wsl.sh)
wsl bash -lc "bash ~/run_mobius_wsl.sh"
```

3. Run in PowerShell:

```powershell
.\run_mobius_from_ps.ps1
```

Or, if you have the repo on Windows:

```powershell
$winRepoPath = "C:\Users\YourUsername\source\mobius"
$wslPath = wsl wslpath -u $winRepoPath
wsl bash -lc "cd $wslPath && bash ~/run_mobius_wsl.sh"
```

## Manual Setup (Alternative)

If you prefer to set up step-by-step:

### 1. Install Node.js

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.6/install.sh | bash
source ~/.bashrc

# Install Node.js 20.18.1
nvm install 20.18.1
nvm use 20.18.1
```

### 2. Install ffmpeg

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

### 3. Clone the Repository

```bash
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS
```

### 4. Install Dependencies

```bash
npm ci
```

### 5. Run Tests

```bash
npm test
```

## Troubleshooting

### Docker Errors

**Problem**: `docker: command not found` or `Cannot connect to the Docker daemon`

**Solution**:
1. Ensure Docker Desktop is running
2. Open Docker Desktop → Settings → Resources → WSL Integration
3. Enable integration for your Ubuntu distribution
4. Restart Docker Desktop
5. In WSL, verify with: `docker --version`

### Permission Issues with Volumes

**Problem**: Permission denied when mounting volumes

**Solution**: Avoid mounting Windows host folders into Linux containers. Instead:
- Use Docker-managed volumes
- Run everything inside the WSL filesystem (e.g., `/home/username/mobius`)

### Node Version Warnings (EBADENGINE)

**Problem**: `EBADENGINE` warnings during `npm install`

**Solution**: 
- The bootstrap script installs Node 20.18.1 by default
- Verify your Node version: `node -v`
- If you need a different version, modify the `NODE_VERSION` variable in the script

### Smoke Tests Failing

**Problem**: Smoke tests fail during step 9

**Solution**:
1. Check the logs:
   ```bash
   cat smoke-tests.log
   cat compose-logs.log
   ls -la verification-reports/
   ```
2. Ensure all required services are running:
   ```bash
   docker compose -f docker-compose.staging.yml ps
   ```
3. Check if the API is accessible:
   ```bash
   curl http://localhost:5001/health
   ```

### WSL Integration Not Working

**Problem**: Docker commands work in Windows but not in WSL

**Solution**:
1. Restart Docker Desktop
2. Restart your WSL distribution: `wsl --shutdown` (from Windows PowerShell)
3. Verify Docker Desktop settings are correct (see Prerequisites)

## Configuration Options

You can customize the bootstrap script by editing these variables at the top:

- `NODE_VERSION`: Node.js version to install (default: "20.18.1")
- `REPO_URL`: Repository URL (default: official MOBIUS repo)
- `REPO_DIR`: Where to clone the repo (default: "$HOME/mobius")
- `SMOKE_TARGET`: API endpoint for smoke tests (default: "http://localhost:5001")
- `SMOKE_TIMEOUT`: Timeout for smoke tests in seconds (default: 30)
- `SMOKE_RETRIES`: Number of retries for smoke tests (default: 2)

## Additional Resources

- [WSL Documentation](https://docs.microsoft.com/en-us/windows/wsl/)
- [Docker Desktop WSL 2 Backend](https://docs.docker.com/desktop/windows/wsl/)
- [Node Version Manager (nvm)](https://github.com/nvm-sh/nvm)

## Support

If you encounter issues not covered in this guide:
1. Check existing GitHub Issues
2. Create a new issue with:
   - Your Windows version
   - WSL version (`wsl --version`)
   - Docker Desktop version
   - Error messages and logs
