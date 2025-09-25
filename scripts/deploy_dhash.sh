#!/bin/bash
# Deploy script for MOBIUS dhash with dry-run support
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
DRY_RUN=false
ENVIRONMENT="production"
VERBOSE=false
SKIP_BACKUP=false
BACKUP_BEFORE_DEPLOY=true

usage() {
    echo "Usage: $0 [options]"
    echo "Options:"
    echo "  --dry-run           Show what would be done without executing"
    echo "  --env ENV           Target environment (staging|production) [default: production]"
    echo "  --skip-backup       Skip creating backup before deploy"
    echo "  --verbose           Enable verbose output"
    echo "  --help              Show this help message"
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

dry_run_log() {
    if [[ "$DRY_RUN" == true ]]; then
        echo "[DRY-RUN] $*" >&2
    fi
}

execute() {
    local cmd="$*"
    if [[ "$DRY_RUN" == true ]]; then
        dry_run_log "Would execute: $cmd"
        return 0
    else
        log "Executing: $cmd"
        eval "$cmd"
    fi
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo "Error: Environment must be 'staging' or 'production'" >&2
    exit 1
fi

log "Starting MOBIUS dhash deployment"
log "Environment: $ENVIRONMENT"
log "Dry run: $DRY_RUN"

if [[ "$DRY_RUN" == true ]]; then
    dry_run_log "This is a DRY RUN - no actual changes will be made"
fi

# Pre-deployment checks
log "Running pre-deployment checks..."

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: Not in a git repository" >&2
    exit 1
fi

# Check for uncommitted changes
if ! git diff --quiet HEAD; then
    echo "Warning: Uncommitted changes detected" >&2
    if [[ "$DRY_RUN" == false ]]; then
        echo "Error: Commit your changes before deploying" >&2
        exit 1
    fi
fi

# Verify Node.js and npm versions
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
log "Node.js version: $NODE_VERSION"
log "npm version: $NPM_VERSION"

# Create backup before deployment (unless skipped)
if [[ "$SKIP_BACKUP" == false ]]; then
    BACKUP_FILE="${PROJECT_ROOT}/backups/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ).zip"
    log "Creating pre-deployment backup: $BACKUP_FILE"
    
    if [[ "$DRY_RUN" == true ]]; then
        dry_run_log "Would create backup: $BACKUP_FILE"
    else
        mkdir -p "$(dirname "$BACKUP_FILE")"
        "$SCRIPT_DIR/backup_library.sh" --out "$BACKUP_FILE" --verbose
        log "Backup created successfully"
    fi
fi

# Install/update dependencies
log "Installing dependencies..."
execute "cd '$PROJECT_ROOT' && npm ci --production=false"

# Run tests
log "Running tests..."
execute "cd '$PROJECT_ROOT' && npm test"

# Build application (if build script exists)
if grep -q '"build"' "$PROJECT_ROOT/package.json"; then
    log "Building application..."
    execute "cd '$PROJECT_ROOT' && npm run build"
fi

# Lint code (if lint script exists)
if grep -q '"lint"' "$PROJECT_ROOT/package.json"; then
    log "Running code linting..."
    execute "cd '$PROJECT_ROOT' && npm run lint"
fi

# Environment-specific deployment steps
case "$ENVIRONMENT" in
    staging)
        log "Deploying to staging environment..."
        execute "export NODE_ENV=staging"
        # Add staging-specific deployment steps here
        ;;
    production)
        log "Deploying to production environment..."
        execute "export NODE_ENV=production"
        # Add production-specific deployment steps here
        ;;
esac

# Restart services (dry-run safe)
log "Restarting services..."
if [[ "$DRY_RUN" == true ]]; then
    dry_run_log "Would restart MOBIUS services"
    dry_run_log "Would restart nginx (if applicable)"
    dry_run_log "Would restart PM2 processes (if applicable)"
else
    # Add actual service restart commands here
    log "Services restart would be implemented here"
fi

# Health checks
log "Performing health checks..."
HEALTH_CHECK_URL="http://localhost:5001/health"

if [[ "$DRY_RUN" == true ]]; then
    dry_run_log "Would check health endpoint: $HEALTH_CHECK_URL"
    dry_run_log "Would verify dhash metrics endpoint: http://localhost:5001/metrics/dhash"
else
    # Wait a moment for services to start
    sleep 5
    
    # Check health endpoint
    if command -v curl >/dev/null; then
        log "Checking health endpoint..."
        HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_CHECK_URL" || echo "000")
        if [[ "$HEALTH_RESPONSE" == "200" ]]; then
            log "✅ Health check passed"
        else
            log "❌ Health check failed (HTTP $HEALTH_RESPONSE)"
            exit 1
        fi
    else
        log "curl not available, skipping health check"
    fi
fi

# Generate deployment report
DEPLOY_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DEPLOY_COMMIT=$(git rev-parse HEAD)
DEPLOY_BRANCH=$(git branch --show-current)

cat > "$PROJECT_ROOT/deploy.log" << EOF
Deployment Report
=================
Timestamp: $DEPLOY_TIMESTAMP
Environment: $ENVIRONMENT
Git Commit: $DEPLOY_COMMIT
Git Branch: $DEPLOY_BRANCH
Node Version: $NODE_VERSION
NPM Version: $NPM_VERSION
Dry Run: $DRY_RUN

Pre-deployment backup: ${BACKUP_FILE:-"skipped"}

Deployment completed successfully!
EOF

log "✅ Deployment completed successfully!"
log "📋 Deployment report written to: $PROJECT_ROOT/deploy.log"

if [[ "$DRY_RUN" == true ]]; then
    dry_run_log "Dry run completed - review the output above"
    dry_run_log "Run without --dry-run to perform actual deployment"
fi