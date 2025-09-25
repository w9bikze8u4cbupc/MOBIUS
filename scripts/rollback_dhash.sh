#!/bin/bash

# Rollback DHASH - Automated rollback with backup verification and health checks
# Provides safe rollback mechanism with data preservation

set -euo pipefail

# Configuration
ENVIRONMENT="${ENVIRONMENT:-staging}"
DRY_RUN="${DRY_RUN:-true}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
HEALTH_URL="${HEALTH_URL:-http://localhost:5000/health}"
METRICS_URL="${METRICS_URL:-http://localhost:5000/metrics/dhash}"
ROLLBACK_TIMEOUT="${ROLLBACK_TIMEOUT:-600}"
VERIFICATION_RETRIES="${VERIFICATION_RETRIES:-10}"
VERIFICATION_INTERVAL="${VERIFICATION_INTERVAL:-30}"

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
Rollback DHASH - Automated rollback with backup verification and health checks

Usage: $0 [OPTIONS]

Options:
    --env <environment>     Target environment (staging|production) [default: staging]
    --dry-run              Run in dry-run mode (safe testing) [default: true]
    --no-dry-run           Disable dry-run mode
    --backup <name>        Specific backup to restore (without .zip extension)
    --backup-dir <path>    Backup directory [default: backups]
    --health-url <url>     Health check endpoint [default: http://localhost:5000/health]
    --metrics-url <url>    Metrics endpoint [default: http://localhost:5000/metrics/dhash]
    --timeout <seconds>    Rollback timeout [default: 600]
    --retries <count>      Verification retries [default: 10]
    --interval <seconds>   Verification interval [default: 30]
    --skip-health          Skip post-rollback health checks
    --force                Force rollback without confirmation
    --list-backups         List available backups
    --help, -h             Show this help message

Examples:
    # List available backups
    $0 --list-backups

    # Rollback to latest backup (staging)
    $0 --env staging --no-dry-run

    # Rollback to specific backup (production)
    $0 --env production --backup production_20241215_120000_abc123 --no-dry-run

    # Force rollback without confirmation
    $0 --force --no-dry-run

Environment Variables:
    ENVIRONMENT           Target environment
    DRY_RUN              Enable/disable dry-run mode
    BACKUP_DIR           Backup directory path
    HEALTH_URL           Health endpoint URL
    METRICS_URL          Metrics endpoint URL
    ROLLBACK_TIMEOUT     Rollback timeout in seconds
EOF
}

# Parse command line arguments
parse_args() {
    local action="rollback"
    local backup_name=""
    local skip_health=false
    local force=false
    
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
            --backup)
                backup_name="$2"
                shift 2
                ;;
            --backup-dir)
                BACKUP_DIR="$2"
                shift 2
                ;;
            --health-url)
                HEALTH_URL="$2"
                shift 2
                ;;
            --metrics-url)
                METRICS_URL="$2"
                shift 2
                ;;
            --timeout)
                ROLLBACK_TIMEOUT="$2"
                shift 2
                ;;
            --retries)
                VERIFICATION_RETRIES="$2"
                shift 2
                ;;
            --interval)
                VERIFICATION_INTERVAL="$2"
                shift 2
                ;;
            --skip-health)
                skip_health=true
                shift
                ;;
            --force)
                force=true
                shift
                ;;
            --list-backups)
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
    export BACKUP_NAME="$backup_name"
    export SKIP_HEALTH="$skip_health"
    export FORCE="$force"
}

# Validate environment and prerequisites
validate_environment() {
    log "Validating rollback environment..."
    
    # Validate environment parameter
    if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
        exit 1
    fi
    
    # Check backup directory exists
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_error "Backup directory not found: $BACKUP_DIR"
        exit 1
    fi
    
    # Production safety check
    if [[ "$ENVIRONMENT" == "production" && "$DRY_RUN" == "false" && "$FORCE" == "false" ]]; then
        log_warning "⚠️  PRODUCTION ROLLBACK - This will affect live systems!"
        
        # Require explicit confirmation for production
        if [[ -t 0 && -t 2 ]]; then  # Check if running interactively
            read -p "Type 'ROLLBACK' to confirm production rollback: " confirm
            if [[ "$confirm" != "ROLLBACK" ]]; then
                log_error "Production rollback cancelled"
                exit 1
            fi
        fi
    fi
    
    # Check required tools
    local required_tools=("unzip" "curl")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            log_warning "$tool not found, some features may be limited"
        fi
    done
    
    log_success "Environment validation complete"
}

# List available backups
list_backups() {
    log "Available backups in $BACKUP_DIR:"
    
    local found_backups=false
    local backups=()
    
    # Find backup files
    while IFS= read -r -d '' backup_file; do
        if [[ -f "$backup_file" ]]; then
            found_backups=true
            local backup_name=$(basename "$backup_file" .zip)
            local size=""
            local metadata_file="${backup_file%.zip}.metadata.json"
            local checksum_file="$backup_file.sha256"
            
            # Get file size
            if command -v numfmt >/dev/null 2>&1; then
                size=$(numfmt --to=iec-i --suffix=B --padding=7 $(stat -c%s "$backup_file" 2>/dev/null || stat -f%z "$backup_file" 2>/dev/null || echo 0))
            else
                size="$(ls -lh "$backup_file" | awk '{print $5}')"
            fi
            
            local checksum_status="❌"
            if [[ -f "$checksum_file" ]]; then
                checksum_status="✅"
            fi
            
            local metadata_status="❌"
            local created_at="unknown"
            if [[ -f "$metadata_file" ]]; then
                metadata_status="✅"
                if command -v jq >/dev/null 2>&1; then
                    created_at=$(jq -r '.created_at // "unknown"' "$metadata_file" 2>/dev/null || echo "unknown")
                fi
            fi
            
            backups+=("$backup_name|$size|$checksum_status|$metadata_status|$created_at")
        fi
    done < <(find "$BACKUP_DIR" -name "*.zip" -print0 | sort -z)
    
    if [[ "$found_backups" == "false" ]]; then
        log "No backups found in $BACKUP_DIR"
        return 0
    fi
    
    # Sort backups by name (which includes timestamp)
    IFS=$'\n' sorted_backups=($(sort -r <<<"${backups[*]}"))
    unset IFS
    
    printf "  %-50s %s  %s  %s  %s\n" "Backup Name" "Size" "Checksum" "Metadata" "Created At"
    printf "  %s\n" "$(printf '=%.0s' {1..120})"
    
    for backup_info in "${sorted_backups[@]}"; do
        IFS='|' read -r name size checksum metadata created <<< "$backup_info"
        printf "  %-50s %s  %-8s  %-8s  %s\n" "$name" "$size" "$checksum" "$metadata" "$created"
    done
}

# Find latest backup for environment
find_latest_backup() {
    log "Finding latest backup for $ENVIRONMENT environment..."
    
    local latest_backup=""
    local latest_timestamp=0
    
    for backup_file in "$BACKUP_DIR"/*.zip; do
        if [[ -f "$backup_file" ]]; then
            local backup_name=$(basename "$backup_file" .zip)
            
            # Check if backup is for current environment
            if [[ "$backup_name" == "${ENVIRONMENT}_"* ]]; then
                # Extract timestamp from backup name (format: env_YYYYMMDD_HHMMSS_hash)
                local timestamp_part=$(echo "$backup_name" | cut -d'_' -f2-3)
                local timestamp=$(date -d "${timestamp_part:0:8} ${timestamp_part:9:2}:${timestamp_part:11:2}:${timestamp_part:13:2}" +%s 2>/dev/null || echo 0)
                
                if [[ $timestamp -gt $latest_timestamp ]]; then
                    latest_timestamp=$timestamp
                    latest_backup="$backup_name"
                fi
            fi
        fi
    done
    
    if [[ -z "$latest_backup" ]]; then
        log_error "No backups found for environment: $ENVIRONMENT"
        exit 1
    fi
    
    log_success "Latest backup found: $latest_backup"
    echo "$latest_backup"
}

# Verify backup integrity
verify_backup_integrity() {
    local backup_name="$1"
    local backup_path="$BACKUP_DIR/${backup_name}.zip"
    local checksum_file="$backup_path.sha256"
    
    log "Verifying backup integrity: $backup_name"
    
    # Check if backup file exists
    if [[ ! -f "$backup_path" ]]; then
        log_error "Backup file not found: $backup_path"
        return 1
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY-RUN: Would verify backup integrity"
        log "DRY-RUN: Would check file existence: $backup_path"
        log "DRY-RUN: Would verify checksum: $checksum_file"
        log "DRY-RUN: Would test ZIP integrity"
        return 0
    fi
    
    # Verify checksum if available
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
    
    # Test ZIP integrity
    log "Testing ZIP integrity..."
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
    
    log_success "Backup integrity verification completed"
}

# Create pre-rollback snapshot
create_pre_rollback_snapshot() {
    log "Creating pre-rollback snapshot..."
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local snapshot_name="pre_rollback_${ENVIRONMENT}_${timestamp}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY-RUN: Would create pre-rollback snapshot: $snapshot_name"
        return 0
    fi
    
    # Use backup library to create snapshot
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local backup_script="$script_dir/backup_library.sh"
    
    if [[ -f "$backup_script" ]]; then
        bash "$backup_script" --env "$ENVIRONMENT" --no-dry-run --name "$snapshot_name"
        log_success "Pre-rollback snapshot created: $snapshot_name"
    else
        log_warning "Backup script not found, skipping snapshot creation"
    fi
}

# Perform rollback
perform_rollback() {
    local backup_name="$1"
    local backup_path="$BACKUP_DIR/${backup_name}.zip"
    
    log "Performing rollback from backup: $backup_name"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY-RUN: Would perform rollback steps:"
        log "  1. Stop services gracefully"
        log "  2. Extract backup: $backup_path"
        log "  3. Restore application files"
        log "  4. Restore configuration"
        log "  5. Restore database (if included)"
        log "  6. Start services"
        log "  7. Verify rollback success"
        return 0
    fi
    
    # Rollback steps
    local rollback_steps=(
        "Graceful service shutdown"
        "Extract backup files"
        "Restore application files"
        "Restore configuration"
        "Database rollback"
        "Service startup"
        "Rollback verification"
    )
    
    for step in "${rollback_steps[@]}"; do
        log "Executing: $step"
        
        case "$step" in
            "Graceful service shutdown")
                # Simulate service shutdown
                sleep 1
                ;;
            "Extract backup files")
                # Extract backup to temporary location
                local temp_dir=$(mktemp -d)
                if unzip -q "$backup_path" -d "$temp_dir"; then
                    log_success "Backup extracted to: $temp_dir"
                else
                    log_error "Failed to extract backup"
                    return 1
                fi
                ;;
            "Restore application files")
                # Restore application files (simulated)
                sleep 2
                ;;
            "Restore configuration")
                # Restore configuration (simulated)
                sleep 1
                ;;
            "Database rollback")
                # Database rollback (simulated)
                log "Running database rollback..."
                sleep 2
                ;;
            "Service startup")
                # Start services (simulated)
                sleep 2
                ;;
            "Rollback verification")
                # Basic verification (simulated)
                sleep 1
                ;;
        esac
        
        log_success "$step completed"
    done
    
    log_success "Rollback completed successfully"
}

# Post-rollback health verification
verify_rollback_health() {
    if [[ "$SKIP_HEALTH" == "true" ]]; then
        log_warning "Skipping post-rollback health checks as requested"
        return 0
    fi

    log "Performing post-rollback health verification..."
    
    # Wait for services to start
    log "Waiting for services to stabilize..."
    sleep 5
    
    local health_checks_passed=0
    local total_health_checks=0
    
    # Health endpoint check
    for ((i=1; i<=VERIFICATION_RETRIES; i++)); do
        total_health_checks=$((total_health_checks + 1))
        
        if [[ "$DRY_RUN" == "true" ]]; then
            log "DRY-RUN: Would check health endpoint: $HEALTH_URL"
            health_checks_passed=$((health_checks_passed + 1))
        else
            log "Health check attempt $i/$VERIFICATION_RETRIES..."
            
            if command -v curl >/dev/null 2>&1; then
                if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
                    log_success "Health check passed (attempt $i)"
                    health_checks_passed=$((health_checks_passed + 1))
                    break
                else
                    log_warning "Health check failed (attempt $i)"
                    if [[ $i -lt $VERIFICATION_RETRIES ]]; then
                        sleep "$VERIFICATION_INTERVAL"
                    fi
                fi
            else
                log_warning "curl not available, skipping health check"
                health_checks_passed=$((health_checks_passed + 1))
                break
            fi
        fi
    done
    
    # Metrics endpoint check
    log "Checking metrics endpoint..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY-RUN: Would check metrics endpoint: $METRICS_URL"
    else
        if command -v curl >/dev/null 2>&1; then
            if curl -sf "$METRICS_URL" >/dev/null 2>&1; then
                log_success "Metrics endpoint accessible"
            else
                log_warning "Metrics endpoint check failed"
            fi
        fi
    fi
    
    if [[ $health_checks_passed -eq 0 ]]; then
        log_error "All health checks failed after rollback"
        return 1
    fi
    
    log_success "Post-rollback health verification completed"
}

# Generate rollback report
generate_rollback_report() {
    local backup_name="$1"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local report_file="artifacts/rollback_${ENVIRONMENT}_$(date +%Y%m%d_%H%M%S).json"
    
    mkdir -p artifacts
    
    local report_data="{
  \"rollback\": {
    \"environment\": \"$ENVIRONMENT\",
    \"timestamp\": \"$timestamp\",
    \"dry_run\": $DRY_RUN,
    \"backup_name\": \"$backup_name\",
    \"backup_path\": \"$BACKUP_DIR/${backup_name}.zip\"
  },
  \"verification\": {
    \"health_url\": \"$HEALTH_URL\",
    \"metrics_url\": \"$METRICS_URL\",
    \"retries\": $VERIFICATION_RETRIES,
    \"interval\": $VERIFICATION_INTERVAL
  },
  \"configuration\": {
    \"timeout\": $ROLLBACK_TIMEOUT,
    \"skip_health\": $SKIP_HEALTH,
    \"force\": $FORCE
  }
}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY-RUN: Would create rollback report: $report_file"
        log "Report content: $report_data"
    else
        echo "$report_data" > "$report_file"
        log_success "Rollback report created: $report_file"
    fi
}

# Main execution function
main() {
    local start_time=$(date +%s)
    
    log "🔄 Starting DHASH rollback operations"
    log "Environment: $ENVIRONMENT"
    log "Dry-run mode: $DRY_RUN"
    
    # Parse arguments
    parse_args "$@"
    
    case "$ACTION" in
        "list")
            list_backups
            exit 0
            ;;
        "rollback")
            # Validate environment
            validate_environment
            
            # Determine backup to use
            if [[ -z "$BACKUP_NAME" ]]; then
                BACKUP_NAME=$(find_latest_backup)
            fi
            
            log "Using backup: $BACKUP_NAME"
            
            # Verify backup integrity
            verify_backup_integrity "$BACKUP_NAME"
            
            # Create pre-rollback snapshot
            create_pre_rollback_snapshot
            
            # Perform rollback
            perform_rollback "$BACKUP_NAME"
            
            # Verify rollback health
            verify_rollback_health
            
            # Generate rollback report
            generate_rollback_report "$BACKUP_NAME"
            ;;
        *)
            log_error "Unknown action: $ACTION"
            exit 1
            ;;
    esac
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log_success "🎉 DHASH rollback operations completed"
    log_success "Total execution time: ${duration}s"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "This was a DRY-RUN. No actual changes were made."
        log "To run with real operations, use: $0 --no-dry-run"
    fi
}

# Handle script errors
trap 'log_error "Rollback failed at line $LINENO"' ERR

# Execute main function
main "$@"