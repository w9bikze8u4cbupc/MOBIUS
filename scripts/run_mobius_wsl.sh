#!/usr/bin/env bash
# MOBIUS One-Command WSL Bootstrap Script
# This script sets up the complete MOBIUS development environment on WSL2

set -e  # Exit on error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}MOBIUS WSL2 Bootstrap Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Step 1: Check and install NVM
print_info "Step 1: Checking Node Version Manager (NVM)..."
if [ ! -d "$HOME/.nvm" ]; then
    print_info "Installing NVM..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    print_success "NVM installed successfully"
else
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    print_success "NVM already installed"
fi

# Step 2: Install Node.js 20.18.1
print_info "Step 2: Installing Node.js 20.18.1..."
nvm install 20.18.1
nvm use 20.18.1
nvm alias default 20.18.1
NODE_VERSION=$(node --version)
print_success "Node.js $NODE_VERSION is now active"

# Step 3: Check and install ffmpeg
print_info "Step 3: Checking ffmpeg..."
if ! command_exists ffmpeg; then
    print_info "Installing ffmpeg..."
    sudo apt-get update
    sudo apt-get install -y ffmpeg
    print_success "ffmpeg installed successfully"
else
    FFMPEG_VERSION=$(ffmpeg -version | head -n1)
    print_success "ffmpeg already installed: $FFMPEG_VERSION"
fi

# Step 4: Check Docker
print_info "Step 4: Checking Docker..."
if ! command_exists docker; then
    print_error "Docker is not available. Please install Docker Desktop and enable WSL integration."
    print_info "Visit: https://docs.docker.com/desktop/windows/wsl/"
    exit 1
else
    if docker ps >/dev/null 2>&1; then
        DOCKER_VERSION=$(docker --version)
        print_success "Docker is running: $DOCKER_VERSION"
    else
        print_error "Docker daemon is not accessible. Please start Docker Desktop."
        exit 1
    fi
fi

# Step 5: Clone or update repository
print_info "Step 5: Setting up repository..."
REPO_URL="https://github.com/w9bikze8u4cbupc/MOBIUS.git"
REPO_DIR="$HOME/MOBIUS"

if [ -d "$REPO_DIR" ]; then
    print_info "Repository already exists. Updating..."
    cd "$REPO_DIR"
    git fetch origin
    git pull origin main || print_warning "Could not pull latest changes. Continuing with current version..."
    print_success "Repository updated"
else
    print_info "Cloning repository..."
    git clone "$REPO_URL" "$REPO_DIR"
    cd "$REPO_DIR"
    print_success "Repository cloned successfully"
fi

cd "$REPO_DIR"

# Step 6: Install dependencies
print_info "Step 6: Installing Node.js dependencies..."
if [ -f "package-lock.json" ]; then
    npm ci || {
        print_warning "npm ci failed, trying npm install..."
        npm install
    }
else
    npm install
fi
print_success "Dependencies installed"

# Step 7: Run verification
print_info "Step 7: Running verification..."
if npm run verify-clean-genesis; then
    print_success "Verification passed"
else
    print_warning "Verification had issues but continuing..."
fi

# Step 8: Build Docker image
print_info "Step 8: Building Docker CI image..."
if [ -f "Dockerfile.ci" ]; then
    docker build -f Dockerfile.ci -t mobius-api-ci:local .
    print_success "Docker image built successfully"
else
    print_warning "Dockerfile.ci not found, skipping Docker build"
fi

# Step 9: Start staging environment
print_info "Step 9: Starting staging environment..."
if [ -f "docker-compose.staging.yml" ]; then
    docker compose -f docker-compose.staging.yml up -d --build
    print_success "Staging environment started"
    
    # Wait for services to be ready
    print_info "Waiting for services to be ready..."
    sleep 10
else
    print_warning "docker-compose.staging.yml not found, skipping staging environment"
fi

# Step 10: Run smoke tests
print_info "Step 10: Running smoke tests..."
if [ -f "scripts/ci/smoke-tests.sh" ]; then
    chmod +x scripts/ci/smoke-tests.sh
    if ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2; then
        print_success "Smoke tests passed"
    else
        print_error "Smoke tests failed"
        
        # Collect logs on failure
        print_info "Collecting logs..."
        docker compose -f docker-compose.staging.yml logs --no-color > compose-logs.log 2>&1 || true
        print_info "Logs saved to compose-logs.log"
        
        # Don't exit on smoke test failure, continue to cleanup
    fi
else
    print_warning "Smoke tests script not found, skipping"
fi

# Step 11: Cleanup
print_info "Step 11: Cleaning up..."
if [ -f "docker-compose.staging.yml" ]; then
    docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
    print_success "Staging environment stopped"
fi

# Summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Bootstrap Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
print_info "Repository location: $REPO_DIR"
print_info "Node.js version: $(node --version)"
print_info "npm version: $(npm --version)"
print_info "ffmpeg version: $(ffmpeg -version | head -n1 | cut -d' ' -f3)"
echo ""
print_info "Next steps:"
echo "  1. cd $REPO_DIR"
echo "  2. Review docs/WINDOWS_SETUP.md"
echo "  3. Run 'npm test' to verify setup"
echo "  4. Start developing!"
echo ""
print_success "Happy coding! 🚀"
