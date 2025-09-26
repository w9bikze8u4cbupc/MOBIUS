#!/bin/bash
# MOBIUS Deployment Framework - Rollback Script
# Performs verified rollback using SHA256-verified backups

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default environment
ENV="${ENV:-staging}"
BACKUP_FILE=""
FORCE_ROLLBACK=false

# Help message
show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Perform verified rollback for MOBIUS deployment

OPTIONS:
    --env ENV         Target environment (staging|production) [default: staging]
    --backup FILE     Backup file to restore from (required)
    --force           Skip confirmation prompts
    --help           Show this help message

EXAMPLES:
    $0 --backup backups/dhash_20240101_120000.zip --env production
    $0 --backup backups/dhash_20240101_120000.zip --env staging --force

REQUIREMENTS:
    - Backup file must exist and have corresponding .sha256 file
    - SHA256 verification must pass
    - Current state will be backed up before rollback

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            shift 2
            ;;
        --backup)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --force)
            FORCE_ROLLBACK=true
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

# Validate required parameters
if [[ -z "$BACKUP_FILE" ]]; then
    echo "ERROR: --backup parameter is required" >&2
    show_help >&2
    exit 1
fi

# Validate environment
if [[ ! "$ENV" =~ ^(staging|production)$ ]]; then
    echo "ERROR: Invalid environment '$ENV'. Must be 'staging' or 'production'." >&2
    exit 1
fi

# Validate backup file exists
if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE" >&2
    exit 1
fi

# Convert to absolute path
BACKUP_FILE=$(realpath "$BACKUP_FILE")
BACKUP_CHECKSUM="${BACKUP_FILE}.sha256"

echo "========================================"
echo "MOBIUS Rollback Procedure"
echo "========================================"
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "Environment: $ENV"
echo "Backup File: $BACKUP_FILE"
echo "Checksum File: $BACKUP_CHECKSUM"
echo "Git Commit (current): $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
echo "Git Branch (current): $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
echo "Force Mode: $FORCE_ROLLBACK"
echo "========================================"

# Validate backup checksum file exists
if [[ ! -f "$BACKUP_CHECKSUM" ]]; then
    echo "ERROR: Backup checksum file not found: $BACKUP_CHECKSUM" >&2
    echo "Cannot verify backup integrity without checksum file." >&2
    exit 1
fi

echo ""
echo "=== Phase 1: Backup Verification ==="

# Verify backup integrity
echo "Verifying backup integrity..."
BACKUP_DIR=$(dirname "$BACKUP_FILE")
BACKUP_NAME=$(basename "$BACKUP_FILE")
cd "$BACKUP_DIR"

if sha256sum -c "$BACKUP_NAME.sha256" > /dev/null 2>&1; then
    echo "✓ Backup integrity verified successfully"
else
    echo "✗ ERROR: Backup integrity verification failed" >&2
    echo "Backup file may be corrupted. Rollback cannot proceed safely." >&2
    exit 1
fi

# Display backup information
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
BACKUP_DATE=$(stat -c %y "$BACKUP_FILE" 2>/dev/null || stat -f %Sm "$BACKUP_FILE" 2>/dev/null || echo "unknown")
echo "✓ Backup size: $BACKUP_SIZE"
echo "✓ Backup date: $BACKUP_DATE"

# Extract and verify backup metadata
echo "Extracting backup metadata..."
TEMP_EXTRACT_DIR=$(mktemp -d)
trap "rm -rf $TEMP_EXTRACT_DIR" EXIT

cd "$TEMP_EXTRACT_DIR"
unzip -q "$BACKUP_FILE"

# Find backup directory
BACKUP_EXTRACT_DIR=$(find . -maxdepth 1 -type d -name "dhash_*" | head -1)
if [[ -z "$BACKUP_EXTRACT_DIR" ]]; then
    echo "✗ ERROR: Invalid backup structure" >&2
    exit 1
fi

# Read backup metadata
if [[ -f "$BACKUP_EXTRACT_DIR/backup_metadata.json" ]]; then
    echo "✓ Backup metadata found"
    BACKUP_ENV=$(jq -r '.environment' "$BACKUP_EXTRACT_DIR/backup_metadata.json" 2>/dev/null || echo "unknown")
    BACKUP_COMMIT=$(jq -r '.git_commit' "$BACKUP_EXTRACT_DIR/backup_metadata.json" 2>/dev/null || echo "unknown")
    BACKUP_BRANCH=$(jq -r '.git_branch' "$BACKUP_EXTRACT_DIR/backup_metadata.json" 2>/dev/null || echo "unknown")
    BACKUP_TIMESTAMP=$(jq -r '.timestamp' "$BACKUP_EXTRACT_DIR/backup_metadata.json" 2>/dev/null || echo "unknown")
    
    echo "  Environment: $BACKUP_ENV"
    echo "  Git Commit: $BACKUP_COMMIT"
    echo "  Git Branch: $BACKUP_BRANCH"
    echo "  Timestamp: $BACKUP_TIMESTAMP"
    
    # Warn about environment mismatch
    if [[ "$BACKUP_ENV" != "$ENV" && "$BACKUP_ENV" != "unknown" ]]; then
        echo "⚠ WARNING: Backup environment ($BACKUP_ENV) differs from target environment ($ENV)"
    fi
else
    echo "⚠ WARNING: No backup metadata found"
fi

echo ""
echo "=== Phase 2: Pre-rollback Safety Checks ==="

# Check if there are uncommitted changes
echo "Checking for uncommitted changes..."
cd "$REPO_ROOT"
if ! git diff-index --quiet HEAD --; then
    echo "⚠ WARNING: Working directory has uncommitted changes"
    if [[ "$FORCE_ROLLBACK" != "true" ]]; then
        echo "These changes will be lost during rollback."
        read -p "Continue with rollback? (y/N): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Rollback cancelled by user"
            exit 0
        fi
    fi
else
    echo "✓ Working directory is clean"
fi

# Check current system health
echo "Checking current system health..."
if command -v curl >/dev/null 2>&1; then
    API_BASE_URL="${API_BASE_URL:-http://localhost:5001}"
    if curl -s --connect-timeout 5 --max-time 5 "$API_BASE_URL/health" >/dev/null 2>&1; then
        echo "✓ Current system appears to be responsive"
    else
        echo "ℹ Current system is not responsive (this may be expected)"
    fi
else
    echo "ℹ Cannot check system health (curl not available)"
fi

echo ""
echo "=== Phase 3: Create Emergency Backup ==="

# Create emergency backup of current state
echo "Creating emergency backup of current state..."
EMERGENCY_BACKUP_NAME="emergency_$(date -u +%Y%m%d_%H%M%S)"
EMERGENCY_BACKUP_DIR="$REPO_ROOT/backups"
mkdir -p "$EMERGENCY_BACKUP_DIR"

if [[ -x "$SCRIPT_DIR/backup_dhash.sh" ]]; then
    echo "Using backup script to create emergency backup..."
    "$SCRIPT_DIR/backup_dhash.sh" --env "$ENV" --backup-dir "$EMERGENCY_BACKUP_DIR" || {
        echo "⚠ WARNING: Emergency backup failed, but continuing with rollback"
    }
else
    echo "Creating manual emergency backup..."
    EMERGENCY_TEMP_DIR=$(mktemp -d)
    trap "rm -rf $EMERGENCY_TEMP_DIR" EXIT
    
    # Copy critical files
    mkdir -p "$EMERGENCY_TEMP_DIR/$EMERGENCY_BACKUP_NAME"
    cp -r "$REPO_ROOT/src" "$EMERGENCY_TEMP_DIR/$EMERGENCY_BACKUP_NAME/" 2>/dev/null || true
    cp -r "$REPO_ROOT/scripts" "$EMERGENCY_TEMP_DIR/$EMERGENCY_BACKUP_NAME/" 2>/dev/null || true
    cp "$REPO_ROOT/package.json" "$EMERGENCY_TEMP_DIR/$EMERGENCY_BACKUP_NAME/" 2>/dev/null || true
    cp "$REPO_ROOT/package-lock.json" "$EMERGENCY_TEMP_DIR/$EMERGENCY_BACKUP_NAME/" 2>/dev/null || true
    
    # Create archive
    cd "$EMERGENCY_TEMP_DIR"
    zip -r "$EMERGENCY_BACKUP_DIR/$EMERGENCY_BACKUP_NAME.zip" "$EMERGENCY_BACKUP_NAME"
    
    # Create checksum
    cd "$EMERGENCY_BACKUP_DIR"
    sha256sum "$EMERGENCY_BACKUP_NAME.zip" > "$EMERGENCY_BACKUP_NAME.zip.sha256"
    
    echo "✓ Emergency backup created: $EMERGENCY_BACKUP_DIR/$EMERGENCY_BACKUP_NAME.zip"
fi

echo ""
echo "=== Phase 4: Confirmation ==="

if [[ "$FORCE_ROLLBACK" != "true" ]]; then
    echo "⚠ FINAL CONFIRMATION REQUIRED ⚠"
    echo ""
    echo "This will:"
    echo "1. Replace current application code with backup from: $BACKUP_TIMESTAMP"
    echo "2. Restore configuration files"
    echo "3. Reinstall dependencies as specified in backup"
    echo "4. Potentially lose recent changes made after backup"
    echo ""
    echo "Emergency backup has been created for current state."
    echo ""
    read -p "Are you absolutely sure you want to proceed with rollback? (type 'YES' to confirm): " -r
    if [[ "$REPLY" != "YES" ]]; then
        echo "Rollback cancelled by user"
        exit 0
    fi
fi

echo ""
echo "=== Phase 5: Executing Rollback ==="

echo "Starting rollback process..."

# Stop services (if any management scripts exist)
echo "Stopping services..."
if [[ -f "$REPO_ROOT/scripts/stop_services.sh" ]]; then
    "$REPO_ROOT/scripts/stop_services.sh" || echo "⚠ Service stop script failed"
else
    echo "ℹ No service stop script found"
fi

# Restore files from backup
echo "Restoring files from backup..."
cd "$TEMP_EXTRACT_DIR/$BACKUP_EXTRACT_DIR"

# Restore package.json and package-lock.json
if [[ -f "package.json" ]]; then
    cp "package.json" "$REPO_ROOT/"
    echo "✓ Restored package.json"
fi

if [[ -f "package-lock.json" ]]; then
    cp "package-lock.json" "$REPO_ROOT/"
    echo "✓ Restored package-lock.json"
fi

# Restore src directory
if [[ -d "src" ]]; then
    rm -rf "$REPO_ROOT/src"
    cp -r "src" "$REPO_ROOT/"
    echo "✓ Restored src/ directory"
fi

# Restore scripts directory
if [[ -d "scripts" ]]; then
    # Preserve current deployment scripts
    if [[ -d "$REPO_ROOT/scripts/deploy" ]]; then
        cp -r "$REPO_ROOT/scripts/deploy" "/tmp/deploy_scripts_backup"
    fi
    
    rm -rf "$REPO_ROOT/scripts"
    cp -r "scripts" "$REPO_ROOT/"
    
    # Restore deployment scripts if they were backed up
    if [[ -d "/tmp/deploy_scripts_backup" ]]; then
        cp -r "/tmp/deploy_scripts_backup" "$REPO_ROOT/scripts/deploy"
        rm -rf "/tmp/deploy_scripts_backup"
    fi
    
    echo "✓ Restored scripts/ directory (preserved deployment scripts)"
fi

# Restore client directory if it exists in backup
if [[ -d "client" ]]; then
    rm -rf "$REPO_ROOT/client"
    cp -r "client" "$REPO_ROOT/"
    echo "✓ Restored client/ directory"
fi

# Restore tests directory if it exists in backup
if [[ -d "tests" ]]; then
    rm -rf "$REPO_ROOT/tests"
    cp -r "tests" "$REPO_ROOT/"
    echo "✓ Restored tests/ directory"
fi

echo ""
echo "=== Phase 6: Dependency Restoration ==="

# Reinstall dependencies
echo "Reinstalling dependencies from backup..."
cd "$REPO_ROOT"

if [[ -f "package-lock.json" ]]; then
    echo "Using npm ci for exact dependency versions..."
    if npm ci; then
        echo "✓ Dependencies restored successfully"
    else
        echo "✗ ERROR: Dependency restoration failed" >&2
        echo "Manual intervention may be required" >&2
        exit 1
    fi
else
    echo "Using npm install (no package-lock.json found)..."
    if npm install; then
        echo "✓ Dependencies installed successfully"
    else
        echo "✗ ERROR: Dependency installation failed" >&2
        exit 1
    fi
fi

echo ""
echo "=== Phase 7: Post-rollback Verification ==="

# Start services (if any management scripts exist)
echo "Starting services..."
if [[ -f "$REPO_ROOT/scripts/start_services.sh" ]]; then
    "$REPO_ROOT/scripts/start_services.sh" || echo "⚠ Service start script failed"
else
    echo "ℹ No service start script found"
fi

# Wait a moment for services to start
sleep 5

# Run smoke tests if available
echo "Running post-rollback smoke tests..."
if [[ -x "$SCRIPT_DIR/smoke_tests.sh" ]]; then
    if "$SCRIPT_DIR/smoke_tests.sh" --env "$ENV"; then
        echo "✅ Post-rollback smoke tests passed"
    else
        echo "⚠ WARNING: Post-rollback smoke tests failed"
        echo "Manual verification recommended"
    fi
else
    echo "ℹ No smoke test script available"
fi

echo ""
echo "========================================"
echo "ROLLBACK COMPLETED"
echo "========================================"
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "Environment: $ENV"
echo "Backup Used: $BACKUP_FILE"
echo "Emergency Backup: $EMERGENCY_BACKUP_DIR/$EMERGENCY_BACKUP_NAME.zip"
echo ""
echo "✅ Rollback procedure completed successfully"
echo ""
echo "Post-rollback checklist:"
echo "- [ ] Verify application functionality manually"
echo "- [ ] Check logs for any errors"
echo "- [ ] Confirm expected application version"
echo "- [ ] Notify stakeholders of rollback completion"
echo "- [ ] Document incident and lessons learned"
echo ""
echo "Emergency backup available at:"
echo "$EMERGENCY_BACKUP_DIR/$EMERGENCY_BACKUP_NAME.zip"
echo "========================================"