#!/bin/bash

###############################################################################
# DHash Migration Deployment Script
# Automated deployment script for MOBIUS DHash pipeline
# 
# Usage: ./deploy_dhash.sh [options]
# Version: 1.0.0
###############################################################################

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEFAULT_LIBRARY="library.json"
DEFAULT_OUTPUT="library.dhash.json"
LOG_DIR="logs"
BACKUP_DIR="backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    if [[ -n "${LOG_FILE:-}" ]]; then
        echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
    else
        echo -e "${BLUE}[INFO]${NC} $1"
    fi
}

log_success() {
    if [[ -n "${LOG_FILE:-}" ]]; then
        echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
    else
        echo -e "${GREEN}[SUCCESS]${NC} $1"
    fi
}

log_warning() {
    if [[ -n "${LOG_FILE:-}" ]]; then
        echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
    else
        echo -e "${YELLOW}[WARNING]${NC} $1"
    fi
}

log_error() {
    if [[ -n "${LOG_FILE:-}" ]]; then
        echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    else
        echo -e "${RED}[ERROR]${NC} $1"
    fi
}

# Print usage information
print_usage() {
    cat << EOF
DHash Migration Deployment Script

Usage: $0 [options]

Options:
    -i, --input FILE        Input library file (default: library.json)
    -o, --output FILE       Output library file (default: library.dhash.json)
    --batch-size NUM        Processing batch size (default: 100)
    --threshold NUM         Similarity threshold (default: 10)
    --skip-backup          Skip backup creation (not recommended)
    --skip-verification    Skip post-deployment verification
    --dry-run              Perform dry run without actual deployment
    --force                Force deployment even with warnings
    -h, --help             Show this help message

Examples:
    $0                                    # Use defaults
    $0 -i my_library.json --batch-size 50
    $0 --dry-run                         # Preview without changes
    $0 --force                           # Override safety checks

Environment Variables:
    DEPLOYMENT_ENV          Deployment environment (dev/staging/prod)
    SKIP_HEALTH_CHECKS     Skip health checks after deployment
    BACKUP_RETENTION_DAYS  Days to retain backups (default: 30)

EOF
}

# Parse command line arguments
parse_args() {
    INPUT_FILE="$DEFAULT_LIBRARY"
    OUTPUT_FILE="$DEFAULT_OUTPUT"
    BATCH_SIZE=100
    THRESHOLD=10
    SKIP_BACKUP=false
    SKIP_VERIFICATION=false
    DRY_RUN=false
    FORCE=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -i|--input)
                INPUT_FILE="$2"
                shift 2
                ;;
            -o|--output)
                OUTPUT_FILE="$2"
                shift 2
                ;;
            --batch-size)
                BATCH_SIZE="$2"
                shift 2
                ;;
            --threshold)
                THRESHOLD="$2"
                shift 2
                ;;
            --skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            --skip-verification)
                SKIP_VERIFICATION=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done
}

# Setup logging and directories
setup_environment() {
    # Create required directories
    mkdir -p "$LOG_DIR" "$BACKUP_DIR"
    
    # Setup log file
    TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
    LOG_FILE="$LOG_DIR/deployment-$TIMESTAMP.log"
    
    log_info "Starting DHash deployment at $(date)"
    log_info "Script version: 1.0.0"
    log_info "Input file: $INPUT_FILE"
    log_info "Output file: $OUTPUT_FILE"
    log_info "Batch size: $BATCH_SIZE"
    log_info "Threshold: $THRESHOLD"
    log_info "Dry run: $DRY_RUN"
    
    # Environment detection
    DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-dev}"
    log_info "Deployment environment: $DEPLOYMENT_ENV"
}

# Validate prerequisites
validate_prerequisites() {
    log_info "Validating prerequisites..."
    
    local errors=0
    
    # Check Node.js version
    if ! node --version | grep -E "^v(18|19|20|21)" > /dev/null; then
        log_error "Node.js 18+ required. Current version: $(node --version)"
        ((errors++))
    fi
    
    # Check npm
    if ! npm --version > /dev/null 2>&1; then
        log_error "npm not found"
        ((errors++))
    fi
    
    # Check FFmpeg
    if ! ffmpeg -version > /dev/null 2>&1; then
        log_error "FFmpeg not found in PATH"
        ((errors++))
    fi
    
    # Check input file exists
    if [[ ! -f "$INPUT_FILE" ]]; then
        log_error "Input file not found: $INPUT_FILE"
        ((errors++))
    fi
    
    # Check if npm modules are installed
    if [[ ! -d "node_modules" ]]; then
        log_warning "node_modules not found, running npm ci..."
        if ! npm ci; then
            log_error "Failed to install dependencies"
            ((errors++))
        fi
    fi
    
    # Check disk space (require at least 1GB free)
    local free_space_mb=$(df . | tail -1 | awk '{print $4}')
    if [[ $free_space_mb -lt 1048576 ]]; then  # 1GB in KB
        log_warning "Low disk space: $(($free_space_mb / 1024))MB available"
        if [[ "$FORCE" != "true" ]]; then
            log_error "Insufficient disk space. Use --force to override."
            ((errors++))
        fi
    fi
    
    if [[ $errors -gt 0 ]]; then
        log_error "Prerequisites validation failed with $errors errors"
        return 1
    fi
    
    log_success "Prerequisites validation passed"
    return 0
}

# Create backup
create_backup() {
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        log_warning "Skipping backup creation (--skip-backup specified)"
        return 0
    fi
    
    log_info "Creating backup of $INPUT_FILE..."
    
    local backup_timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
    BACKUP_FILE="$BACKUP_DIR/$(basename "$INPUT_FILE").bak.$backup_timestamp"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would create backup at $BACKUP_FILE"
        return 0
    fi
    
    cp "$INPUT_FILE" "$BACKUP_FILE"
    
    # Verify backup integrity
    local original_size=$(stat -c%s "$INPUT_FILE")
    local backup_size=$(stat -c%s "$BACKUP_FILE")
    
    if [[ "$original_size" != "$backup_size" ]]; then
        log_error "Backup verification failed - size mismatch"
        return 1
    fi
    
    # Create checksum
    sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
    
    log_success "Backup created and verified: $BACKUP_FILE"
    
    # Cleanup old backups
    cleanup_old_backups
}

# Cleanup old backup files
cleanup_old_backups() {
    local retention_days="${BACKUP_RETENTION_DAYS:-30}"
    log_info "Cleaning up backups older than $retention_days days..."
    
    find "$BACKUP_DIR" -name "*.bak.*" -type f -mtime +$retention_days -exec rm -f {} \;
    find "$BACKUP_DIR" -name "*.sha256" -type f -mtime +$retention_days -exec rm -f {} \;
}

# Perform migration
run_migration() {
    log_info "Running DHash migration..."
    
    local migration_args=(
        "-i" "$INPUT_FILE"
        "-o" "$OUTPUT_FILE"
        "--batch-size" "$BATCH_SIZE"
        "--threshold" "$THRESHOLD"
    )
    
    if [[ "$DRY_RUN" == "true" ]]; then
        migration_args+=("--dry-run")
    fi
    
    # Add backup flag if not skipped and not dry run
    if [[ "$SKIP_BACKUP" != "true" && "$DRY_RUN" != "true" ]]; then
        migration_args+=("--backup")
    fi
    
    log_info "Migration command: npm run migrate:dhash ${migration_args[*]}"
    
    # Run migration with timeout
    local start_time=$(date +%s)
    
    if ! timeout 1800 npm run migrate:dhash "${migration_args[@]}" 2>&1 | tee -a "$LOG_FILE"; then
        log_error "Migration failed or timed out after 30 minutes"
        return 1
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log_success "Migration completed in ${duration}s"
    
    if [[ "$DRY_RUN" != "true" ]]; then
        validate_migration_results
    fi
}

# Validate migration results
validate_migration_results() {
    log_info "Validating migration results..."
    
    if [[ ! -f "$OUTPUT_FILE" ]]; then
        log_error "Output file not created: $OUTPUT_FILE"
        return 1
    fi
    
    # Validate JSON structure
    if ! node -e "JSON.parse(require('fs').readFileSync('$OUTPUT_FILE', 'utf8'))" 2>/dev/null; then
        log_error "Output file is not valid JSON"
        return 1
    fi
    
    # Extract statistics
    local stats=$(node -e "
        const fs = require('fs');
        const lib = JSON.parse(fs.readFileSync('$OUTPUT_FILE', 'utf8'));
        const total = lib.images?.length || 0;
        const withDHash = lib.images?.filter(img => img.dhash).length || 0;
        const errors = lib.dhash_migration?.processing_errors || 0;
        const duplicates = lib.dhash_migration?.duplicates_found || 0;
        console.log(JSON.stringify({total, withDHash, errors, duplicates}));
    " 2>/dev/null)
    
    if [[ -n "$stats" ]]; then
        local total=$(echo "$stats" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).total")
        local with_dhash=$(echo "$stats" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).withDHash")
        local errors=$(echo "$stats" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).errors")
        local duplicates=$(echo "$stats" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).duplicates")
        
        log_info "Migration statistics:"
        log_info "  Total images: $total"
        log_info "  Images with DHash: $with_dhash"
        log_info "  Processing errors: $errors"
        log_info "  Duplicates found: $duplicates"
        
        # Validate success rate
        if [[ $total -gt 0 ]]; then
            local success_rate=$((with_dhash * 100 / total))
            if [[ $success_rate -lt 90 && "$FORCE" != "true" ]]; then
                log_error "Low success rate: ${success_rate}%. Use --force to override."
                return 1
            fi
            log_info "  Success rate: ${success_rate}%"
        fi
    else
        log_warning "Could not extract migration statistics"
    fi
    
    log_success "Migration results validation passed"
}

# Deploy the migrated library
deploy_library() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would deploy $OUTPUT_FILE to replace $INPUT_FILE"
        return 0
    fi
    
    log_info "Deploying migrated library..."
    
    # Create pre-deployment backup
    local pre_deploy_backup="${INPUT_FILE}.pre-deploy.$(date -u +"%Y%m%dT%H%M%SZ")"
    cp "$INPUT_FILE" "$pre_deploy_backup"
    
    # Atomic deployment
    if ! mv "$OUTPUT_FILE" "$INPUT_FILE"; then
        log_error "Failed to deploy library file"
        # Restore from pre-deployment backup
        mv "$pre_deploy_backup" "$INPUT_FILE"
        return 1
    fi
    
    log_success "Library deployed successfully"
    log_info "Pre-deployment backup: $pre_deploy_backup"
}

# Export low-confidence matches
export_low_confidence_queue() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would export low-confidence queue"
        return 0
    fi
    
    log_info "Exporting low-confidence matches..."
    
    if npm run lcm:export -i "$INPUT_FILE" -o "low-confidence-queue.json" --min-distance 8 --max-distance 15 2>&1 | tee -a "$LOG_FILE"; then
        # Check if any matches were found
        local match_count=$(node -e "
            const fs = require('fs');
            try {
                const queue = JSON.parse(fs.readFileSync('low-confidence-queue.json', 'utf8'));
                console.log(queue.totalMatches || 0);
            } catch(e) {
                console.log(0);
            }
        " 2>/dev/null)
        
        if [[ "$match_count" -gt 0 ]]; then
            log_info "Exported $match_count low-confidence matches for review"
        else
            log_info "No low-confidence matches found"
        fi
    else
        log_warning "Failed to export low-confidence queue (non-critical)"
    fi
}

# Perform post-deployment verification
verify_deployment() {
    if [[ "$SKIP_VERIFICATION" == "true" ]]; then
        log_warning "Skipping post-deployment verification (--skip-verification specified)"
        return 0
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would perform post-deployment verification"
        return 0
    fi
    
    log_info "Performing post-deployment verification..."
    
    # Test DHash functionality
    if node -e "
        const { DHashProcessor } = require('./src/dhash.js');
        const processor = new DHashProcessor();
        console.log('DHash processor initialized successfully');
    " 2>&1 | tee -a "$LOG_FILE"; then
        log_success "DHash functionality test passed"
    else
        log_error "DHash functionality test failed"
        return 1
    fi
    
    # Health check endpoint (if available)
    if [[ -z "${SKIP_HEALTH_CHECKS:-}" ]]; then
        local health_url="http://localhost:5001/health"
        if command -v curl > /dev/null && curl -s --connect-timeout 5 "$health_url" > /dev/null 2>&1; then
            log_success "Health check passed: $health_url"
        else
            log_warning "Health check unavailable or failed: $health_url"
        fi
    fi
    
    log_success "Post-deployment verification completed"
}

# Main rollback function
rollback_deployment() {
    log_error "Rolling back deployment..."
    
    if [[ -n "${BACKUP_FILE:-}" && -f "$BACKUP_FILE" ]]; then
        cp "$BACKUP_FILE" "$INPUT_FILE"
        log_success "Rollback completed using backup: $BACKUP_FILE"
    elif [[ -f "${INPUT_FILE}.pre-deploy.*" ]]; then
        local latest_backup=$(ls -t "${INPUT_FILE}".pre-deploy.* | head -1)
        cp "$latest_backup" "$INPUT_FILE"
        log_success "Rollback completed using: $latest_backup"
    else
        log_error "No suitable backup found for rollback"
        return 1
    fi
}

# Generate deployment report
generate_report() {
    local report_file="$LOG_DIR/deployment-report-$(date +%Y%m%d-%H%M%S).json"
    
    local end_timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local total_duration=$(($(date +%s) - DEPLOYMENT_START_TIME))
    
    cat > "$report_file" << EOF
{
  "deployment_report": {
    "version": "1.0.0",
    "timestamp": "$end_timestamp",
    "duration_seconds": $total_duration,
    "input_file": "$INPUT_FILE",
    "output_file": "$OUTPUT_FILE",
    "batch_size": $BATCH_SIZE,
    "threshold": $THRESHOLD,
    "dry_run": $DRY_RUN,
    "force": $FORCE,
    "skip_backup": $SKIP_BACKUP,
    "skip_verification": $SKIP_VERIFICATION,
    "backup_file": "${BACKUP_FILE:-null}",
    "deployment_environment": "$DEPLOYMENT_ENV",
    "log_file": "$LOG_FILE",
    "success": true
  }
}
EOF
    
    log_info "Deployment report generated: $report_file"
}

# Signal handlers for cleanup
cleanup_on_exit() {
    local exit_code=$?
    
    if [[ $exit_code -ne 0 ]]; then
        log_error "Deployment failed with exit code: $exit_code"
        
        # Attempt rollback if not in dry run mode
        if [[ "$DRY_RUN" != "true" ]]; then
            rollback_deployment || true
        fi
    fi
    
    # Cleanup temporary files
    # Add any cleanup logic here
    
    log_info "Deployment script finished at $(date)"
}

# Main execution function
main() {
    DEPLOYMENT_START_TIME=$(date +%s)
    
    # Set up signal handlers
    trap cleanup_on_exit EXIT
    trap "log_error 'Script interrupted'; exit 1" INT TERM
    
    # Parse arguments and setup
    parse_args "$@"
    setup_environment
    
    # Main deployment pipeline
    log_info "=== DHash Deployment Pipeline Started ==="
    
    validate_prerequisites || exit 1
    create_backup || exit 1
    run_migration || exit 1
    
    if [[ "$DRY_RUN" != "true" ]]; then
        deploy_library || exit 1
        export_low_confidence_queue || true  # Non-critical
        verify_deployment || exit 1
        generate_report
    fi
    
    log_success "=== DHash Deployment Pipeline Completed Successfully ==="
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "This was a dry run - no actual changes were made"
    else
        log_info "Review the deployment log: $LOG_FILE"
        if [[ -f "low-confidence-queue.json" ]]; then
            log_info "Review low-confidence matches: low-confidence-queue.json"
        fi
    fi
}

# Execute main function with all arguments
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi