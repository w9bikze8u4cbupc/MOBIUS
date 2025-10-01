#!/bin/bash
set -e

# MOBIUS Windows WSL2 One-Command Bootstrap
# This script installs all dependencies, sets up the environment, and runs verification

echo "========================================"
echo "MOBIUS WSL2 Bootstrap Script"
echo "========================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
  echo -e "${GREEN}✓${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

print_info() {
  echo -e "${YELLOW}ℹ${NC} $1"
}

# Check if running in WSL
if ! grep -qi microsoft /proc/version 2>/dev/null; then
  print_info "Not running in WSL, but continuing anyway (might be native Linux)"
fi

# Step 1: Install nvm and Node.js 20.18.1
echo ""
echo "Step 1: Installing Node.js 20.18.1 via nvm"
echo "-------------------------------------------"

if [ ! -d "$HOME/.nvm" ]; then
  print_info "Installing nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
  
  # Load nvm
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  
  print_status "nvm installed"
else
  print_status "nvm already installed"
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

# Install Node.js 20.18.1
if ! nvm ls 20.18.1 >/dev/null 2>&1; then
  print_info "Installing Node.js 20.18.1..."
  nvm install 20.18.1
  print_status "Node.js 20.18.1 installed"
else
  print_status "Node.js 20.18.1 already installed"
fi

nvm use 20.18.1
nvm alias default 20.18.1

node_version=$(node --version)
print_status "Using Node.js $node_version"

# Step 2: Install ffmpeg
echo ""
echo "Step 2: Installing ffmpeg"
echo "-------------------------"

if ! command -v ffmpeg &> /dev/null; then
  print_info "Installing ffmpeg..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq ffmpeg
  print_status "ffmpeg installed"
else
  print_status "ffmpeg already installed"
fi

ffmpeg_version=$(ffmpeg -version 2>&1 | head -n1)
print_status "$ffmpeg_version"

# Step 3: Validate Docker
echo ""
echo "Step 3: Validating Docker"
echo "-------------------------"

if ! command -v docker &> /dev/null; then
  print_error "Docker not found. Please install Docker Desktop and enable WSL2 integration."
  echo "See: https://docs.docker.com/desktop/windows/wsl/"
  exit 1
fi

if ! docker ps &> /dev/null; then
  print_error "Cannot connect to Docker daemon. Is Docker Desktop running?"
  echo "Start Docker Desktop and ensure WSL2 integration is enabled."
  exit 1
fi

docker_version=$(docker --version)
compose_version=$(docker compose version)
print_status "$docker_version"
print_status "$compose_version"

# Step 4: Clone or update repository
echo ""
echo "Step 4: Setting up repository"
echo "-----------------------------"

REPO_DIR="$HOME/MOBIUS"

if [ -d "$REPO_DIR" ]; then
  print_info "Repository already exists, updating..."
  cd "$REPO_DIR"
  
  # Save current branch
  current_branch=$(git branch --show-current)
  
  # Stash any changes
  if ! git diff-index --quiet HEAD --; then
    print_info "Stashing local changes..."
    git stash
  fi
  
  # Fetch and pull
  git fetch origin
  git pull origin "$current_branch" || print_info "Pull failed or not needed"
  
  print_status "Repository updated"
else
  print_info "Cloning repository..."
  cd "$HOME"
  git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
  cd "$REPO_DIR"
  print_status "Repository cloned"
fi

# Step 5: Install npm dependencies
echo ""
echo "Step 5: Installing npm dependencies"
echo "------------------------------------"

print_info "Running npm ci..."
npm ci --loglevel=error
print_status "Dependencies installed"

# Step 6: Run repository verification
echo ""
echo "Step 6: Repository integrity verification"
echo "------------------------------------------"

# Make scripts executable
chmod +x scripts/*.sh scripts/ci/*.sh 2>/dev/null || true

if [ -f "scripts/verify-clean-genesis.js" ]; then
  print_info "Running repository verification..."
  if npm run verify-clean-genesis -- --verbose; then
    print_status "Repository verification passed"
  else
    print_error "Repository verification failed"
    echo "Check verification-reports/ directory for details"
  fi
else
  print_info "Verification script not found, skipping"
fi

# Step 7: Build Docker image
echo ""
echo "Step 7: Building Docker CI image"
echo "---------------------------------"

if [ -f "Dockerfile.ci" ]; then
  print_info "Building mobius-api-ci:local..."
  docker build -f Dockerfile.ci -t mobius-api-ci:local . -q
  print_status "Docker image built"
else
  print_info "Dockerfile.ci not found, skipping Docker build"
fi

# Step 8: Start docker-compose stack
echo ""
echo "Step 8: Starting application stack"
echo "-----------------------------------"

if [ -f "docker-compose.staging.yml" ]; then
  print_info "Starting services with docker-compose..."
  docker compose -f docker-compose.staging.yml up -d --build
  
  print_info "Waiting for services to be ready (30 seconds)..."
  sleep 30
  
  # Check if services are running
  if docker compose -f docker-compose.staging.yml ps | grep -q "Up"; then
    print_status "Services started"
  else
    print_error "Services failed to start"
    docker compose -f docker-compose.staging.yml logs
    exit 1
  fi
else
  print_info "docker-compose.staging.yml not found, skipping"
fi

# Step 9: Run smoke tests
echo ""
echo "Step 9: Running smoke tests"
echo "---------------------------"

if [ -f "scripts/ci/smoke-tests.sh" ]; then
  chmod +x scripts/ci/smoke-tests.sh
  
  print_info "Running smoke tests..."
  
  # Run smoke tests and capture output
  if ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2 > smoke-tests.log 2>&1; then
    print_status "Smoke tests passed"
    cat smoke-tests.log
  else
    print_error "Smoke tests failed"
    echo ""
    echo "Smoke test logs:"
    cat smoke-tests.log
    
    echo ""
    print_info "Collecting container logs..."
    docker compose -f docker-compose.staging.yml logs --no-color > compose-logs.log 2>&1 || true
    
    echo ""
    print_error "Tests failed. Artifacts saved:"
    echo "  - smoke-tests.log"
    echo "  - compose-logs.log"
    
    if [ -d "verification-reports" ]; then
      echo "  - verification-reports/*.json"
    fi
    
    # Don't exit here, continue to cleanup
  fi
else
  print_info "Smoke test script not found, skipping"
fi

# Step 10: Cleanup
echo ""
echo "Step 10: Cleanup"
echo "----------------"

if [ -f "docker-compose.staging.yml" ]; then
  print_info "Stopping services..."
  docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
  print_status "Services stopped"
fi

# Final summary
echo ""
echo "========================================"
echo "Bootstrap Complete!"
echo "========================================"
echo ""
print_status "Node.js 20.18.1 installed"
print_status "ffmpeg installed"
print_status "Docker validated"
print_status "Repository ready at: $REPO_DIR"
echo ""
echo "Next steps:"
echo "  cd $REPO_DIR"
echo "  npm test"
echo "  docker compose -f docker-compose.staging.yml up -d"
echo ""
echo "See docs/WINDOWS_SETUP.md for more information"
echo ""
