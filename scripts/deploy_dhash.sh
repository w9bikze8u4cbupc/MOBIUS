#!/bin/bash
set -euo pipefail

# DHash Deployment Script
# Performs atomic deployment of library data to DHash format with rollback support

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${PROJECT_ROOT}/backups"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_RETENTION_DAYS=7

# Default values
INPUT_FILE=""
OUTPUT_FILE=""
DRY_RUN=false
FORCE_MODE=false
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

# Usage information
usage() {
    cat << EOF
Usage: $0 -i INPUT_FILE -o OUTPUT_FILE [OPTIONS]

Deploy library data to DHash format with atomic operations and rollback support.

Required:
  -i, --input FILE      Input library.json file
  -o, --output FILE     Output library.dhash.json file

Options:
  --dry-run            Perform validation and show what would be done (no changes)
  --force              Skip interactive confirmations
  -v, --verbose        Enable verbose logging
  -h, --help           Show this help message

Examples:
  $0 -i library.json -o library.dhash.json
  $0 --input library.json --output library.dhash.json --dry-run
  $0 -i library.json -o library.dhash.json --force --verbose

EOF
}

# Parse command line arguments
parse_args() {
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
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --force)
                FORCE_MODE=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# Validate inputs
validate_inputs() {
    if [[ -z "$INPUT_FILE" ]]; then
        log_error "Input file is required (-i/--input)"
        exit 1
    fi

    if [[ -z "$OUTPUT_FILE" ]]; then
        log_error "Output file is required (-o/--output)"
        exit 1
    fi

    if [[ ! -f "$INPUT_FILE" ]]; then
        log_error "Input file does not exist: $INPUT_FILE"
        exit 1
    fi

    # Validate JSON format
    if ! jq empty "$INPUT_FILE" 2>/dev/null; then
        log_error "Input file is not valid JSON: $INPUT_FILE"
        exit 1
    fi

    log_info "Validation complete: Input file is valid JSON"
}

# Create backup
create_backup() {
    mkdir -p "$BACKUP_DIR"
    
    local backup_file="${BACKUP_DIR}/library_${TIMESTAMP}.json"
    
    if [[ -f "$OUTPUT_FILE" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would create backup: $backup_file"
            log_info "[DRY RUN] Would backup existing: $OUTPUT_FILE"
        else
            log_info "Creating backup of existing output file"
            cp "$OUTPUT_FILE" "$backup_file"
            
            # Generate checksum
            local checksum_file="${backup_file}.sha256"
            if command -v sha256sum >/dev/null 2>&1; then
                sha256sum "$backup_file" > "$checksum_file"
            elif command -v shasum >/dev/null 2>&1; then
                shasum -a 256 "$backup_file" > "$checksum_file"
            else
                log_warn "No checksum utility available (sha256sum/shasum)"
            fi
            
            log_success "Backup created: $backup_file"
            [[ -f "$checksum_file" ]] && log_success "Checksum created: $checksum_file"
        fi
    else
        log_info "No existing output file to backup"
    fi
}

# Transform library to DHash format
transform_to_dhash() {
    local temp_output="${OUTPUT_FILE}.tmp.${TIMESTAMP}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would transform $INPUT_FILE to DHash format"
        log_info "[DRY RUN] Would write to temporary file: $temp_output"
        log_info "[DRY RUN] Would atomically move to: $OUTPUT_FILE"
        
        # Validate transformation logic without writing
        if ! node -e "
            const fs = require('fs');
            const input = JSON.parse(fs.readFileSync('$INPUT_FILE', 'utf8'));
            
            // Basic DHash transformation validation
            if (!input || typeof input !== 'object') {
                throw new Error('Invalid input structure');
            }
            
            console.log('Input validation passed');
            console.log('Keys found:', Object.keys(input).length);
        "; then
            log_error "Transformation validation failed"
            exit 1
        fi
        
        return 0
    fi

    log_info "Transforming library data to DHash format"
    
    # Create DHash transformation
    node -e "
        const fs = require('fs');
        const path = require('path');
        
        try {
            const input = JSON.parse(fs.readFileSync('$INPUT_FILE', 'utf8'));
            
            // DHash transformation logic
            const dhashOutput = {
                metadata: {
                    version: '1.0.0',
                    format: 'dhash',
                    generated_at: new Date().toISOString(),
                    source_file: path.basename('$INPUT_FILE'),
                    transformation_id: '$(date +%s)'
                },
                hash_algorithm: 'dhash',
                library: input,
                checksums: {},
                deployment: {
                    timestamp: '$TIMESTAMP',
                    environment: process.env.NODE_ENV || 'production'
                }
            };
            
            // Generate checksums for integrity verification
            const crypto = require('crypto');
            dhashOutput.checksums.input_sha256 = crypto
                .createHash('sha256')
                .update(JSON.stringify(input))
                .digest('hex');
            
            dhashOutput.checksums.content_sha256 = crypto
                .createHash('sha256')
                .update(JSON.stringify(dhashOutput.library))
                .digest('hex');
            
            // Write to temporary file for atomic operation
            fs.writeFileSync('$temp_output', JSON.stringify(dhashOutput, null, 2));
            
            console.log('DHash transformation completed successfully');
            console.log('Content checksum:', dhashOutput.checksums.content_sha256);
            
        } catch (error) {
            console.error('Transformation failed:', error.message);
            process.exit(1);
        }
    " || {
        log_error "DHash transformation failed"
        [[ -f "$temp_output" ]] && rm -f "$temp_output"
        exit 1
    }
    
    # Atomic move
    mv "$temp_output" "$OUTPUT_FILE"
    log_success "DHash transformation completed: $OUTPUT_FILE"
}

# Cleanup old backups
cleanup_old_backups() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would cleanup backups older than $BACKUP_RETENTION_DAYS days"
        find "$BACKUP_DIR" -name "library_*.json" -mtime +$BACKUP_RETENTION_DAYS -print 2>/dev/null | while read -r old_backup; do
            log_info "[DRY RUN] Would remove: $old_backup"
        done
        return 0
    fi

    if [[ -d "$BACKUP_DIR" ]]; then
        log_info "Cleaning up backups older than $BACKUP_RETENTION_DAYS days"
        
        local deleted_count=0
        find "$BACKUP_DIR" -name "library_*.json" -mtime +$BACKUP_RETENTION_DAYS -print0 2>/dev/null | while IFS= read -r -d '' old_backup; do
            rm -f "$old_backup" "${old_backup}.sha256"
            log_info "Removed old backup: $(basename "$old_backup")"
            ((deleted_count++))
        done
        
        [[ $deleted_count -gt 0 ]] && log_success "Cleaned up $deleted_count old backups" || log_info "No old backups to clean up"
    fi
}

# Pre-deployment checks
pre_deployment_checks() {
    log_info "Running pre-deployment checks..."
    
    # Check disk space
    local available_space
    if available_space=$(df -BM "$(dirname "$OUTPUT_FILE")" | awk 'NR==2 {print $4}' | sed 's/M//'); then
        if [[ $available_space -lt 100 ]]; then
            log_warn "Low disk space: ${available_space}MB available"
            if [[ "$FORCE_MODE" != "true" ]]; then
                read -p "Continue anyway? (y/N): " -n 1 -r
                echo
                [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
            fi
        fi
    fi
    
    # Check write permissions
    local output_dir
    output_dir=$(dirname "$OUTPUT_FILE")
    if [[ ! -w "$output_dir" ]]; then
        log_error "No write permission to output directory: $output_dir"
        exit 1
    fi
    
    log_success "Pre-deployment checks passed"
}

# Main deployment function
main() {
    log_info "Starting DHash deployment process"
    [[ "$DRY_RUN" == "true" ]] && log_warn "DRY RUN MODE - No changes will be made"
    
    parse_args "$@"
    validate_inputs
    pre_deployment_checks
    
    # Confirmation for non-dry-run, non-force mode
    if [[ "$DRY_RUN" != "true" && "$FORCE_MODE" != "true" ]]; then
        echo
        echo "Deployment Summary:"
        echo "  Input:  $INPUT_FILE"
        echo "  Output: $OUTPUT_FILE"
        echo "  Backup: ${BACKUP_DIR}/library_${TIMESTAMP}.json"
        echo
        read -p "Proceed with deployment? (y/N): " -n 1 -r
        echo
        [[ ! $REPLY =~ ^[Yy]$ ]] && {
            log_info "Deployment cancelled by user"
            exit 0
        }
    fi
    
    create_backup
    transform_to_dhash
    cleanup_old_backups
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_success "Dry run completed successfully - no changes made"
    else
        log_success "DHash deployment completed successfully"
        log_info "Output: $OUTPUT_FILE"
        log_info "Backup: ${BACKUP_DIR}/library_${TIMESTAMP}.json"
    fi
}

# Check for required dependencies
check_dependencies() {
    local missing_deps=()
    
    command -v jq >/dev/null 2>&1 || missing_deps+=("jq")
    command -v node >/dev/null 2>&1 || missing_deps+=("node")
    
    if [[ ${#missing_deps[@]} -ne 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_error "Please install the missing dependencies and try again"
        exit 1
    fi
}

# Error handling
trap 'log_error "Script interrupted"; exit 130' INT
trap 'log_error "Unexpected error on line $LINENO"; exit 1' ERR

# Dependency check
check_dependencies

# Run main function
main "$@"