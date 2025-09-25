#!/bin/bash
# scripts/deploy_dhash.sh - Deploy dhash library with dry-run support
set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="${LOG_DIR:-$PROJECT_ROOT/logs}"
DEPLOY_ENV=""
DRY_RUN=false
VERBOSE=false

# Help text
show_help() {
    cat << EOF
Usage: $0 [options]

Deploy the dhash library to specified environment.

Options:
  --env ENV           Target environment (staging|production) [required]
  --dry-run          Perform dry-run without actual deployment
  --verbose          Enable verbose logging
  --help             Show this help

Examples:
  $0 --env staging --dry-run
  $0 --env production
  $0 --env staging --verbose

Environment variables:
  LOG_DIR            Directory for deployment logs (default: logs/)
  HEALTH_URL         Health check endpoint (default: http://localhost:5000/health)
  DEPLOY_TIMEOUT     Deployment timeout in seconds (default: 300)
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            DEPLOY_ENV="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            show_help >&2
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "$DEPLOY_ENV" ]]; then
    echo "Error: --env is required" >&2
    show_help >&2
    exit 1
fi

if [[ "$DEPLOY_ENV" != "staging" && "$DEPLOY_ENV" != "production" ]]; then
    echo "Error: --env must be 'staging' or 'production'" >&2
    exit 1
fi

# Setup logging
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG_FILE="$LOG_DIR/deploy_${DEPLOY_ENV}_${TIMESTAMP}.log"

# Logging function
log() {
    local level="$1"
    shift
    local message="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [$level] $*"
    echo "$message" | tee -a "$LOG_FILE"
}

# Verbose logging
debug() {
    if [[ "$VERBOSE" == true ]]; then
        log "DEBUG" "$@"
    fi
}

log "INFO" "Starting deployment to $DEPLOY_ENV"
log "INFO" "Dry run: $DRY_RUN"
log "INFO" "Project root: $PROJECT_ROOT"
log "INFO" "Log file: $LOG_FILE"

# Pre-deployment checks
log "INFO" "Running pre-deployment checks..."

# Check if required files exist
REQUIRED_FILES=(
    "package.json"
    "src/api/index.js"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [[ ! -f "$PROJECT_ROOT/$file" ]]; then
        log "ERROR" "Required file not found: $file"
        exit 1
    fi
    debug "Found required file: $file"
done

# Check Node.js and npm
if ! command -v node >/dev/null 2>&1; then
    log "ERROR" "Node.js not found"
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    log "ERROR" "npm not found"
    exit 1
fi

NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
log "INFO" "Node.js version: $NODE_VERSION"
log "INFO" "npm version: $NPM_VERSION"

# Check git status
cd "$PROJECT_ROOT"
if [[ -d ".git" ]]; then
    GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    GIT_STATUS=$(git status --porcelain 2>/dev/null || echo "unknown")
    
    log "INFO" "Git branch: $GIT_BRANCH"
    log "INFO" "Git commit: $GIT_COMMIT"
    
    if [[ -n "$GIT_STATUS" && "$DEPLOY_ENV" == "production" ]]; then
        log "WARN" "Working directory is not clean for production deployment"
        debug "Git status: $GIT_STATUS"
    fi
fi

# Environment-specific configuration
case "$DEPLOY_ENV" in
    "staging")
        PORT=5002
        HEALTH_URL="${HEALTH_URL:-http://localhost:$PORT/health}"
        ;;
    "production")
        PORT=5001
        HEALTH_URL="${HEALTH_URL:-http://localhost:$PORT/health}"
        ;;
esac

log "INFO" "Target port: $PORT"
log "INFO" "Health URL: $HEALTH_URL"

if [[ "$DRY_RUN" == true ]]; then
    log "INFO" "=== DRY RUN MODE - No actual deployment will occur ==="
    
    # Simulate deployment steps
    log "INFO" "Would install dependencies..."
    debug "Would run: npm ci"
    
    log "INFO" "Would build application..."
    debug "Would run: npm run build --if-present"
    
    log "INFO" "Would check for running processes..."
    if pgrep -f "node.*src/api/index.js" >/dev/null 2>&1; then
        log "INFO" "Found running dhash process (would restart)"
    else
        log "INFO" "No running dhash process found (would start fresh)"
    fi
    
    log "INFO" "Would start application on port $PORT..."
    debug "Would run: PORT=$PORT node src/api/index.js"
    
    log "INFO" "Would wait for health check..."
    debug "Would check: $HEALTH_URL"
    
    log "INFO" "Dry run completed successfully"
    exit 0
fi

# Actual deployment
log "INFO" "=== STARTING ACTUAL DEPLOYMENT ==="

# Install dependencies
log "INFO" "Installing dependencies..."
if ! npm ci >> "$LOG_FILE" 2>&1; then
    log "ERROR" "Failed to install dependencies"
    exit 1
fi

# Build if build script exists
if npm run build --if-present >> "$LOG_FILE" 2>&1; then
    log "INFO" "Build completed"
else
    log "WARN" "Build failed or no build script found"
fi

# Stop existing process
log "INFO" "Stopping existing processes..."
pkill -f "node.*src/api/index.js" || log "INFO" "No existing process found"
sleep 2

# Start application
log "INFO" "Starting application on port $PORT..."
PORT=$PORT nohup node src/api/index.js >> "$LOG_FILE" 2>&1 &
APP_PID=$!
log "INFO" "Application started with PID: $APP_PID"

# Wait for application to start
log "INFO" "Waiting for application to initialize..."
sleep 5

# Health check
DEPLOY_TIMEOUT="${DEPLOY_TIMEOUT:-300}"
HEALTH_CHECK_INTERVAL=5
ELAPSED=0

log "INFO" "Performing health checks..."
while [[ $ELAPSED -lt $DEPLOY_TIMEOUT ]]; do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
        log "INFO" "Health check passed"
        
        # Get detailed health info
        HEALTH_RESPONSE=$(curl -fsS "$HEALTH_URL" 2>/dev/null || echo '{"status":"unknown"}')
        log "INFO" "Health response: $HEALTH_RESPONSE"
        
        log "INFO" "Deployment to $DEPLOY_ENV completed successfully"
        log "INFO" "Application PID: $APP_PID"
        log "INFO" "Health URL: $HEALTH_URL"
        log "INFO" "Log file: $LOG_FILE"
        
        # Save deployment info
        DEPLOY_INFO_FILE="$LOG_DIR/deploy_${DEPLOY_ENV}_info.json"
        cat > "$DEPLOY_INFO_FILE" << EOF
{
  "environment": "$DEPLOY_ENV",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "pid": $APP_PID,
  "port": $PORT,
  "health_url": "$HEALTH_URL",
  "log_file": "$LOG_FILE",
  "git_commit": "$GIT_COMMIT",
  "git_branch": "$GIT_BRANCH",
  "node_version": "$NODE_VERSION",
  "npm_version": "$NPM_VERSION"
}
EOF
        log "INFO" "Deployment info saved to: $DEPLOY_INFO_FILE"
        
        exit 0
    fi
    
    debug "Health check failed, retrying in ${HEALTH_CHECK_INTERVAL}s..."
    sleep $HEALTH_CHECK_INTERVAL
    ((ELAPSED += HEALTH_CHECK_INTERVAL))
done

# Deployment failed
log "ERROR" "Health check failed after ${DEPLOY_TIMEOUT}s timeout"
log "ERROR" "Killing application process $APP_PID"
kill $APP_PID 2>/dev/null || true

exit 1