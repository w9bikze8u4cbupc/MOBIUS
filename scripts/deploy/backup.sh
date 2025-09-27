#!/bin/bash
# MOBIUS Mock Backup Script
# Cross-platform compatible backup simulation for testing deployment workflows

set -e

# Default configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DRY_RUN=false
VERBOSE=false
BACKUP_TYPE="incremental"

# Colors for output (compatible with Git Bash on Windows)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# Logging function
log() {
    local level="$1"
    shift
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    case "$level" in
        INFO)  echo -e "${GREEN}[INFO]${NC}  $timestamp - $*" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC}  $timestamp - $*" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $timestamp - $*" ;;
        DEBUG) [[ "$VERBOSE" == "true" ]] && echo -e "${BLUE}[DEBUG]${NC} $timestamp - $*" ;;
    esac
}

# Help function
show_help() {
    cat << EOF
MOBIUS Mock Backup Script

Usage: $0 [OPTIONS]

OPTIONS:
    --dry-run           Simulate backup without making changes
    --verbose           Enable verbose logging
    --type TYPE         Backup type (full|incremental) [default: incremental]
    --backup-dir DIR    Backup directory [default: ./backups]
    --help             Show this help message

EXAMPLES:
    # Dry run backup
    $0 --dry-run --verbose
    
    # Full backup simulation
    $0 --type full --backup-dir /tmp/mobius-backup
    
    # Windows Git Bash
    ./backup.sh --dry-run

COMPATIBILITY:
    - Linux/macOS: Native bash support
    - Windows: Git Bash or WSL
    - Windows PowerShell: Use backup.ps1 instead
EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --type)
            BACKUP_TYPE="$2"
            shift 2
            ;;
        --backup-dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log ERROR "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main backup function
perform_backup() {
    local start_time=$(date)
    
    log INFO "Starting MOBIUS mock backup process"
    log DEBUG "Backup type: $BACKUP_TYPE"
    log DEBUG "Backup directory: $BACKUP_DIR"
    log DEBUG "Dry run: $DRY_RUN"
    
    # Simulate backup steps
    log INFO "Checking backup prerequisites..."
    sleep 1
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log WARN "DRY RUN MODE - No actual backup operations will be performed"
    fi
    
    # Create backup directory
    if [[ "$DRY_RUN" == "false" ]]; then
        mkdir -p "$BACKUP_DIR"
        log INFO "Created backup directory: $BACKUP_DIR"
    else
        log DEBUG "Would create backup directory: $BACKUP_DIR"
    fi
    
    # Simulate database backup
    log INFO "Backing up database..."
    sleep 2
    if [[ "$DRY_RUN" == "false" ]]; then
        echo "Mock database backup $(date)" > "$BACKUP_DIR/database_backup.sql"
        log INFO "Database backup completed"
    else
        log DEBUG "Would backup database to: $BACKUP_DIR/database_backup.sql"
    fi
    
    # Simulate file system backup
    log INFO "Backing up application files..."
    sleep 2
    if [[ "$DRY_RUN" == "false" ]]; then
        echo "Mock application backup $(date)" > "$BACKUP_DIR/app_backup.tar.gz"
        log INFO "Application files backup completed"
    else
        log DEBUG "Would backup application files to: $BACKUP_DIR/app_backup.tar.gz"
    fi
    
    # Simulate configuration backup
    log INFO "Backing up configuration..."
    sleep 1
    if [[ "$DRY_RUN" == "false" ]]; then
        echo "Mock config backup $(date)" > "$BACKUP_DIR/config_backup.json"
        log INFO "Configuration backup completed"
    else
        log DEBUG "Would backup configuration to: $BACKUP_DIR/config_backup.json"
    fi
    
    # Generate backup manifest
    if [[ "$DRY_RUN" == "false" ]]; then
        cat > "$BACKUP_DIR/backup_manifest.txt" << EOF
MOBIUS Backup Manifest
Generated: $(date)
Type: $BACKUP_TYPE
Status: SUCCESS

Files:
- database_backup.sql
- app_backup.tar.gz  
- config_backup.json

Checksums:
database_backup.sql: $(echo "mock-checksum-db-$(date +%s)" | sha256sum | cut -d' ' -f1)
app_backup.tar.gz: $(echo "mock-checksum-app-$(date +%s)" | sha256sum | cut -d' ' -f1)
config_backup.json: $(echo "mock-checksum-config-$(date +%s)" | sha256sum | cut -d' ' -f1)
EOF
        log INFO "Backup manifest created"
    fi
    
    local end_time=$(date)
    log INFO "Backup process completed successfully"
    log INFO "Started: $start_time"
    log INFO "Completed: $end_time"
    
    return 0
}

# Error handler
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log ERROR "Backup process failed with exit code: $exit_code"
    fi
    exit $exit_code
}

# Set up error handling
trap cleanup EXIT

# Run the backup
perform_backup

log INFO "Mock backup script finished successfully"