# Quick Start Guide - MOBIUS

Get up and running with MOBIUS in minutes!

## For Windows Users (Recommended: WSL2)

### 1. Install WSL2 and Ubuntu
```powershell
# In PowerShell (Administrator)
wsl --install
# Restart your computer
```

### 2. Install Docker Desktop
- Download from: https://www.docker.com/products/docker-desktop/
- Enable WSL2 integration in Settings

### 3. Setup in WSL (Ubuntu)
```bash
# Install Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.6/install.sh | bash
source ~/.bashrc
nvm install 20.18.1
nvm use 20.18.1

# Install FFmpeg
sudo apt-get update && sudo apt-get install -y ffmpeg

# Clone and setup project
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS

# Install dependencies
npm ci
cd client && npm ci && cd ..

# Create .env file
cp .env.example .env
# Edit .env with your API keys (nano .env or vim .env)

# Verify setup
npm run verify-clean-genesis
```

### 4. Run the Application
```bash
# Terminal 1: Start backend
npm start

# Terminal 2: Start frontend
cd client && npm start
```

Visit http://localhost:3000 in your browser!

## For macOS Users

```bash
# Install Node.js
brew install nvm
nvm install 20.18.1
nvm use 20.18.1

# Install FFmpeg
brew install ffmpeg

# Clone and setup
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS
npm ci
cd client && npm ci && cd ..

# Configure
cp .env.example .env
# Edit .env with your API keys

# Verify
npm run verify-clean-genesis

# Run
npm start  # Terminal 1
cd client && npm start  # Terminal 2
```

## For Linux Users

```bash
# Install Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.6/install.sh | bash
source ~/.bashrc
nvm install 20.18.1
nvm use 20.18.1

# Install FFmpeg
sudo apt-get update && sudo apt-get install -y ffmpeg

# Clone and setup
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS
npm ci
cd client && npm ci && cd ..

# Configure
cp .env.example .env
# Edit .env with your API keys

# Verify
npm run verify-clean-genesis

# Run
npm start  # Terminal 1
cd client && npm start  # Terminal 2
```

## Docker Setup (Optional)

```bash
# Build and run with Docker Compose
docker build -f Dockerfile.ci -t mobius-api-ci:local .
docker compose -f docker-compose.staging.yml up -d

# Check logs
docker compose -f docker-compose.staging.yml logs -f

# Run smoke tests
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# Stop
docker compose -f docker-compose.staging.yml down --volumes
```

## Need Help?

- **Detailed Windows Setup**: See [WINDOWS_SETUP.md](./WINDOWS_SETUP.md)
- **Full Documentation**: See [README.md](./README.md)
- **Issues**: https://github.com/w9bikze8u4cbupc/MOBIUS/issues

## Essential Commands

```bash
# Verify environment
npm run verify-clean-genesis

# Start backend API
npm start

# Start frontend
cd client && npm start

# Run tests
npm test

# Check golden video tests
npm run golden:check

# Update golden references
npm run golden:approve
```

## Required Environment Variables

Your `.env` file needs at minimum:

```env
OPENAI_API_KEY=your_key_here
PORT=5001
OUTPUT_DIR=./src/api/uploads/MobiusGames
```

Get your OpenAI API key from: https://platform.openai.com/api-keys

## Troubleshooting

### "Cannot find module" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### Port already in use
```bash
# Kill process on port 5001
lsof -i :5001
kill -9 <PID>
```

### FFmpeg not found
```bash
# WSL/Linux
sudo apt-get install -y ffmpeg

# macOS
brew install ffmpeg

# Windows
# Download from https://ffmpeg.org/
```

---

**Happy coding! 🎲🎬**
