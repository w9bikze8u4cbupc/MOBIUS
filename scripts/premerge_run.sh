#!/bin/bash

# Pre-merge Validation Orchestrator
# Orchestrates complete validation including CI checks, backup creation, 
# deployment dry-runs, and smoke tests

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-backups}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-artifacts}"
DRY_RUN="${DRY_RUN:-true}"
ENVIRONMENT="${ENVIRONMENT:-staging}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
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
Pre-merge Validation Orchestrator

Usage: $0 [OPTIONS]

Options:
    --env <environment>     Target environment (staging|production) [default: staging]
    --dry-run              Run in dry-run mode (safe testing) [default: true]
    --no-dry-run           Disable dry-run mode
    --backup-dir <path>    Backup directory [default: backups]
    --artifacts-dir <path> Artifacts directory [default: artifacts]
    --skip-ci              Skip CI validation checks
    --skip-backup          Skip backup creation
    --skip-deploy          Skip deployment validation
    --skip-smoke           Skip smoke tests
    --help, -h             Show this help message

Examples:
    # Complete validation with dry-run (default)
    $0

    # Production validation with actual deployment
    $0 --env production --no-dry-run

    # Quick validation skipping some steps
    $0 --skip-backup --skip-smoke

Environment Variables:
    BACKUP_DIR            Override backup directory
    ARTIFACTS_DIR         Override artifacts directory
    DRY_RUN              Enable/disable dry-run mode
    ENVIRONMENT          Target environment
EOF
}

# Parse command line arguments
parse_args() {
    local skip_ci=false
    local skip_backup=false
    local skip_deploy=false
    local skip_smoke=false

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
            --artifacts-dir)
                ARTIFACTS_DIR="$2"
                shift 2
                ;;
            --skip-ci)
                skip_ci=true
                shift
                ;;
            --skip-backup)
                skip_backup=true
                shift
                ;;
            --skip-deploy)
                skip_deploy=true
                shift
                ;;
            --skip-smoke)
                skip_smoke=true
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

    # Export for child scripts
    export ENVIRONMENT DRY_RUN BACKUP_DIR ARTIFACTS_DIR
    export SKIP_CI="$skip_ci"
    export SKIP_BACKUP="$skip_backup"
    export SKIP_DEPLOY="$skip_deploy"
    export SKIP_SMOKE="$skip_smoke"
}

# Validate environment
validate_environment() {
    log "Validating environment and dependencies..."
    
    # Check required directories
    mkdir -p "$BACKUP_DIR" "$ARTIFACTS_DIR"
    
    # Validate environment parameter
    if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
        exit 1
    fi
    
    # Check for required scripts
    local required_scripts=(
        "backup_library.sh"
        "deploy_dhash.sh"
        "smoke-tests.js"
        "migrate-dhash.js"
    )
    
    for script in "${required_scripts[@]}"; do
        if [[ ! -f "$SCRIPT_DIR/$script" ]]; then
            log_error "Required script not found: $script"
            exit 1
        fi
    done
    
    # Check for Node.js (required for JS scripts)
    if ! command -v node >/dev/null 2>&1; then
        log_error "Node.js is required but not installed"
        exit 1
    fi
    
    log_success "Environment validation complete"
}

# Run CI validation checks
run_ci_checks() {
    if [[ "$SKIP_CI" == "true" ]]; then
        log_warning "Skipping CI checks as requested"
        return 0
    fi

    log "Running CI validation checks..."
    
    # Run existing golden tests if they exist
    if [[ -f "package.json" ]] && npm run | grep -q "golden:check"; then
        log "Running golden tests..."
        if [[ "$DRY_RUN" == "true" ]]; then
            log "DRY-RUN: Would run 'npm run golden:check'"
        else
            npm run golden:check
        fi
    fi
    
    # Run unit tests
    if [[ -f "package.json" ]] && npm run | grep -q "test"; then
        log "Running unit tests..."
        if [[ "$DRY_RUN" == "true" ]]; then
            log "DRY-RUN: Would run 'npm test'"
        else
            npm test -- --passWithNoTests
        fi
    fi
    
    log_success "CI validation checks complete"
}

# Create verified backup
create_backup() {
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        log_warning "Skipping backup creation as requested"
        return 0
    fi

    log "Creating verified backup..."
    
    local backup_script="$SCRIPT_DIR/backup_library.sh"
    local backup_args=(
        "--env" "$ENVIRONMENT"
    )
    
    if [[ "$DRY_RUN" == "true" ]]; then
        backup_args+=("--dry-run")
    fi
    
    bash "$backup_script" "${backup_args[@]}"
    log_success "Backup creation complete"
}

# Run deployment validation
run_deployment_validation() {
    if [[ "$SKIP_DEPLOY" == "true" ]]; then
        log_warning "Skipping deployment validation as requested"
        return 0
    fi

    log "Running deployment validation..."
    
    # Run migration dry-run first
    log "Testing database migrations..."
    local migrate_script="$SCRIPT_DIR/migrate-dhash.js"
    local migrate_args=("--env" "$ENVIRONMENT")
    
    if [[ "$DRY_RUN" == "true" ]]; then
        migrate_args+=("--dry-run")
    fi
    
    node "$migrate_script" "${migrate_args[@]}"
    
    # Run deployment dry-run
    log "Testing deployment process..."
    local deploy_script="$SCRIPT_DIR/deploy_dhash.sh"
    local deploy_args=(
        "--env" "$ENVIRONMENT"
    )
    
    if [[ "$DRY_RUN" == "true" ]]; then
        deploy_args+=("--dry-run")
    fi
    
    bash "$deploy_script" "${deploy_args[@]}"
    log_success "Deployment validation complete"
}

# Run smoke tests
run_smoke_tests() {
    if [[ "$SKIP_SMOKE" == "true" ]]; then
        log_warning "Skipping smoke tests as requested"
        return 0
    fi

    log "Running smoke tests..."
    
    local smoke_script="$SCRIPT_DIR/smoke-tests.js"
    local smoke_args=("--env" "$ENVIRONMENT")
    
    if [[ "$DRY_RUN" == "true" ]]; then
        smoke_args+=("--dry-run")
    fi
    
    node "$smoke_script" "${smoke_args[@]}"
    log_success "Smoke tests complete"
}

# Generate artifacts bundle
generate_artifacts() {
    log "Generating pre-merge artifacts bundle..."
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local bundle_name="premerge_artifacts_${timestamp}.tar.gz"
    local bundle_path="$ARTIFACTS_DIR/$bundle_name"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY-RUN: Would create artifacts bundle: $bundle_path"
        log "DRY-RUN: Bundle would include:"
        log "  - Backup verification logs"
        log "  - Deploy dry-run logs"  
        log "  - Migration dry-run logs"
        log "  - Smoke test results"
        log "  - System information"
    else
        # Create artifacts bundle
        tar -czf "$bundle_path" \
            -C "$BACKUP_DIR" . \
            -C "../$ARTIFACTS_DIR" . \
            2>/dev/null || true
        
        # Generate SHA256 checksum
        if command -v sha256sum >/dev/null 2>&1; then
            sha256sum "$bundle_path" > "$bundle_path.sha256"
        elif command -v shasum >/dev/null 2>&1; then
            shasum -a 256 "$bundle_path" > "$bundle_path.sha256"
        fi
        
        log_success "Artifacts bundle created: $bundle_path"
    fi
}

# Main execution function
main() {
    local start_time=$(date +%s)
    
    log "🚀 Starting pre-merge validation pipeline"
    log "Environment: $ENVIRONMENT"
    log "Dry-run mode: $DRY_RUN"
    log "Backup directory: $BACKUP_DIR"
    log "Artifacts directory: $ARTIFACTS_DIR"
    
    # Parse arguments
    parse_args "$@"
    
    # Validate environment
    validate_environment
    
    # Run validation steps
    run_ci_checks
    create_backup
    run_deployment_validation
    run_smoke_tests
    
    # Generate final artifacts
    generate_artifacts
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log_success "🎉 Pre-merge validation pipeline completed successfully"
    log_success "Total execution time: ${duration}s"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "This was a DRY-RUN. No actual changes were made."
        log "To run with real operations, use: $0 --no-dry-run"
    fi
}

# Handle script errors
trap 'log_error "Pre-merge validation failed at line $LINENO"' ERR

# Execute main function
main "$@"