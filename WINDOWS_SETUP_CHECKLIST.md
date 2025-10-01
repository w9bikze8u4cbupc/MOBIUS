# Windows Setup Checklist

Use this checklist to ensure you've completed all steps for setting up MOBIUS on Windows.

> **📋 Tip**: Print this page or keep it open while following [WINDOWS_SETUP.md](./WINDOWS_SETUP.md)

## Pre-Installation Checklist

- [ ] Windows 10 version 2004+ or Windows 11
- [ ] Administrator access to your computer
- [ ] Virtualization enabled in BIOS/UEFI
- [ ] At least 8GB RAM (16GB recommended)
- [ ] At least 20GB free disk space

## WSL2 Setup (Recommended)

### Step 1: WSL Installation
- [ ] Open PowerShell as Administrator
- [ ] Run: `wsl --install`
- [ ] Restart computer
- [ ] Verify WSL2 is default: `wsl --list --verbose`

### Step 2: Ubuntu Installation
- [ ] Install Ubuntu: `wsl --install -d Ubuntu`
- [ ] Launch Ubuntu from Start Menu
- [ ] Create username and password when prompted
- [ ] Username created: ________________

### Step 3: Docker Desktop
- [ ] Download Docker Desktop from docker.com
- [ ] Install Docker Desktop
- [ ] Enable "Use the WSL 2 based engine" in Settings → General
- [ ] Enable WSL integration for Ubuntu in Settings → Resources → WSL Integration
- [ ] Restart Docker Desktop
- [ ] Verify in WSL: `docker --version`
- [ ] Verify in WSL: `docker compose version`

### Step 4: Node.js in WSL
- [ ] Open Ubuntu WSL terminal
- [ ] Install nvm:
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.6/install.sh | bash
  ```
- [ ] Load nvm: `source ~/.bashrc`
- [ ] Install Node.js: `nvm install 20.18.1`
- [ ] Set default: `nvm alias default 20.18.1`
- [ ] Verify: `node -v` shows v20.18.1 or similar
- [ ] Verify: `npm -v` shows a version number

### Step 5: FFmpeg in WSL
- [ ] Update package lists: `sudo apt-get update`
- [ ] Install FFmpeg: `sudo apt-get install -y ffmpeg`
- [ ] Verify: `ffmpeg -version`
- [ ] Verify: `ffprobe -version`

### Step 6: Clone Repository
- [ ] Navigate to home directory: `cd ~`
- [ ] Clone repo: `git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git`
- [ ] Navigate to repo: `cd MOBIUS`
- [ ] Install backend deps: `npm ci`
- [ ] Navigate to client: `cd client`
- [ ] Install client deps: `npm ci`
- [ ] Return to root: `cd ..`

### Step 7: Configuration
- [ ] Copy env template: `cp .env.example .env`
- [ ] Edit .env file: `nano .env` (or `vim .env`)
- [ ] Add your OpenAI API key
- [ ] Add your Image Extractor API key (optional)
- [ ] Save and exit editor
- [ ] OpenAI API key added: [ ]
- [ ] Image Extractor API key added (optional): [ ]

### Step 8: Verification
- [ ] Run: `npm run verify-clean-genesis`
- [ ] All checks passed: [ ]
- [ ] Warnings addressed (if any): [ ]

### Step 9: First Run
- [ ] Open terminal 1
- [ ] Run: `npm start`
- [ ] Backend starts on port 5001: [ ]
- [ ] No errors in terminal: [ ]

- [ ] Open terminal 2
- [ ] Navigate: `cd ~/MOBIUS/client`
- [ ] Run: `npm start`
- [ ] Frontend starts on port 3000: [ ]
- [ ] Browser opens automatically: [ ]

- [ ] Visit http://localhost:3000
- [ ] Application loads successfully: [ ]
- [ ] Can interact with UI: [ ]

### Step 10: Testing (Optional)
- [ ] Run unit tests: `npm test`
- [ ] Run golden tests: `npm run golden:check`
- [ ] All tests pass or expected failures documented: [ ]

## Alternative: Windows-Native PowerShell Setup

Only complete this section if you chose NOT to use WSL2.

### Node.js Installation
- [ ] Install Node.js 20.18.1+ from nodejs.org or nvm-windows
- [ ] Verify in PowerShell: `node -v`
- [ ] Verify in PowerShell: `npm -v`

### Docker Desktop
- [ ] Install Docker Desktop with WSL2 backend
- [ ] Verify: `docker --version`

### Git for Windows
- [ ] Install Git for Windows (includes Git Bash)
- [ ] Verify: `git --version`

### Project Setup
- [ ] Clone: `git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git`
- [ ] Install deps: `npm ci`
- [ ] Install client deps: `cd client && npm ci && cd ..`
- [ ] Copy .env: `cp .env.example .env`
- [ ] Edit .env with API keys
- [ ] Run verification: `npm run verify-clean-genesis`

### Running
- [ ] Terminal 1: `npm start`
- [ ] Terminal 2: `cd client && npm start`
- [ ] Visit http://localhost:3000

## Docker Setup (Optional)

### Building Images
- [ ] Build CI image: `docker build -f Dockerfile.ci -t mobius-api-ci:local .`
- [ ] Image builds successfully: [ ]

### Running with Docker Compose
- [ ] Start services: `docker compose -f docker-compose.staging.yml up -d`
- [ ] Check status: `docker compose -f docker-compose.staging.yml ps`
- [ ] All services healthy: [ ]
- [ ] View logs: `docker compose -f docker-compose.staging.yml logs -f`

### Smoke Tests
- [ ] Run: `./scripts/ci/smoke-tests.sh http://localhost:5001 30 2`
- [ ] All smoke tests pass: [ ]

### Cleanup
- [ ] Stop services: `docker compose -f docker-compose.staging.yml down --volumes`

## Troubleshooting Checklist

If you encounter issues, check these common problems:

### WSL Issues
- [ ] WSL version is 2: `wsl --list --verbose`
- [ ] Ubuntu is running: `wsl -d Ubuntu`
- [ ] Can access Windows files: `ls /mnt/c`

### Docker Issues
- [ ] Docker Desktop is running (check system tray)
- [ ] WSL integration enabled for Ubuntu
- [ ] Can run: `docker ps`
- [ ] Can run: `docker run hello-world`

### Node.js Issues
- [ ] Node version >= 20.14: `node -v`
- [ ] npm works: `npm -v`
- [ ] node_modules installed: `ls node_modules`

### FFmpeg Issues
- [ ] FFmpeg installed: `ffmpeg -version`
- [ ] FFprobe installed: `ffprobe -version`

### Port Issues
- [ ] Port 5001 free: `lsof -i :5001` (or `netstat -ano | findstr :5001`)
- [ ] Port 3000 free: `lsof -i :3000` (or `netstat -ano | findstr :3000`)

### Permission Issues
- [ ] Can write to project directory
- [ ] Docker daemon accessible
- [ ] .env file readable

## Post-Setup Checklist

Once everything is running:

- [ ] Save your .env file in a secure location (backup)
- [ ] Bookmark http://localhost:3000 for easy access
- [ ] Join MOBIUS community (if available)
- [ ] Star the repository on GitHub
- [ ] Read CONTRIBUTING.md if you plan to contribute
- [ ] Explore the API at http://localhost:5001

## Performance Optimization (Optional)

For better performance in WSL:

- [ ] Store project in WSL filesystem (~/MOBIUS, not /mnt/c)
- [ ] Configure .wslconfig with more resources
- [ ] Disable Windows Defender for WSL directories
- [ ] Use Windows Terminal for better WSL experience

## Getting Help

If you're stuck:

1. **Check logs**:
   - [ ] Backend logs in terminal
   - [ ] Frontend logs in browser console (F12)
   - [ ] Docker logs: `docker compose logs`

2. **Search documentation**:
   - [ ] WINDOWS_SETUP.md troubleshooting section
   - [ ] README.md support section
   - [ ] CONTRIBUTING.md for development issues

3. **Get support**:
   - [ ] Check GitHub Issues for similar problems
   - [ ] Create new issue with detailed information
   - [ ] Include: OS version, Node version, error messages, logs

## Maintenance Checklist

Regular maintenance tasks:

### Weekly
- [ ] Update dependencies: `npm update`
- [ ] Update Docker images: `docker compose pull`

### Monthly
- [ ] Update Node.js: `nvm install node --latest-npm`
- [ ] Update Docker Desktop
- [ ] Review and update .env if needed

### As Needed
- [ ] Clear Docker cache: `docker system prune`
- [ ] Clear npm cache: `npm cache clean --force`
- [ ] Rebuild node_modules: `rm -rf node_modules && npm ci`

---

## Completion Certificate 🎉

Once all items in this checklist are complete:

```
✅ I have successfully set up MOBIUS on Windows!

Setup completed on: _______________
Setup method used: [ ] WSL2  [ ] PowerShell
Time taken: _______________
Notes: _________________________________
       _________________________________
       _________________________________
```

**Next Steps:**
1. Read the user guide (when available)
2. Create your first board game tutorial
3. Explore AI features
4. Join the community
5. Consider contributing to the project

**Happy game tutorial creating! 🎲🎬**

---

For support, visit: https://github.com/w9bikze8u4cbupc/MOBIUS/issues
