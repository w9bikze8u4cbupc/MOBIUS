# Windows Setup Guide for MOBIUS

This guide helps Windows developers set up MOBIUS using WSL2 (Windows Subsystem for Linux) — the recommended approach for Windows development that ensures parity with the CI environment.

## Quick Start (One Command)

Download and run the bootstrap script:

```powershell
# From PowerShell (as Administrator recommended)
wsl curl -fsSL https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_wsl.sh -o ~/run_mobius_wsl.sh
wsl chmod +x ~/run_mobius_wsl.sh
wsl bash -lc "bash ~/run_mobius_wsl.sh"
```

Or use the PowerShell wrapper:

```powershell
.\scripts\run_mobius_from_ps.ps1 -RepoPath (pwd).Path
```

This will:
1. Install Node.js 20.18.1 (via nvm)
2. Install ffmpeg
3. Validate Docker Desktop is running
4. Clone/update the MOBIUS repository
5. Install dependencies with `npm ci`
6. Run repository verification
7. Build Docker images
8. Start the staging environment
9. Run smoke tests
10. Clean up containers

## Prerequisites

### 1. Enable WSL2

**Windows 10 version 2004+ or Windows 11:**

```powershell
# Run as Administrator
wsl --install
```

This installs WSL2 with Ubuntu by default. Restart your computer when prompted.

**Verify WSL2 is installed:**

```powershell
wsl --list --verbose
```

You should see:
```
  NAME                   STATE           VERSION
* Ubuntu                 Running         2
```

### 2. Install Docker Desktop

1. Download [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
2. Run the installer
3. Enable **WSL2 backend** during installation
4. Start Docker Desktop
5. In Docker Desktop settings:
   - Go to **Settings → General**
   - Enable "Use the WSL 2 based engine"
   - Go to **Settings → Resources → WSL Integration**
   - Enable integration with your Ubuntu distribution

**Verify Docker works in WSL:**

```bash
wsl docker --version
wsl docker compose version
```

### 3. Install Windows Terminal (Optional but Recommended)

- Install from [Microsoft Store](https://aka.ms/terminal)
- Provides better WSL2 experience with tabs, Unicode support, and customization

## Manual Setup

If you prefer to set up components manually:

### Step 1: Install Node.js in WSL

```bash
# In WSL terminal
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20.18.1
nvm use 20.18.1
nvm alias default 20.18.1
```

### Step 2: Install ffmpeg in WSL

```bash
sudo apt update
sudo apt install -y ffmpeg
ffmpeg -version
```

### Step 3: Clone the Repository

```bash
cd ~
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS
```

### Step 4: Install Dependencies

```bash
npm ci
```

### Step 5: Verify Repository Integrity

```bash
npm run verify-clean-genesis -- --verbose
```

### Step 6: Build and Test

```bash
# Build CI image
docker build -f Dockerfile.ci -t mobius-api-ci:local .

# Start staging environment
docker compose -f docker-compose.staging.yml up -d --build

# Run smoke tests
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# View logs if needed
docker compose -f docker-compose.staging.yml logs

# Tear down
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

## Development Workflow

### Accessing Files

Your Windows files are accessible in WSL at `/mnt/c/`, `/mnt/d/`, etc.

```bash
# Navigate to Windows directories
cd /mnt/c/Users/YourUsername/Projects/MOBIUS
```

Your WSL home directory is accessible from Windows at:
```
\\wsl$\Ubuntu\home\yourusername\
```

### Using VS Code with WSL

1. Install [VS Code](https://code.visualstudio.com/)
2. Install the "Remote - WSL" extension
3. Open WSL terminal and navigate to your project:
   ```bash
   cd ~/MOBIUS
   code .
   ```

This opens VS Code with full WSL integration.

### Running the Application

```bash
# From WSL terminal in the MOBIUS directory
npm run test
npm run golden:check
```

## Troubleshooting

### Docker Issues

**Problem:** "Cannot connect to Docker daemon"

**Solution:**
1. Ensure Docker Desktop is running
2. Check WSL integration is enabled in Docker Desktop settings
3. Restart Docker Desktop
4. Test: `docker ps`

**Problem:** "docker: command not found" in WSL

**Solution:**
- Docker Desktop must be running first
- Verify WSL integration is enabled for your distro
- Restart WSL: `wsl --shutdown` then open a new WSL terminal

### Node.js Issues

**Problem:** "node: command not found"

**Solution:**
```bash
source ~/.bashrc
nvm use 20.18.1
```

Add to `~/.bashrc`:
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

### Performance Issues

**Solution:**
- Keep source code in WSL filesystem (`~/MOBIUS`) not `/mnt/c/`
- WSL2 has much better performance with native Linux filesystem
- Use `\\wsl$\Ubuntu\home\yourusername\MOBIUS` from Windows if needed

### ffmpeg Issues

**Problem:** "ffmpeg: command not found"

**Solution:**
```bash
sudo apt update
sudo apt install -y ffmpeg
```

### Port Already in Use

**Problem:** "Port 5001 is already in use"

**Solution:**
```bash
# Find and kill process using the port
sudo lsof -i :5001
sudo kill -9 <PID>

# Or use different port
PORT=5002 docker compose -f docker-compose.staging.yml up
```

### Smoke Tests Failing

**Check the logs:**

```bash
cat smoke-tests.log
cat compose-logs.log
ls -la verification-reports/
```

**Common causes:**
- Container not fully started (increase timeout)
- Port conflicts
- Docker out of memory

**Solution:**
```bash
# Increase Docker memory in Docker Desktop settings (6GB+ recommended)
# Restart Docker Desktop
docker compose -f docker-compose.staging.yml down --volumes
docker system prune -af --volumes
docker compose -f docker-compose.staging.yml up -d --build
```

## Configuration Examples

### Using a Different Node Version

```bash
nvm install 18.20.0
nvm use 18.20.0
```

### Custom Docker Compose Settings

Create `docker-compose.override.yml`:

```yaml
version: '3.8'
services:
  mobius-api:
    environment:
      - DEBUG=true
      - LOG_LEVEL=verbose
    ports:
      - "5002:5001"
```

### Environment Variables

Create `.env` in project root:

```bash
PORT=5001
NODE_ENV=development
LOG_LEVEL=info
```

## Advanced Topics

### Building for Production

```bash
docker build -f Dockerfile.ci -t mobius-api:production .
docker run -p 5001:5001 mobius-api:production
```

### Running Tests in CI Mode

```bash
npm test -- --ci --coverage
npm run golden:check
```

### Debugging Container Issues

```bash
# Run container interactively
docker run -it --rm mobius-api-ci:local sh

# Inspect running container
docker exec -it <container-id> sh

# View logs
docker compose -f docker-compose.staging.yml logs -f mobius-api
```

### Docker Build in CI Environments

**Note:** Some CI environments may have network restrictions or SSL certificate issues that can affect Docker builds. If you encounter:

- `self-signed certificate in certificate chain` errors
- Package repository access issues
- Network timeout errors

Try these solutions:

1. **For npm SSL issues:**
   ```bash
   docker build --build-arg NPM_CONFIG_STRICT_SSL=false -f Dockerfile.ci -t mobius-api-ci:local .
   ```

2. **For proxy environments:**
   ```bash
   docker build --build-arg HTTP_PROXY=$HTTP_PROXY --build-arg HTTPS_PROXY=$HTTPS_PROXY -f Dockerfile.ci -t mobius-api-ci:local .
   ```

3. **Use pre-built images:**
   If available, pull pre-built images from a container registry instead of building locally.

4. **Local development:**
   For local Windows WSL2 development, these issues are typically not present as your local Docker Desktop has direct internet access.

## Additional Resources

- [WSL2 Documentation](https://docs.microsoft.com/en-us/windows/wsl/)
- [Docker Desktop WSL2 Backend](https://docs.docker.com/desktop/windows/wsl/)
- [VS Code Remote Development](https://code.visualstudio.com/docs/remote/wsl)
- [Node.js with WSL2](https://docs.microsoft.com/en-us/windows/dev-environment/javascript/nodejs-on-wsl)

## Getting Help

If you encounter issues:

1. Check this troubleshooting guide
2. Review smoke-tests.log, compose-logs.log, and verification-reports/
3. Check existing GitHub issues
4. Open a new issue with:
   - Windows version
   - WSL version (`wsl --version`)
   - Docker version
   - Error messages and logs
   - Output of `npm run verify-clean-genesis`

## Next Steps

- See [WINDOWS_SETUP_CHECKLIST.md](./WINDOWS_SETUP_CHECKLIST.md) for a step-by-step setup tracker
- See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines
- See main [README.md](../README.md) for project overview
