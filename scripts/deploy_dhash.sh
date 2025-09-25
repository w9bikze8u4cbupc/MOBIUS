#!/bin/bash

# Deploy Script for MOBIUS dhash service
# Supports production and staging environments with dry-run capability

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default values
ENVIRONMENT="staging"
DRY_RUN=false
FORCE=false
SKIP_HEALTH_CHECK=false
DEPLOY_TIMEOUT=300

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy the MOBIUS dhash service to specified environment.

OPTIONS:
    --env ENV           Target environment: staging|production (default: staging)
    --dry-run          Show deployment plan without executing
    --force            Skip confirmation prompts
    --skip-health      Skip health check verification
    --timeout SECONDS  Health check timeout (default: 300)
    -h, --help         Show this help message

EXAMPLES:
    $0 --env staging --dry-run
    $0 --env production --force
    $0 --dry-run

ENVIRONMENT VARIABLES:
    DEPLOY_KEY         SSH key for deployment server
    DEPLOY_HOST        Deployment server hostname
    DEPLOY_USER        Deployment server username

EOF
}

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --skip-health)
            SKIP_HEALTH_CHECK=true
            shift
            ;;
        --timeout)
            DEPLOY_TIMEOUT="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
    exit 1
fi

# Set environment-specific configuration
case $ENVIRONMENT in
    "staging")
        DEPLOY_HOST="${STAGING_DEPLOY_HOST:-localhost}"
        DEPLOY_USER="${STAGING_DEPLOY_USER:-mobius}"
        DEPLOY_PATH="${STAGING_DEPLOY_PATH:-/opt/mobius/staging}"
        PORT="${STAGING_PORT:-5001}"
        NODE_ENV="staging"
        ;;
    "production")
        DEPLOY_HOST="${PRODUCTION_DEPLOY_HOST:-localhost}"
        DEPLOY_USER="${PRODUCTION_DEPLOY_USER:-mobius}"
        DEPLOY_PATH="${PRODUCTION_DEPLOY_PATH:-/opt/mobius/production}"
        PORT="${PRODUCTION_PORT:-5000}"
        NODE_ENV="production"
        ;;
esac

log "Deployment Configuration:"
log "  Environment: $ENVIRONMENT"
log "  Target Host: $DEPLOY_HOST"
log "  Deploy Path: $DEPLOY_PATH"
log "  Port: $PORT"
log "  Node Env: $NODE_ENV"
log "  Dry Run: $DRY_RUN"

# Pre-deployment checks
pre_deployment_checks() {
    log "Running pre-deployment checks..."
    
    # Check if required files exist
    if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
        error "package.json not found in project root"
        exit 1
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node --version)
    log "Node.js version: $NODE_VERSION"
    
    # Check npm dependencies
    if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
        warn "node_modules not found. Installing dependencies..."
        cd "$PROJECT_ROOT"
        npm ci
    fi
    
    # Run linting
    log "Running ESLint..."
    cd "$PROJECT_ROOT"
    npm run lint || {
        error "ESLint failed. Please fix linting errors before deploying."
        exit 1
    }
    
    # Run tests if they exist
    if npm run test --if-present >/dev/null 2>&1; then
        log "Running tests..."
        npm test || {
            error "Tests failed. Please fix failing tests before deploying."
            exit 1
        }
    else
        warn "No tests found to run"
    fi
    
    success "Pre-deployment checks passed"
}

# Create deployment package
create_deployment_package() {
    log "Creating deployment package..."
    
    local temp_dir=$(mktemp -d)
    local package_file="$temp_dir/mobius-deployment-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    cd "$PROJECT_ROOT"
    
    # Create exclusion list
    local exclude_file=$(mktemp)
    cat > "$exclude_file" << EOF
.git
node_modules
logs
backups
out
tmp
dist
build
coverage
.nyc_output
*.log
*.tmp
.DS_Store
.env
.env.local
*.swp
*.swo
*~
EOF
    
    # Create tar package
    tar --exclude-from="$exclude_file" -czf "$package_file" .
    
    rm -f "$exclude_file"
    
    log "Deployment package created: $package_file"
    echo "$package_file"
}

# Deploy to environment
deploy_to_environment() {
    local package_file="$1"
    
    if [[ "$DRY_RUN" == true ]]; then
        log "DRY RUN - Would deploy to $ENVIRONMENT:"
        log "  Package: $package_file"
        log "  Target: $DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH"
        log "  Port: $PORT"
        return 0
    fi
    
    log "Deploying to $ENVIRONMENT environment..."
    
    # For local deployment (demo purposes)
    if [[ "$DEPLOY_HOST" == "localhost" ]]; then
        local deploy_dir="/tmp/mobius-deploy-$ENVIRONMENT"
        mkdir -p "$deploy_dir"
        
        log "Extracting package to $deploy_dir..."
        tar -xzf "$package_file" -C "$deploy_dir"
        
        log "Installing dependencies..."
        cd "$deploy_dir"
        npm ci --production
        
        # Create environment-specific config
        cat > "$deploy_dir/.env" << EOF
NODE_ENV=$NODE_ENV
PORT=$PORT
LOG_LEVEL=info
EOF
        
        log "Starting health check..."
        if [[ "$SKIP_HEALTH_CHECK" == false ]]; then
            # Start the service in background for health check
            NODE_ENV="$NODE_ENV" PORT="$PORT" npm start &
            local service_pid=$!
            
            sleep 5
            
            # Health check
            local health_url="http://localhost:$PORT/health"
            local attempts=0
            local max_attempts=$((DEPLOY_TIMEOUT / 10))
            
            while [[ $attempts -lt $max_attempts ]]; do
                if curl -s -f "$health_url" >/dev/null 2>&1; then
                    success "Health check passed"
                    kill $service_pid 2>/dev/null || true
                    break
                else
                    log "Health check attempt $((attempts + 1))/$max_attempts..."
                    sleep 10
                    attempts=$((attempts + 1))
                fi
            done
            
            if [[ $attempts -eq $max_attempts ]]; then
                kill $service_pid 2>/dev/null || true
                error "Health check failed after $max_attempts attempts"
                exit 1
            fi
        fi
        
        success "Deployment to $ENVIRONMENT completed successfully"
        log "Service deployed to: $deploy_dir"
        
    else
        # Remote deployment (production scenario)
        log "Deploying to remote host $DEPLOY_HOST..."
        
        # Upload package
        scp "$package_file" "$DEPLOY_USER@$DEPLOY_HOST:/tmp/"
        
        # Remote deployment commands
        ssh "$DEPLOY_USER@$DEPLOY_HOST" << EOF
set -e
sudo mkdir -p $DEPLOY_PATH
cd $DEPLOY_PATH
sudo tar -xzf /tmp/$(basename "$package_file")
sudo npm ci --production
sudo systemctl restart mobius-$ENVIRONMENT
sleep 10
curl -f http://localhost:$PORT/health || exit 1
EOF
        
        success "Remote deployment completed"
    fi
}

# Main deployment process
main() {
    log "Starting deployment process for $ENVIRONMENT environment..."
    
    # Confirmation prompt for production
    if [[ "$ENVIRONMENT" == "production" && "$FORCE" == false && "$DRY_RUN" == false ]]; then
        echo -n "Are you sure you want to deploy to PRODUCTION? (yes/no): "
        read -r confirm
        if [[ "$confirm" != "yes" ]]; then
            log "Deployment cancelled by user"
            exit 0
        fi
    fi
    
    # Pre-deployment checks
    pre_deployment_checks
    
    # Create deployment package
    local package_file=$(create_deployment_package)
    
    # Deploy
    deploy_to_environment "$package_file"
    
    # Cleanup
    rm -f "$package_file"
    
    success "Deployment process completed successfully!"
    
    # Post-deployment information
    cat << EOF

Deployment Summary:
  Environment: $ENVIRONMENT
  Host: $DEPLOY_HOST
  Port: $PORT
  Health Check: http://localhost:$PORT/health
  Metrics: http://localhost:$PORT/metrics/dhash

Next Steps:
  1. Monitor logs for any errors
  2. Run smoke tests: node scripts/smoke-tests.js --quick
  3. Check metrics endpoint for performance
  4. Monitor for 30-60 minutes as per deployment plan

EOF
}

# Run main function
main