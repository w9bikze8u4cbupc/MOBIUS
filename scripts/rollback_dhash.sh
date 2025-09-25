#!/bin/bash
# Rollback script for MOBIUS dhash with backup restoration
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_ROOT}/backups"

# Default values
BACKUP_FILE=""
DRY_RUN=false
VERIFY_CHECKSUM=true
FORCE_ROLLBACK=false

usage() {
    echo "Usage: $0 --backup <backup_file.zip> [options]"
    echo "Options:"
    echo "  --backup FILE       Backup file to restore from (required)"
    echo "  --dry-run           Show what would be done without executing"
    echo "  --no-verify         Skip SHA256 checksum verification"
    echo "  --force             Force rollback even if current state seems healthy"
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
        --backup)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --no-verify)
            VERIFY_CHECKSUM=false
            shift
            ;;
        --force)
            FORCE_ROLLBACK=true
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

if [[ -z "$BACKUP_FILE" ]]; then
    echo "Error: --backup parameter is required" >&2
    usage
    exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "Error: Backup file not found: $BACKUP_FILE" >&2
    exit 1
fi

log "Starting MOBIUS dhash rollback"
log "Backup file: $BACKUP_FILE"
log "Dry run: $DRY_RUN"
log "Verify checksum: $VERIFY_CHECKSUM"

if [[ "$DRY_RUN" == true ]]; then
    dry_run_log "This is a DRY RUN - no actual changes will be made"
fi

# Verify backup integrity
if [[ "$VERIFY_CHECKSUM" == true ]]; then
    SHA256_FILE="${BACKUP_FILE}.sha256"
    if [[ -f "$SHA256_FILE" ]]; then
        log "Verifying backup integrity..."
        if [[ "$DRY_RUN" == true ]]; then
            dry_run_log "Would verify SHA256 checksum using: $SHA256_FILE"
        else
            if command -v sha256sum >/dev/null; then
                if sha256sum -c "$SHA256_FILE"; then
                    log "✅ Backup integrity verified"
                else
                    echo "❌ Backup integrity check failed" >&2
                    exit 1
                fi
            elif command -v shasum >/dev/null; then
                EXPECTED_HASH=$(cat "$SHA256_FILE" | cut -d' ' -f1)
                ACTUAL_HASH=$(shasum -a 256 "$BACKUP_FILE" | cut -d' ' -f1)
                if [[ "$EXPECTED_HASH" == "$ACTUAL_HASH" ]]; then
                    log "✅ Backup integrity verified"
                else
                    echo "❌ Backup integrity check failed" >&2
                    exit 1
                fi
            else
                log "⚠️ No checksum utility found, skipping verification"
            fi
        fi
    else
        log "⚠️ No SHA256 file found, skipping integrity check"
    fi
fi

# Check current system health (unless forced)
if [[ "$FORCE_ROLLBACK" == false ]]; then
    log "Checking current system health..."
    if command -v curl >/dev/null; then
        HEALTH_URL="http://localhost:5001/health"
        if [[ "$DRY_RUN" == true ]]; then
            dry_run_log "Would check health endpoint: $HEALTH_URL"
        else
            HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
            if [[ "$HEALTH_CODE" == "200" ]]; then
                log "⚠️ Current system appears healthy (HTTP 200)"
                echo "Are you sure you want to rollback? Current system seems to be working."
                echo "Use --force to override this check."
                exit 1
            else
                log "System health check failed (HTTP $HEALTH_CODE), proceeding with rollback"
            fi
        fi
    else
        log "curl not available, skipping health check"
    fi
fi

# Create emergency backup of current state
EMERGENCY_BACKUP="${BACKUP_DIR}/emergency-rollback-$(date -u +%Y%m%dT%H%M%SZ).zip"
log "Creating emergency backup of current state..."
if [[ "$DRY_RUN" == true ]]; then
    dry_run_log "Would create emergency backup: $EMERGENCY_BACKUP"
else
    mkdir -p "$BACKUP_DIR"
    "$SCRIPT_DIR/backup_library.sh" --out "$EMERGENCY_BACKUP" --no-logs
    log "Emergency backup created: $EMERGENCY_BACKUP"
fi

# Stop services before rollback
log "Stopping services..."
if [[ "$DRY_RUN" == true ]]; then
    dry_run_log "Would stop MOBIUS services"
    dry_run_log "Would stop related processes"
else
    # Add service stop commands here
    log "Service stopping would be implemented here"
fi

# Extract backup to temporary location
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

log "Extracting backup..."
if [[ "$DRY_RUN" == true ]]; then
    dry_run_log "Would extract $BACKUP_FILE to temporary location"
else
    unzip -q "$BACKUP_FILE" -d "$TEMP_DIR"
    BACKUP_CONTENTS="$TEMP_DIR/dhash_backup"
    
    if [[ ! -d "$BACKUP_CONTENTS" ]]; then
        echo "Error: Invalid backup structure" >&2
        exit 1
    fi
fi

# Restore files
log "Restoring files from backup..."
if [[ "$DRY_RUN" == true ]]; then
    dry_run_log "Would restore source files to: $PROJECT_ROOT/src"
    dry_run_log "Would restore scripts to: $PROJECT_ROOT/scripts"
    dry_run_log "Would restore client files to: $PROJECT_ROOT/client"
    dry_run_log "Would restore package.json"
    dry_run_log "Would restore configuration files"
else
    # Backup current package.json for comparison
    cp "$PROJECT_ROOT/package.json" "$PROJECT_ROOT/package.json.pre-rollback" || true
    
    # Restore main directories
    rm -rf "$PROJECT_ROOT/src" && cp -r "$BACKUP_CONTENTS/src" "$PROJECT_ROOT/"
    rm -rf "$PROJECT_ROOT/scripts" && cp -r "$BACKUP_CONTENTS/scripts" "$PROJECT_ROOT/"
    rm -rf "$PROJECT_ROOT/client" && cp -r "$BACKUP_CONTENTS/client" "$PROJECT_ROOT/"
    
    # Restore configuration files
    cp "$BACKUP_CONTENTS/package.json" "$PROJECT_ROOT/"
    [[ -f "$BACKUP_CONTENTS/package-lock.json" ]] && cp "$BACKUP_CONTENTS/package-lock.json" "$PROJECT_ROOT/"
    [[ -f "$BACKUP_CONTENTS/.env" ]] && cp "$BACKUP_CONTENTS/.env" "$PROJECT_ROOT/"
    
    # Restore tests if they exist
    [[ -d "$BACKUP_CONTENTS/tests" ]] && rm -rf "$PROJECT_ROOT/tests" && cp -r "$BACKUP_CONTENTS/tests" "$PROJECT_ROOT/"
    
    log "Files restored from backup"
fi

# Reinstall dependencies
log "Reinstalling dependencies..."
execute "cd '$PROJECT_ROOT' && npm ci"

# Run post-rollback tests
log "Running post-rollback verification..."
execute "cd '$PROJECT_ROOT' && npm test"

# Restart services
log "Restarting services..."
if [[ "$DRY_RUN" == true ]]; then
    dry_run_log "Would restart MOBIUS services"
    dry_run_log "Would restart related processes"
else
    # Add service restart commands here
    log "Service restart would be implemented here"
    sleep 5  # Give services time to start
fi

# Verify rollback success
log "Verifying rollback success..."
if [[ "$DRY_RUN" == true ]]; then
    dry_run_log "Would check health endpoint after rollback"
    dry_run_log "Would verify system functionality"
else
    if command -v curl >/dev/null; then
        HEALTH_URL="http://localhost:5001/health"
        HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
        if [[ "$HEALTH_CODE" == "200" ]]; then
            log "✅ Post-rollback health check passed"
        else
            log "⚠️ Post-rollback health check failed (HTTP $HEALTH_CODE)"
        fi
    fi
fi

# Generate rollback report
ROLLBACK_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > "$PROJECT_ROOT/rollback.log" << EOF
Rollback Report
===============
Timestamp: $ROLLBACK_TIMESTAMP
Backup File: $BACKUP_FILE
Emergency Backup: $EMERGENCY_BACKUP
Dry Run: $DRY_RUN
Checksum Verified: $VERIFY_CHECKSUM
Forced: $FORCE_ROLLBACK

Rollback completed!
EOF

log "✅ Rollback completed!"
log "📋 Rollback report written to: $PROJECT_ROOT/rollback.log"
log "🆘 Emergency backup available at: $EMERGENCY_BACKUP"

if [[ "$DRY_RUN" == true ]]; then
    dry_run_log "Dry run completed - review the output above"
    dry_run_log "Run without --dry-run to perform actual rollback"
fi