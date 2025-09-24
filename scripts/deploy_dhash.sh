#!/bin/bash

# MOBIUS Dhash Migration Deployment Script
# Automated backup → migrate → deploy → verify workflow

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEFAULT_LIBRARY_FILE="library.json"
DEFAULT_OUTPUT_FILE="library.dhash.json"
DEFAULT_BACKUP_DIR="backups"
LOG_FILE="deploy_dhash_$(date -u +"%Y%m%dT%H%M%SZ").log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DRY_RUN=false
INPUT_FILE=""
OUTPUT_FILE=""
BACKUP_ENABLED=true
HEALTH_CHECK_ENABLED=true
ROLLBACK_MODE=false

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
    
    case $level in
        "ERROR")
            echo -e "${RED}❌ $message${NC}" >&2
            ;;
        "SUCCESS")
            echo -e "${GREEN}✅ $message${NC}"
            ;;
        "WARNING")
            echo -e "${YELLOW}⚠️ $message${NC}"
            ;;
        "INFO")
            echo -e "${BLUE}ℹ️ $message${NC}"
            ;;
    esac
}

# Usage function
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

MOBIUS Dhash Migration Deployment Script

Options:
    --dry-run              Preview deployment without making changes
    -i, --input FILE       Input library file (default: $DEFAULT_LIBRARY_FILE)
    -o, --output FILE      Output dhash library file (default: $DEFAULT_OUTPUT_FILE)
    --no-backup           Skip backup creation
    --no-health-check     Skip health checks
    --rollback            Rollback to previous version
    -h, --help            Show this help message

Examples:
    # Preview deployment
    $0 --dry-run

    # Full deployment with custom files
    $0 -i library.json -o library.dhash.json

    # Rollback deployment
    $0 --rollback -i library.json

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            -i|--input)
                INPUT_FILE="$2"
                shift 2
                ;;
            -o|--output)
                OUTPUT_FILE="$2"
                shift 2
                ;;
            --no-backup)
                BACKUP_ENABLED=false
                shift
                ;;
            --no-health-check)
                HEALTH_CHECK_ENABLED=false
                shift
                ;;
            --rollback)
                ROLLBACK_MODE=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                log "ERROR" "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    # Set default values if not provided
    INPUT_FILE="${INPUT_FILE:-$DEFAULT_LIBRARY_FILE}"
    OUTPUT_FILE="${OUTPUT_FILE:-$DEFAULT_OUTPUT_FILE}"
}

# Validate prerequisites
validate_prerequisites() {
    log "INFO" "Validating prerequisites..."
    
    # Check if we're in the correct directory
    if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
        log "ERROR" "Not in MOBIUS project directory. Expected package.json in parent directory."
        exit 1
    fi
    
    # Check if input file exists (unless rollback mode)
    if [[ ! "$ROLLBACK_MODE" = true && ! -f "$INPUT_FILE" ]]; then
        log "ERROR" "Input file not found: $INPUT_FILE"
        exit 1
    fi
    
    # Check Node.js and npm
    if ! command -v node &> /dev/null; then
        log "ERROR" "Node.js is required but not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log "ERROR" "npm is required but not installed"
        exit 1
    fi
    
    # Check required npm scripts exist
    local required_scripts=("migrate:dhash" "migrate:dry-run" "migrate:rollback")
    for script in "${required_scripts[@]}"; do
        if ! npm run "$script" --silent &> /dev/null; then
            log "WARNING" "npm script '$script' may not be available"
        fi
    done
    
    log "SUCCESS" "Prerequisites validation completed"
}

# Create backup
create_backup() {
    if [[ "$BACKUP_ENABLED" = false ]]; then
        log "INFO" "Backup creation skipped"
        return 0
    fi
    
    log "INFO" "Creating backup..."
    
    local backup_dir="$PROJECT_ROOT/$DEFAULT_BACKUP_DIR"
    local timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
    local backup_file="$backup_dir/library.json.bak.$timestamp"
    
    # Create backup directory if it doesn't exist
    mkdir -p "$backup_dir"
    
    if [[ -f "$INPUT_FILE" ]]; then
        cp "$INPUT_FILE" "$backup_file"
        
        # Generate checksum
        if command -v sha256sum &> /dev/null; then
            sha256sum "$backup_file" > "$backup_file.sha256"
            log "SUCCESS" "Backup created: $backup_file (with checksum)"
        else
            log "SUCCESS" "Backup created: $backup_file"
        fi
    else
        log "WARNING" "Input file $INPUT_FILE not found, skipping backup"
    fi
}

# Run migration dry-run
run_dry_run() {
    log "INFO" "Running migration dry-run..."
    
    local dry_run_output="migrate-dryrun.json"
    
    cd "$PROJECT_ROOT"
    
    if npm run migrate:dry-run -- -i "$INPUT_FILE" --out "$dry_run_output"; then
        log "SUCCESS" "Dry-run completed successfully. Output: $dry_run_output"
        
        # Display dry-run summary
        if [[ -f "$dry_run_output" ]]; then
            local component_count=$(jq '.components | length' "$dry_run_output" 2>/dev/null || echo "unknown")
            log "INFO" "Dry-run shows $component_count components to migrate"
        fi
    else
        log "ERROR" "Dry-run failed"
        return 1
    fi
}

# Run actual migration
run_migration() {
    log "INFO" "Running dhash migration..."
    
    cd "$PROJECT_ROOT"
    
    if npm run migrate:dhash -- -i "$INPUT_FILE" -o "$OUTPUT_FILE" --backup; then
        log "SUCCESS" "Migration completed successfully. Output: $OUTPUT_FILE"
    else
        log "ERROR" "Migration failed"
        return 1
    fi
}

# Run rollback
run_rollback() {
    log "INFO" "Running rollback..."
    
    cd "$PROJECT_ROOT"
    
    if npm run migrate:rollback -- -i "$INPUT_FILE"; then
        log "SUCCESS" "Rollback completed successfully"
    else
        log "ERROR" "Rollback failed"
        return 1
    fi
}

# Health checks
run_health_checks() {
    if [[ "$HEALTH_CHECK_ENABLED" = false ]]; then
        log "INFO" "Health checks skipped"
        return 0
    fi
    
    log "INFO" "Running health checks..."
    
    # Check if server is running (attempt to start if not)
    local health_url="http://localhost:5001/health"
    local metrics_url="http://localhost:5001/metrics/dhash"
    
    # Try to hit health endpoint
    if curl -s --fail "$health_url" &> /dev/null; then
        log "SUCCESS" "Health endpoint is accessible"
        
        # Check metrics endpoint
        if curl -s --fail "$metrics_url" &> /dev/null; then
            log "SUCCESS" "Metrics endpoint is accessible"
        else
            log "WARNING" "Metrics endpoint not accessible at $metrics_url"
        fi
    else
        log "WARNING" "Health endpoint not accessible at $health_url (server may not be running)"
    fi
}

# Deploy verification
run_deployment_verification() {
    log "INFO" "Running deployment verification..."
    
    # Verify output file exists and is valid JSON
    if [[ -f "$OUTPUT_FILE" ]]; then
        if jq empty "$OUTPUT_FILE" 2>/dev/null; then
            log "SUCCESS" "Output file is valid JSON"
            
            # Basic structure verification
            local has_components=$(jq 'has("components")' "$OUTPUT_FILE" 2>/dev/null || echo "false")
            local has_metadata=$(jq 'has("metadata")' "$OUTPUT_FILE" 2>/dev/null || echo "false")
            
            if [[ "$has_components" = "true" ]]; then
                local component_count=$(jq '.components | length' "$OUTPUT_FILE" 2>/dev/null || echo "0")
                log "SUCCESS" "Migration output contains $component_count components"
            else
                log "WARNING" "Migration output missing components section"
            fi
            
            if [[ "$has_metadata" = "true" ]]; then
                log "SUCCESS" "Migration output contains metadata section"
            else
                log "WARNING" "Migration output missing metadata section"
            fi
        else
            log "ERROR" "Output file is not valid JSON"
            return 1
        fi
    else
        log "ERROR" "Output file not found: $OUTPUT_FILE"
        return 1
    fi
}

# Export low-confidence queue for manual review
export_lcm_queue() {
    log "INFO" "Exporting low-confidence queue..."
    
    cd "$PROJECT_ROOT"
    
    if npm run lcm:export -- -i "$OUTPUT_FILE" --include-images --format json; then
        log "SUCCESS" "Low-confidence queue exported for manual review"
    else
        log "WARNING" "Failed to export low-confidence queue (may not be implemented)"
    fi
}

# Main deployment workflow
main() {
    # Parse arguments first
    parse_args "$@"
    
    log "INFO" "Starting MOBIUS Dhash Migration Deployment"
    log "INFO" "Timestamp: $(date -u)"
    log "INFO" "Input file: $INPUT_FILE"
    log "INFO" "Output file: $OUTPUT_FILE"
    log "INFO" "Dry run: $DRY_RUN"
    log "INFO" "Rollback mode: $ROLLBACK_MODE"
    
    # Validate prerequisites
    validate_prerequisites
    
    if [[ "$ROLLBACK_MODE" = true ]]; then
        # Rollback workflow
        run_rollback
        run_health_checks
        log "SUCCESS" "Rollback workflow completed"
    else
        # Normal deployment workflow
        
        # Step 1: Backup
        create_backup
        
        # Step 2: Dry run (always run, even in non-dry-run mode)
        run_dry_run
        
        if [[ "$DRY_RUN" = true ]]; then
            log "SUCCESS" "Dry-run deployment completed. Review $LOG_FILE for details."
            exit 0
        fi
        
        # Step 3: Migration
        run_migration
        
        # Step 4: Verification
        run_deployment_verification
        
        # Step 5: Health checks
        run_health_checks
        
        # Step 6: Export LCM queue
        export_lcm_queue
        
        log "SUCCESS" "Deployment workflow completed successfully"
        log "INFO" "Next steps:"
        log "INFO" "1. Monitor metrics for 30-60 minutes"
        log "INFO" "2. Run smoke tests on /api/compare-images and /api/match-images-phash"
        log "INFO" "3. Check logs for any sandbox/timeout/cleanup errors"
        log "INFO" "4. Review low-confidence queue exports for manual processing"
    fi
    
    log "SUCCESS" "Deployment log saved to: $LOG_FILE"
}

# Handle script interruption
trap 'log "ERROR" "Deployment interrupted"; exit 1' INT TERM

# Run main function with all arguments
main "$@"