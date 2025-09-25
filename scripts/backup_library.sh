#!/bin/bash

# Backup Library - Creates verified ZIP backups with SHA256 checksums and metadata
# Ensures reliable backup creation for safe deployment rollbacks

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-backups}"
DRY_RUN="${DRY_RUN:-true}"
ENVIRONMENT="${ENVIRONMENT:-staging}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" >&2
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" >&2
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}" >&2
}

# Help function
show_help() {
    cat << EOF
Backup Library - Verified ZIP backups with SHA256 checksums

Usage: $0 [OPTIONS]

Options:
    --env <environment>     Target environment (staging|production) [default: staging]
    --dry-run              Run in dry-run mode (safe testing) [default: true]
    --no-dry-run           Disable dry-run mode
    --backup-dir <path>    Backup directory [default: backups]
    --source <path>        Source directory to backup [default: current directory]
    --name <name>          Custom backup name
    --verify               Verify existing backup
    --list                 List available backups
    --help, -h             Show this help message

Examples:
    # Create backup with verification
    $0 --env production --no-dry-run

    # Verify existing backup
    $0 --verify --name backup_20241215_120000

    # List all available backups
    $0 --list

Backup Naming Convention:
    {environment}_{timestamp}_{git_hash}.zip
    Example: production_20241215_120000_abc1234.zip
EOF
}

# Parse command line arguments
parse_args() {
    local action="create"
    local source_dir="."
    local backup_name=""
    
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
            --no-dry-run)
                DRY_RUN=false
                shift
                ;;
            --backup-dir)
                BACKUP_DIR="$2"
                shift 2
                ;;
            --source)
                source_dir="$2"
                shift 2
                ;;
            --name)
                backup_name="$2"
                shift 2
                ;;
            --verify)
                action="verify"
                shift
                ;;
            --list)
                action="list"
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    export ACTION="$action"
    export SOURCE_DIR="$source_dir"
    export BACKUP_NAME="$backup_name"
}

# Get git hash for backup naming
get_git_hash() {
    if git rev-parse --git-dir > /dev/null 2>&1; then
        git rev-parse --short HEAD 2>/dev/null || echo "nogit"
    else
        echo "nogit"
    fi
}

# Generate backup name
generate_backup_name() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local git_hash=$(get_git_hash)
    echo "${ENVIRONMENT}_${timestamp}_${git_hash}"
}

# Create backup metadata
create_metadata() {
    local backup_path="$1"
    local metadata_file="${backup_path%.zip}.metadata.json"
    
    local git_hash=$(get_git_hash)
    local git_branch=""
    if git rev-parse --git-dir > /dev/null 2>&1; then
        git_branch=$(git branch --show-current 2>/dev/null || echo "unknown")
    fi
    
    cat > "$metadata_file" << EOF
{
  "backup_name": "$(basename "$backup_path")",
  "environment": "$ENVIRONMENT",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source_directory": "$SOURCE_DIR",
  "git": {
    "hash": "$git_hash",
    "branch": "$git_branch"
  },
  "system": {
    "hostname": "$(hostname)",
    "user": "$(whoami)",
    "os": "$(uname -s)",
    "platform": "$(uname -m)"
  },
  "files": {
    "total_size_bytes": $(stat -c%s "$backup_path" 2>/dev/null || stat -f%z "$backup_path" 2>/dev/null || echo 0),
    "compression_format": "zip"
  }
}
EOF
    
    log "Metadata created: $metadata_file"
}

# Calculate and verify checksums
calculate_checksum() {
    local file_path="$1"
    local checksum_file="${file_path}.sha256"
    
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$file_path" > "$checksum_file"
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$file_path" > "$checksum_file"
    else
        log_error "No SHA256 utility found (sha256sum or shasum)"
        return 1
    fi
    
    log "Checksum calculated: $checksum_file"
}

# Verify backup integrity
verify_backup() {
    local backup_name="$1"
    local backup_path="$BACKUP_DIR/${backup_name}.zip"
    local checksum_file="$backup_path.sha256"
    local metadata_file="${backup_path%.zip}.metadata.json"
    
    log "Verifying backup: $backup_name"
    
    # Check if backup exists
    if [[ ! -f "$backup_path" ]]; then
        log_error "Backup file not found: $backup_path"
        return 1
    fi
    
    # Verify checksum
    if [[ -f "$checksum_file" ]]; then
        log "Verifying checksum..."
        if command -v sha256sum >/dev/null 2>&1; then
            if sha256sum -c "$checksum_file"; then
                log_success "Checksum verification passed"
            else
                log_error "Checksum verification failed"
                return 1
            fi
        elif command -v shasum >/dev/null 2>&1; then
            if shasum -a 256 -c "$checksum_file"; then
                log_success "Checksum verification passed"
            else
                log_error "Checksum verification failed"  
                return 1
            fi
        fi
    else
        log_warning "No checksum file found: $checksum_file"
    fi
    
    # Verify ZIP integrity
    log "Verifying ZIP integrity..."
    if command -v unzip >/dev/null 2>&1; then
        if unzip -t "$backup_path" >/dev/null 2>&1; then
            log_success "ZIP integrity verification passed"
        else
            log_error "ZIP integrity verification failed"
            return 1
        fi
    else
        log_warning "unzip not available, skipping ZIP integrity check"
    fi
    
    # Display metadata if available
    if [[ -f "$metadata_file" ]]; then
        log "Backup metadata:"
        cat "$metadata_file" | jq . 2>/dev/null || cat "$metadata_file"
    fi
    
    log_success "Backup verification completed successfully"
}

# List available backups
list_backups() {
    log "Available backups in $BACKUP_DIR:"
    
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_warning "Backup directory does not exist: $BACKUP_DIR"
        return 0
    fi
    
    local found_backups=false
    
    for backup_file in "$BACKUP_DIR"/*.zip; do
        if [[ -f "$backup_file" ]]; then
            found_backups=true
            local backup_name=$(basename "$backup_file" .zip)
            local size=""
            
            # Get file size
            if command -v numfmt >/dev/null 2>&1; then
                size=$(numfmt --to=iec-i --suffix=B --padding=7 $(stat -c%s "$backup_file" 2>/dev/null || stat -f%z "$backup_file" 2>/dev/null || echo 0))
            else
                size="$(ls -lh "$backup_file" | awk '{print $5}')"
            fi
            
            local checksum_status="❌"
            if [[ -f "$backup_file.sha256" ]]; then
                checksum_status="✅"
            fi
            
            local metadata_status="❌"  
            if [[ -f "${backup_file%.zip}.metadata.json" ]]; then
                metadata_status="✅"
            fi
            
            printf "  %-40s %s  Checksum: %s  Metadata: %s\n" \
                "$backup_name" "$size" "$checksum_status" "$metadata_status"
        fi
    done
    
    if [[ "$found_backups" == "false" ]]; then
        log "No backups found in $BACKUP_DIR"
    fi
}

# Create backup
create_backup() {
    local backup_name="$1"
    local backup_path="$BACKUP_DIR/${backup_name}.zip"
    
    log "Creating backup: $backup_name"
    log "Source directory: $SOURCE_DIR"
    log "Backup path: $backup_path"
    
    # Ensure backup directory exists
    mkdir -p "$BACKUP_DIR"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY-RUN: Would create backup with the following parameters:"
        log "  - Source: $SOURCE_DIR"
        log "  - Destination: $backup_path"
        log "  - Environment: $ENVIRONMENT"
        log "  - Git hash: $(get_git_hash)"
        
        # Simulate file listing
        log "DRY-RUN: Files that would be included:"
        find "$SOURCE_DIR" -type f | head -10 | while read -r file; do
            log "  - $file"
        done
        local total_files=$(find "$SOURCE_DIR" -type f | wc -l)
        if [[ $total_files -gt 10 ]]; then
            log "  ... and $((total_files - 10)) more files"
        fi
        
        return 0
    fi
    
    # Create ZIP backup
    log "Creating ZIP archive..."
    
    # Exclude common non-essential directories
    local exclude_patterns=(
        "node_modules/*"
        ".git/*"
        "dist/*"
        "build/*"
        "*.log"
        "tmp/*"
        ".DS_Store"
        "*.tmp"
    )
    
    local zip_args=("-r" "$backup_path" "$SOURCE_DIR")
    
    # Add exclude patterns
    for pattern in "${exclude_patterns[@]}"; do
        zip_args+=("-x" "$pattern")
    done
    
    if zip "${zip_args[@]}" >/dev/null 2>&1; then
        log_success "ZIP archive created successfully"
    else
        log_error "Failed to create ZIP archive"
        return 1
    fi
    
    # Calculate checksum
    calculate_checksum "$backup_path"
    
    # Create metadata
    create_metadata "$backup_path"
    
    # Verify the backup we just created
    local backup_basename=$(basename "$backup_path" .zip)
    verify_backup "$backup_basename"
    
    log_success "Backup creation completed: $backup_name"
}

# Main execution function
main() {
    log "🗄️  Starting backup library operations"
    
    # Parse arguments
    parse_args "$@"
    
    # Ensure backup directory exists
    mkdir -p "$BACKUP_DIR"
    
    case "$ACTION" in
        "create")
            if [[ -z "$BACKUP_NAME" ]]; then
                BACKUP_NAME=$(generate_backup_name)
            fi
            create_backup "$BACKUP_NAME"
            ;;
        "verify")
            if [[ -z "$BACKUP_NAME" ]]; then
                log_error "Backup name required for verification. Use --name option"
                exit 1
            fi
            verify_backup "$BACKUP_NAME"
            ;;
        "list")
            list_backups
            ;;
        *)
            log_error "Unknown action: $ACTION"
            show_help
            exit 1
            ;;
    esac
    
    log_success "🎉 Backup library operations completed"
}

# Handle script errors
trap 'log_error "Backup library failed at line $LINENO"' ERR

# Execute main function
main "$@"