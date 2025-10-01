#!/bin/bash
# run_mobius_wsl.sh - One-command WSL bootstrap for MOBIUS development
#
# This script sets up a complete MOBIUS development environment in WSL2:
# - Installs Node.js 20.18.1 via nvm
# - Installs ffmpeg and build tools
# - Verifies Docker availability
# - Clones/updates repository
# - Installs dependencies
# - Runs verification tests
# - Builds Docker images
# - Starts staging environment
# - Runs smoke tests
# - Cleans up resources

set -e

# Configuration
NODE_VERSION="20.18.1"
REPO_URL="https://github.com/w9bikze8u4cbupc/MOBIUS.git"
REPO_DIR="$HOME/MOBIUS"
NVM_VERSION="v0.39.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[MOBIUS]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

step() {
    echo ""
    echo -e "${BLUE}=== $1 ===${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install nvm if not present
install_nvm() {
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        log "nvm already installed"
        return 0
    fi
    
    log "Installing nvm..."
    curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh" | bash
    
    # Load nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    success "nvm installed"
}

# Load nvm if available
load_nvm() {
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
}

# Install Node.js
install_node() {
    load_nvm
    
    if command_exists node; then
        current_version=$(node --version)
        if [ "$current_version" = "v$NODE_VERSION" ]; then
            log "Node.js $NODE_VERSION already installed"
            return 0
        else
            warn "Node.js $current_version found, installing $NODE_VERSION..."
        fi
    fi
    
    log "Installing Node.js $NODE_VERSION..."
    nvm install "$NODE_VERSION"
    nvm use "$NODE_VERSION"
    nvm alias default "$NODE_VERSION"
    
    success "Node.js $NODE_VERSION installed"
    node --version
    npm --version
}

# Install system dependencies
install_system_deps() {
    log "Checking system dependencies..."
    
    # Check if ffmpeg is installed
    if command_exists ffmpeg && command_exists ffprobe; then
        log "ffmpeg already installed"
    else
        log "Installing ffmpeg..."
        sudo apt-get update -qq
        sudo apt-get install -y ffmpeg
        success "ffmpeg installed"
    fi
    
    # Check if build tools are installed
    if command_exists gcc && command_exists make; then
        log "Build tools already installed"
    else
        log "Installing build tools..."
        sudo apt-get install -y build-essential
        success "Build tools installed"
    fi
    
    # Verify installations
    ffmpeg -version > /dev/null 2>&1 && success "ffmpeg verified"
    ffprobe -version > /dev/null 2>&1 && success "ffprobe verified"
}

# Verify Docker is available
check_docker() {
    log "Checking Docker availability..."
    
    if ! command_exists docker; then
        error "Docker not found!"
        error "Please install Docker Desktop and enable WSL2 integration"
        error "See: https://docs.docker.com/desktop/windows/wsl/"
        exit 1
    fi
    
    if ! docker ps > /dev/null 2>&1; then
        error "Cannot connect to Docker daemon"
        error "Please ensure Docker Desktop is running"
        error "And WSL2 integration is enabled in Docker Desktop settings"
        exit 1
    fi
    
    success "Docker is available"
    docker --version
    docker compose version
}

# Clone or update repository
setup_repository() {
    if [ -d "$REPO_DIR/.git" ]; then
        log "Repository already exists, updating..."
        cd "$REPO_DIR"
        git fetch origin
        git checkout main
        git pull origin main
        success "Repository updated"
    else
        log "Cloning repository..."
        git clone "$REPO_URL" "$REPO_DIR"
        cd "$REPO_DIR"
        success "Repository cloned"
    fi
}

# Install npm dependencies
install_dependencies() {
    log "Installing dependencies..."
    cd "$REPO_DIR"
    npm ci
    success "Dependencies installed"
}

# Run verification tests
run_verification() {
    log "Running verification tests..."
    cd "$REPO_DIR"
    
    # Check if verify-clean-genesis script exists
    if npm run | grep -q "verify-clean-genesis"; then
        npm run verify-clean-genesis -- --verbose
        success "Verification tests passed"
    else
        warn "verify-clean-genesis script not found, skipping"
    fi
}

# Build Docker image
build_docker_image() {
    log "Building Docker CI image..."
    cd "$REPO_DIR"
    
    if [ -f "Dockerfile.ci" ]; then
        docker build -f Dockerfile.ci -t mobius-api-ci:local .
        success "Docker image built"
    else
        warn "Dockerfile.ci not found, skipping Docker build"
    fi
}

# Start staging environment
start_staging() {
    log "Starting staging environment..."
    cd "$REPO_DIR"
    
    if [ -f "docker-compose.staging.yml" ]; then
        docker compose -f docker-compose.staging.yml up -d --build
        success "Staging environment started"
        
        # Wait for services to be ready
        log "Waiting for services to be ready..."
        sleep 10
    else
        warn "docker-compose.staging.yml not found, skipping"
        return 1
    fi
}

# Run smoke tests
run_smoke_tests() {
    log "Running smoke tests..."
    cd "$REPO_DIR"
    
    if [ -f "scripts/ci/smoke-tests.sh" ]; then
        chmod +x scripts/ci/smoke-tests.sh
        ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
        success "Smoke tests passed"
    else
        warn "Smoke tests script not found, skipping"
    fi
}

# Cleanup
cleanup() {
    log "Cleaning up..."
    cd "$REPO_DIR"
    
    if [ -f "docker-compose.staging.yml" ]; then
        docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
        success "Staging environment stopped"
    fi
}

# Main execution
main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║         MOBIUS WSL2 Development Bootstrap                ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    
    step "Step 1: Installing nvm"
    install_nvm
    
    step "Step 2: Installing Node.js $NODE_VERSION"
    install_node
    
    step "Step 3: Installing system dependencies"
    install_system_deps
    
    step "Step 4: Verifying Docker"
    check_docker
    
    step "Step 5: Setting up repository"
    setup_repository
    
    step "Step 6: Installing npm dependencies"
    install_dependencies
    
    step "Step 7: Running verification tests"
    run_verification || warn "Verification tests skipped or failed"
    
    step "Step 8: Building Docker image"
    build_docker_image || warn "Docker build skipped"
    
    step "Step 9: Starting staging environment"
    if start_staging; then
        step "Step 10: Running smoke tests"
        run_smoke_tests || warn "Smoke tests failed"
        
        step "Step 11: Cleanup"
        cleanup
    else
        warn "Staging environment setup skipped"
    fi
    
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║              Bootstrap Complete!                          ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    success "MOBIUS development environment is ready!"
    echo ""
    log "Repository location: $REPO_DIR"
    log "Node.js version: $(node --version)"
    log "npm version: $(npm --version)"
    echo ""
    log "Next steps:"
    echo "  cd $REPO_DIR"
    echo "  npm test"
    echo ""
    log "For more information, see:"
    echo "  - docs/WINDOWS_SETUP.md"
    echo "  - CONTRIBUTING.md"
    echo ""
}

# Run main function
main
