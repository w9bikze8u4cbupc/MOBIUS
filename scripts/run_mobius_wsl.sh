#!/usr/bin/env bash
#
# run_mobius_wsl.sh — One-command WSL2 bootstrap for MOBIUS
#
# This script:
# 1. Installs Node.js 20.18.1 via nvm (if not present)
# 2. Installs ffmpeg (if not present)
# 3. Validates Docker is accessible
# 4. Clones/updates MOBIUS repository
# 5. Installs dependencies with npm ci
# 6. Runs verify-clean-genesis
# 7. Builds Docker CI image
# 8. Starts staging environment
# 9. Runs smoke tests
# 10. Cleans up containers
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_wsl.sh -o ~/run_mobius_wsl.sh
#   chmod +x ~/run_mobius_wsl.sh
#   ~/run_mobius_wsl.sh
#
# Or from repo:
#   chmod +x scripts/run_mobius_wsl.sh
#   ./scripts/run_mobius_wsl.sh

set -euo pipefail

# Configuration
REPO_URL="https://github.com/w9bikze8u4cbupc/MOBIUS.git"
REPO_DIR="$HOME/MOBIUS"
NODE_VERSION="20.18.1"
NVM_VERSION="v0.39.0"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

# Check if running in WSL
check_wsl() {
    if grep -qEi "(Microsoft|WSL)" /proc/version &> /dev/null ; then
        log_info "Running in WSL environment"
        return 0
    else
        log_warn "Not detected as WSL, continuing anyway..."
        return 0
    fi
}

# Install or verify nvm and Node.js
setup_node() {
    log_info "Setting up Node.js ${NODE_VERSION}..."
    
    # Check if nvm is installed
    export NVM_DIR="$HOME/.nvm"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        log_info "nvm already installed"
        # shellcheck disable=SC1091
        source "$NVM_DIR/nvm.sh"
    else
        log_info "Installing nvm..."
        curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
        # shellcheck disable=SC1091
        source "$NVM_DIR/nvm.sh"
        log_success "nvm installed"
    fi
    
    # Install Node.js if not present
    if ! nvm ls "${NODE_VERSION}" &> /dev/null; then
        log_info "Installing Node.js ${NODE_VERSION}..."
        nvm install "${NODE_VERSION}"
        nvm alias default "${NODE_VERSION}"
        log_success "Node.js ${NODE_VERSION} installed"
    else
        log_info "Node.js ${NODE_VERSION} already installed"
    fi
    
    nvm use "${NODE_VERSION}"
    
    # Verify
    node --version
    npm --version
}

# Install ffmpeg
setup_ffmpeg() {
    log_info "Checking ffmpeg..."
    
    if command -v ffmpeg &> /dev/null; then
        log_info "ffmpeg already installed: $(ffmpeg -version | head -n1)"
        return 0
    fi
    
    log_info "Installing ffmpeg..."
    sudo apt-get update -qq
    sudo apt-get install -y ffmpeg
    log_success "ffmpeg installed: $(ffmpeg -version | head -n1)"
}

# Validate Docker is accessible
check_docker() {
    log_info "Checking Docker..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker not found. Please install Docker Desktop with WSL2 integration."
        log_error "See: https://docs.docker.com/desktop/windows/wsl/"
        exit 1
    fi
    
    if ! docker ps &> /dev/null; then
        log_error "Cannot connect to Docker daemon."
        log_error "Ensure Docker Desktop is running and WSL integration is enabled."
        log_error "Docker Desktop → Settings → Resources → WSL Integration"
        exit 1
    fi
    
    log_success "Docker is accessible: $(docker --version)"
    log_info "Docker Compose: $(docker compose version)"
}

# Clone or update repository
setup_repo() {
    log_info "Setting up repository..."
    
    if [ -d "$REPO_DIR/.git" ]; then
        log_info "Repository exists, updating..."
        cd "$REPO_DIR"
        git fetch origin
        git pull origin main || log_warn "Could not pull latest changes (local modifications?)"
    else
        log_info "Cloning repository..."
        git clone "$REPO_URL" "$REPO_DIR"
        cd "$REPO_DIR"
        log_success "Repository cloned"
    fi
}

# Install dependencies
install_deps() {
    log_info "Installing dependencies..."
    cd "$REPO_DIR"
    
    # Ensure we're using the right Node version
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
    nvm use "${NODE_VERSION}" &> /dev/null || true
    
    npm ci
    log_success "Dependencies installed"
}

# Run verification
run_verification() {
    log_info "Running repository verification..."
    cd "$REPO_DIR"
    
    npm run verify-clean-genesis -- --verbose
    log_success "Repository verification passed"
}

# Build Docker image
build_docker() {
    log_info "Building Docker CI image..."
    cd "$REPO_DIR"
    
    docker build -f Dockerfile.ci -t mobius-api-ci:local .
    log_success "Docker image built"
}

# Start staging environment
start_staging() {
    log_info "Starting staging environment..."
    cd "$REPO_DIR"
    
    docker compose -f docker-compose.staging.yml up -d --build
    log_success "Staging environment started"
    
    # Wait for services to be ready
    log_info "Waiting for services to be healthy..."
    sleep 5
}

# Run smoke tests
run_smoke_tests() {
    log_info "Running smoke tests..."
    cd "$REPO_DIR"
    
    # Make script executable
    chmod +x scripts/ci/smoke-tests.sh
    
    if ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2; then
        log_success "Smoke tests passed"
        return 0
    else
        log_error "Smoke tests failed"
        
        # Collect artifacts
        log_info "Collecting failure artifacts..."
        docker compose -f docker-compose.staging.yml logs --no-color > compose-logs.log || true
        
        log_error "Artifacts saved:"
        log_error "  - smoke-tests.log"
        log_error "  - compose-logs.log"
        log_error "  - verification-reports/"
        
        return 1
    fi
}

# Cleanup
cleanup() {
    log_info "Cleaning up..."
    cd "$REPO_DIR"
    
    docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
    log_success "Cleanup complete"
}

# Main execution
main() {
    echo "========================================"
    echo "  MOBIUS WSL2 Bootstrap Script"
    echo "========================================"
    echo
    
    check_wsl
    setup_node
    setup_ffmpeg
    check_docker
    setup_repo
    install_deps
    run_verification
    build_docker
    start_staging
    
    # Run tests and capture result
    if run_smoke_tests; then
        cleanup
        echo
        echo "========================================"
        log_success "MOBIUS setup complete!"
        echo "========================================"
        echo
        log_info "Repository: $REPO_DIR"
        log_info "To start development:"
        echo "  cd $REPO_DIR"
        echo "  code ."
        echo
        log_info "To run tests:"
        echo "  npm test"
        echo "  npm run verify-clean-genesis"
        echo
        log_info "To start staging:"
        echo "  docker compose -f docker-compose.staging.yml up -d"
        echo "  ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2"
        echo
        return 0
    else
        log_error "Setup completed with errors (smoke tests failed)"
        log_error "Review logs and artifacts listed above"
        cleanup
        return 1
    fi
}

# Run main and handle errors
if main; then
    exit 0
else
    log_error "Bootstrap failed. See errors above."
    exit 1
fi
