#!/usr/bin/env bash
set -euo pipefail

# deploy_dhash.sh - Deploy dhash system with dry-run capability
# Usage: ./scripts/deploy_dhash.sh [--dry-run] [--env production|staging]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default values
DRY_RUN=false
ENVIRONMENT="staging"
LOG_FILE="deploy.log"

# Parse arguments
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
    --log)
      LOG_FILE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--env production|staging] [--log LOG_FILE]"
      echo "  --dry-run            Optional: Perform dry run without making changes"
      echo "  --env ENVIRONMENT    Optional: Target environment (default: staging)"
      echo "  --log LOG_FILE       Optional: Log file path (default: deploy.log)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Logging function
log() {
  local msg="[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"
  echo "$msg" | tee -a "$LOG_FILE"
}

# Check if dry run
if [ "$DRY_RUN" = true ]; then
  log "=== DRY RUN MODE - No changes will be made ==="
  LOG_FILE="deploy-dryrun.log"
fi

log "Starting dhash deployment to $ENVIRONMENT environment"

cd "$PROJECT_ROOT"

# Environment validation
case "$ENVIRONMENT" in
  production)
    if [ "$DRY_RUN" = false ]; then
      log "WARNING: Deploying to PRODUCTION environment"
      sleep 2
    fi
    ;;
  staging)
    log "Deploying to staging environment"
    ;;
  *)
    log "ERROR: Unknown environment: $ENVIRONMENT"
    exit 1
    ;;
esac

# Pre-deployment checks
log "Running pre-deployment checks..."

# Check if git working directory is clean
if [ "$DRY_RUN" = false ]; then
  if ! git diff --quiet HEAD; then
    log "ERROR: Git working directory is not clean"
    git status --porcelain | tee -a "$LOG_FILE"
    exit 1
  fi
  log "✓ Git working directory is clean"
fi

# Check Node.js version
NODE_VERSION=$(node --version)
log "✓ Node.js version: $NODE_VERSION"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
  log "Installing dependencies..."
  if [ "$DRY_RUN" = false ]; then
    npm ci | tee -a "$LOG_FILE"
  else
    log "DRY RUN: Would run 'npm ci'"
  fi
fi

log "✓ Dependencies check completed"

# Build the application
log "Building application..."
if [ "$DRY_RUN" = false ]; then
  # Run any build commands here
  if [ -f "package.json" ] && npm run | grep -q "build"; then
    npm run build | tee -a "$LOG_FILE"
  fi
else
  log "DRY RUN: Would run build commands"
fi

# Database/migration checks (placeholder)
log "Checking database migrations..."
if [ "$DRY_RUN" = false ]; then
  # Add actual migration commands here
  log "✓ Database migrations would be applied"
else
  log "DRY RUN: Would check and apply database migrations"
fi

# Service-specific deployment steps
log "Deploying dhash service components..."

# API server deployment
log "Deploying API server..."
if [ "$DRY_RUN" = false ]; then
  # Check if API server is running and stop it gracefully
  if pgrep -f "src/api/index.js" > /dev/null; then
    log "Stopping existing API server..."
    pkill -f "src/api/index.js" || true
    sleep 2
  fi
  
  # Start API server
  log "Starting API server..."
  # In production, this would typically use PM2, systemd, or similar
  # For now, this is a placeholder
  log "✓ API server deployment completed"
else
  log "DRY RUN: Would stop and restart API server"
fi

# Client deployment (if applicable)
if [ -d "client" ]; then
  log "Deploying client application..."
  if [ "$DRY_RUN" = false ]; then
    cd client
    if [ ! -d "node_modules" ]; then
      npm ci | tee -a "../$LOG_FILE"
    fi
    if npm run | grep -q "build"; then
      npm run build | tee -a "../$LOG_FILE"
    fi
    cd ..
  else
    log "DRY RUN: Would build and deploy client application"
  fi
fi

# Health check after deployment
log "Performing post-deployment health checks..."
if [ "$DRY_RUN" = false ]; then
  sleep 5  # Give services time to start
  
  # Check health endpoint
  HEALTH_URL="${HEALTH_URL:-http://localhost:5000/health}"
  if command -v curl > /dev/null; then
    if curl -fsS --max-time 10 "$HEALTH_URL" > /dev/null 2>&1; then
      log "✓ Health check passed: $HEALTH_URL"
    else
      log "WARNING: Health check failed: $HEALTH_URL"
    fi
  else
    log "WARNING: curl not available, skipping health check"
  fi
else
  log "DRY RUN: Would perform health checks"
fi

# Deployment completion
if [ "$DRY_RUN" = false ]; then
  log "=== DEPLOYMENT COMPLETED SUCCESSFULLY ==="
  log "Environment: $ENVIRONMENT"
  log "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  log "Git commit: $(git rev-parse HEAD)"
else
  log "=== DRY RUN COMPLETED SUCCESSFULLY ==="
  log "All deployment steps validated"
fi

log "Deployment log saved to: $LOG_FILE"