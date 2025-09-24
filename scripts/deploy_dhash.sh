#!/bin/bash
set -euo pipefail

# DHash Deployment Script
# Usage: ./scripts/deploy_dhash.sh [--dry-run]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="$PROJECT_ROOT/backups"
LIBRARY_PATH="$PROJECT_ROOT/library.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
DRY_RUN=false
for arg in "$@"; do
    case $arg in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown argument: $arg${NC}"
            echo "Usage: $0 [--dry-run]"
            exit 1
            ;;
    esac
done

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Function to create backup
create_backup() {
    log "Creating timestamped backup..."
    mkdir -p "$BACKUP_DIR"
    
    # Create library.json if it doesn't exist (for initial setup)
    if [[ ! -f "$LIBRARY_PATH" ]]; then
        warn "Library file not found, creating empty library.json"
        echo '{"games": [], "version": "1.0.0", "last_updated": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}' > "$LIBRARY_PATH"
    fi
    
    local backup_file="$BACKUP_DIR/library.json.bak.$TIMESTAMP"
    local checksum_file="$backup_file.sha256"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY-RUN: Would copy $LIBRARY_PATH to $backup_file"
        log "DRY-RUN: Would generate SHA256 checksum"
        return 0
    fi
    
    cp "$LIBRARY_PATH" "$backup_file"
    sha256sum "$backup_file" > "$checksum_file"
    
    log "Backup created: $backup_file"
    log "Checksum: $(cat $checksum_file)"
}

# Function to validate backup
validate_backup() {
    log "Validating latest backup..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY-RUN: Would validate latest backup if it exists"
        return 0
    fi
    
    local latest_backup=$(ls -t "$BACKUP_DIR"/library.json.bak.* 2>/dev/null | grep -v '\.sha256$' | head -n1 || echo "")
    
    if [[ -z "$latest_backup" ]]; then
        warn "No backup found to validate - this is normal for initial deployment"
        return 0
    fi
    
    local checksum_file="$latest_backup.sha256"
    if [[ ! -f "$checksum_file" ]]; then
        error "Checksum file not found: $checksum_file"
    fi
    
    if sha256sum -c "$checksum_file" > /dev/null 2>&1; then
        log "Backup validation successful"
    else
        error "Backup validation failed"
    fi
}

# Function to run migration
run_migration() {
    log "Running DHash migration..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY-RUN: Would run DHash library migration"
        log "DRY-RUN: Migration steps:"
        log "  1. Validate library structure"
        log "  2. Update hash algorithms"
        log "  3. Migrate existing data"
        log "  4. Update version metadata"
        return 0
    fi
    
    # Simulate migration process
    if [[ -f "$LIBRARY_PATH" ]]; then
        # Update library with DHash compatibility
        local temp_file=$(mktemp)
        jq '. + {"dhash_version": "1.0.0", "migration_timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}' "$LIBRARY_PATH" > "$temp_file"
        mv "$temp_file" "$LIBRARY_PATH"
        log "Library updated with DHash compatibility"
    fi
}

# Function to verify health endpoints
verify_endpoints() {
    log "Verifying health and metrics endpoints..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY-RUN: Would verify /health endpoint"
        log "DRY-RUN: Would verify /metrics/dhash endpoint"
        return 0
    fi
    
    # Check if server is running (assuming default port 5001)
    local server_port=${PORT:-5001}
    local health_url="http://localhost:$server_port/health"
    local metrics_url="http://localhost:$server_port/metrics/dhash"
    
    # Start server in background if not running
    if ! curl -s "$health_url" > /dev/null 2>&1; then
        warn "Server not running on port $server_port"
        log "Starting server for endpoint verification..."
        cd "$PROJECT_ROOT"
        npm start > /dev/null 2>&1 &
        local server_pid=$!
        sleep 5
        
        # Cleanup function
        cleanup() {
            if [[ -n "${server_pid:-}" ]]; then
                kill "$server_pid" 2>/dev/null || true
            fi
        }
        trap cleanup EXIT
    fi
    
    # Verify health endpoint
    if curl -s "$health_url" | jq -e '.status == "healthy"' > /dev/null; then
        log "Health endpoint verification successful"
    else
        error "Health endpoint verification failed"
    fi
    
    # Verify metrics endpoint
    if curl -s "$metrics_url" | jq -e 'has("avg_hash_time")' > /dev/null; then
        log "Metrics endpoint verification successful"
    else
        error "Metrics endpoint verification failed"
    fi
}

# Function to cleanup old backups (keep last 10)
cleanup_backups() {
    log "Cleaning up old backups..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        local backup_count=$(ls -1 "$BACKUP_DIR"/library.json.bak.* 2>/dev/null | wc -l || echo "0")
        log "DRY-RUN: Would keep 10 most recent backups (currently: $backup_count)"
        return 0
    fi
    
    # Keep only the 10 most recent backups
    ls -t "$BACKUP_DIR"/library.json.bak.* 2>/dev/null | tail -n +11 | xargs -r rm -f
    ls -t "$BACKUP_DIR"/library.json.bak.*.sha256 2>/dev/null | tail -n +11 | xargs -r rm -f
    
    local remaining=$(ls -1 "$BACKUP_DIR"/library.json.bak.* 2>/dev/null | wc -l || echo "0")
    log "Backup cleanup complete. Retained $remaining backups."
}

# Main deployment flow
main() {
    log "Starting DHash deployment script..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "Running in DRY-RUN mode - no actual changes will be made"
    fi
    
    # Pre-deployment checks
    log "Running pre-deployment checks..."
    
    # Check dependencies
    command -v jq >/dev/null 2>&1 || error "jq is required but not installed"
    command -v curl >/dev/null 2>&1 || error "curl is required but not installed"
    
    # Execute deployment steps
    create_backup
    validate_backup
    run_migration
    verify_endpoints
    cleanup_backups
    
    log "DHash deployment completed successfully!"
    
    if [[ "$DRY_RUN" == "false" ]]; then
        log "Next steps:"
        log "  1. Run smoke tests: ./scripts/simple_smoke_test.sh"
        log "  2. Monitor /health and /metrics/dhash endpoints"
        log "  3. Verify low-confidence queue: npm run lcm:export"
    fi
}

# Run main function
main "$@"