#!/bin/bash
# scripts/rollback_dhash.sh - Rollback dhash library from verified backup
set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="${LOG_DIR:-$PROJECT_ROOT/logs}"
BACKUP_FILE=""
ROLLBACK_TARGET="$PROJECT_ROOT"
VERIFY_CHECKSUM=true
KEEP_BACKUP=true

# Help text
show_help() {
    cat << EOF
Usage: $0 [options]

Rollback the dhash library from a verified backup.

Options:
  --backup PATH        Path to backup zip file [required]
  --target DIR         Rollback target directory (default: project root)
  --no-verify         Skip checksum verification
  --no-keep-backup    Remove backup after successful rollback
  --help              Show this help

Examples:
  $0 --backup backups/dhash_20240101T120000Z.zip
  $0 --backup /secure/backups/dhash_latest.zip --no-verify

Environment variables:
  LOG_DIR             Directory for rollback logs (default: logs/)
  HEALTH_URL          Health check endpoint (default: http://localhost:5000/health)
  ROLLBACK_TIMEOUT    Rollback timeout in seconds (default: 180)
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --backup)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --target)
            ROLLBACK_TARGET="$2"
            shift 2
            ;;
        --no-verify)
            VERIFY_CHECKSUM=false
            shift
            ;;
        --no-keep-backup)
            KEEP_BACKUP=false
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
if [[ -z "$BACKUP_FILE" ]]; then
    echo "Error: --backup is required" >&2
    show_help >&2
    exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "Error: Backup file not found: $BACKUP_FILE" >&2
    exit 1
fi

# Setup logging
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG_FILE="$LOG_DIR/rollback_${TIMESTAMP}.log"

# Logging function
log() {
    local level="$1"
    shift
    local message="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [$level] $*"
    echo "$message" | tee -a "$LOG_FILE"
}

log "INFO" "Starting rollback process"
log "INFO" "Backup file: $BACKUP_FILE"
log "INFO" "Target directory: $ROLLBACK_TARGET"
log "INFO" "Log file: $LOG_FILE"

# Verify backup checksum if requested
if [[ "$VERIFY_CHECKSUM" == true ]]; then
    CHECKSUM_FILE="${BACKUP_FILE}.sha256"
    if [[ -f "$CHECKSUM_FILE" ]]; then
        log "INFO" "Verifying backup checksum..."
        if sha256sum -c "$CHECKSUM_FILE" >/dev/null 2>&1; then
            log "INFO" "Backup checksum verification passed"
        else
            log "ERROR" "Backup checksum verification failed"
            exit 1
        fi
    else
        log "WARN" "Checksum file not found: $CHECKSUM_FILE"
        log "WARN" "Continuing without verification (use --no-verify to suppress this warning)"
    fi
fi

# Get backup metadata if available
METADATA_FILE="${BACKUP_FILE}.meta"
if [[ -f "$METADATA_FILE" ]]; then
    log "INFO" "Loading backup metadata..."
    BACKUP_DATE=$(jq -r '.created_at // "unknown"' "$METADATA_FILE" 2>/dev/null || echo "unknown")
    BACKUP_COMMIT=$(jq -r '.git_commit // "unknown"' "$METADATA_FILE" 2>/dev/null || echo "unknown")
    BACKUP_BRANCH=$(jq -r '.git_branch // "unknown"' "$METADATA_FILE" 2>/dev/null || echo "unknown")
    
    log "INFO" "Backup created: $BACKUP_DATE"
    log "INFO" "Backup commit: $BACKUP_COMMIT"
    log "INFO" "Backup branch: $BACKUP_BRANCH"
fi

# Create rollback staging directory
STAGING_DIR=$(mktemp -d)
trap 'rm -rf "$STAGING_DIR"' EXIT

log "INFO" "Using staging directory: $STAGING_DIR"

# Extract backup to staging
log "INFO" "Extracting backup..."
if command -v unzip >/dev/null 2>&1; then
    if unzip -q "$BACKUP_FILE" -d "$STAGING_DIR"; then
        log "INFO" "Backup extracted successfully"
    else
        log "ERROR" "Failed to extract backup"
        exit 1
    fi
else
    log "ERROR" "unzip command not found. Please install unzip."
    exit 1
fi

# Stop current application
log "INFO" "Stopping current application..."
if pgrep -f "node.*src/api/index.js" >/dev/null 2>&1; then
    pkill -f "node.*src/api/index.js" || true
    sleep 3
    log "INFO" "Application stopped"
else
    log "INFO" "No running application found"
fi

# Create backup of current state before rollback
CURRENT_BACKUP_DIR="$LOG_DIR/pre-rollback-backup"
mkdir -p "$CURRENT_BACKUP_DIR"
CURRENT_BACKUP_FILE="$CURRENT_BACKUP_DIR/pre-rollback_${TIMESTAMP}.zip"

log "INFO" "Creating backup of current state..."
cd "$ROLLBACK_TARGET"
if zip -r "$CURRENT_BACKUP_FILE" . -x "backups/*" "logs/*" "node_modules/*" >/dev/null 2>&1; then
    log "INFO" "Current state backed up to: $CURRENT_BACKUP_FILE"
else
    log "WARN" "Failed to backup current state, continuing with rollback"
fi

# Perform rollback
log "INFO" "Performing rollback..."

# Preserve critical directories and files during rollback
PRESERVE_PATHS=(
    "logs"
    "backups"
    "node_modules"
    ".env"
    ".env.local"
)

# Move preserved paths to temporary location
PRESERVE_DIR=$(mktemp -d)
for preserve_path in "${PRESERVE_PATHS[@]}"; do
    if [[ -e "$ROLLBACK_TARGET/$preserve_path" ]]; then
        mv "$ROLLBACK_TARGET/$preserve_path" "$PRESERVE_DIR/" 2>/dev/null || true
        log "INFO" "Preserved: $preserve_path"
    fi
done

# Clear target directory (except preserved items)
find "$ROLLBACK_TARGET" -mindepth 1 -maxdepth 1 ! -name "logs" ! -name "backups" ! -name "node_modules" -exec rm -rf {} + 2>/dev/null || true

# Copy rolled back files
cp -r "$STAGING_DIR"/* "$ROLLBACK_TARGET/"
log "INFO" "Files restored from backup"

# Restore preserved paths
for preserve_path in "${PRESERVE_PATHS[@]}"; do
    if [[ -e "$PRESERVE_DIR/$preserve_path" ]]; then
        mv "$PRESERVE_DIR/$preserve_path" "$ROLLBACK_TARGET/" 2>/dev/null || true
        log "INFO" "Restored: $preserve_path"
    fi
done

# Clean up preserve directory
rm -rf "$PRESERVE_DIR"

# Install dependencies if needed
cd "$ROLLBACK_TARGET"
if [[ -f "package.json" && ! -d "node_modules" ]]; then
    log "INFO" "Installing dependencies..."
    if npm ci >> "$LOG_FILE" 2>&1; then
        log "INFO" "Dependencies installed successfully"
    else
        log "ERROR" "Failed to install dependencies"
        exit 1
    fi
fi

# Start application
log "INFO" "Starting application after rollback..."
PORT="${PORT:-5001}" nohup node src/api/index.js >> "$LOG_FILE" 2>&1 &
APP_PID=$!
log "INFO" "Application started with PID: $APP_PID"

# Wait for application to start
sleep 5

# Health check
ROLLBACK_TIMEOUT="${ROLLBACK_TIMEOUT:-180}"
HEALTH_URL="${HEALTH_URL:-http://localhost:5001/health}"
HEALTH_CHECK_INTERVAL=5
ELAPSED=0

log "INFO" "Performing post-rollback health checks..."
while [[ $ELAPSED -lt $ROLLBACK_TIMEOUT ]]; do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
        log "INFO" "Health check passed"
        
        # Get detailed health info
        HEALTH_RESPONSE=$(curl -fsS "$HEALTH_URL" 2>/dev/null || echo '{"status":"unknown"}')
        log "INFO" "Health response: $HEALTH_RESPONSE"
        
        log "INFO" "Rollback completed successfully"
        log "INFO" "Application PID: $APP_PID"
        log "INFO" "Health URL: $HEALTH_URL"
        log "INFO" "Pre-rollback backup: $CURRENT_BACKUP_FILE"
        
        # Create rollback report
        ROLLBACK_REPORT="$LOG_DIR/rollback_report_${TIMESTAMP}.json"
        cat > "$ROLLBACK_REPORT" << EOF
{
  "rollback_completed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_file": "$BACKUP_FILE",
  "backup_date": "$BACKUP_DATE",
  "backup_commit": "$BACKUP_COMMIT",
  "backup_branch": "$BACKUP_BRANCH",
  "pre_rollback_backup": "$CURRENT_BACKUP_FILE",
  "application_pid": $APP_PID,
  "health_url": "$HEALTH_URL",
  "log_file": "$LOG_FILE",
  "rollback_duration_seconds": $ELAPSED
}
EOF
        log "INFO" "Rollback report saved to: $ROLLBACK_REPORT"
        
        # Optional: Remove backup if requested
        if [[ "$KEEP_BACKUP" == false ]]; then
            rm -f "$BACKUP_FILE" "${BACKUP_FILE}.sha256" "${BACKUP_FILE}.meta" 2>/dev/null || true
            log "INFO" "Backup file removed as requested"
        fi
        
        exit 0
    fi
    
    log "INFO" "Health check failed, retrying in ${HEALTH_CHECK_INTERVAL}s..."
    sleep $HEALTH_CHECK_INTERVAL
    ((ELAPSED += HEALTH_CHECK_INTERVAL))
done

# Rollback failed
log "ERROR" "Health check failed after ${ROLLBACK_TIMEOUT}s timeout"
log "ERROR" "Rollback may have failed - manual intervention required"
log "ERROR" "Application PID: $APP_PID"
log "ERROR" "Pre-rollback backup available at: $CURRENT_BACKUP_FILE"

exit 1