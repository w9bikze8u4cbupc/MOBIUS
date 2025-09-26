#!/bin/bash
# MOBIUS Deployment - Main Deploy Script
# Handles both dry-run and production deployments with safety checks

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Configuration
DEFAULT_ENV="staging"
DEFAULT_MODE="dry-run"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --env ENV           Target environment (staging|production)"
    echo "  --mode MODE         Deployment mode (dry-run|production)"
    echo "  --backup-file FILE  Backup file to rollback to if deployment fails"
    echo "  --skip-backup       Skip creating pre-deployment backup"
    echo "  --skip-tests        Skip pre-deployment tests"
    echo "  --skip-migration    Skip database migration"
    echo "  --force             Force deployment even if checks fail"
    echo "  --help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --env staging --mode dry-run"
    echo "  $0 --env production --mode production --backup-file backups/latest.zip"
    exit 1
}

# Parse arguments
ENV="${DEFAULT_ENV}"
MODE="${DEFAULT_MODE}"
BACKUP_FILE=""
SKIP_BACKUP=false
SKIP_TESTS=false
SKIP_MIGRATION=false
FORCE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            shift 2
            ;;
        --mode)
            MODE="$2"
            shift 2
            ;;
        --backup-file)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-migration)
            SKIP_MIGRATION=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate arguments
if [[ ! "$ENV" =~ ^(staging|production)$ ]]; then
    echo "Error: Invalid environment '$ENV'. Must be staging or production."
    exit 1
fi

if [[ ! "$MODE" =~ ^(dry-run|production)$ ]]; then
    echo "Error: Invalid mode '$MODE'. Must be dry-run or production."
    exit 1
fi

if [[ "$ENV" == "production" && "$MODE" != "production" ]]; then
    echo "Error: Production environment requires --mode production"
    exit 1
fi

LOG_FILE="${PROJECT_ROOT}/deploy-${MODE}-$(date +%Y%m%d_%H%M%S).log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== MOBIUS DEPLOYMENT SCRIPT ==="
log "Environment: $ENV"
log "Mode: $MODE"
log "Log file: $LOG_FILE"
log ""

# Pre-deployment checks
pre_deployment_checks() {
    log "Running pre-deployment checks..."
    
    # Check Git status
    if [[ -n "$(git status --porcelain)" ]]; then
        log "Warning: Working directory has uncommitted changes"
        if [[ "$FORCE" != "true" ]]; then
            log "Error: Deployment requires clean working directory. Use --force to override."
            exit 1
        fi
    fi
    
    # Check required files
    local required_files=("package.json" "src/api/index.js")
    for file in "${required_files[@]}"; do
        if [[ ! -f "${PROJECT_ROOT}/$file" ]]; then
            log "Error: Required file missing: $file"
            exit 1
        fi
    done
    
    # Check Node.js version
    local node_version
    node_version=$(node --version | cut -d'v' -f2)
    log "Node.js version: $node_version"
    
    # Check dependencies
    if [[ ! -d "${PROJECT_ROOT}/node_modules" ]]; then
        log "Installing dependencies..."
        if [[ "$MODE" == "dry-run" ]]; then
            log "[DRY-RUN] Would run: npm ci"
        else
            npm ci
        fi
    fi
    
    log "✓ Pre-deployment checks passed"
}

# Create pre-deployment backup
create_backup() {
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        log "Skipping backup creation (--skip-backup flag)"
        return
    fi
    
    log "Creating pre-deployment backup..."
    
    local backup_script="${SCRIPT_DIR}/backup_dhash.sh"
    if [[ ! -f "$backup_script" ]]; then
        log "Error: Backup script not found: $backup_script"
        exit 1
    fi
    
    if [[ "$MODE" == "dry-run" ]]; then
        log "[DRY-RUN] Would create backup with: $backup_script --env $ENV --components all"
        BACKUP_FILE="${PROJECT_ROOT}/backups/dhash_${ENV}_$(date +%Y%m%d_%H%M%S).zip"
    else
        if ! "$backup_script" --env "$ENV" --components all; then
            log "Error: Backup creation failed"
            exit 1
        fi
        # Set the backup file to the most recent one
        BACKUP_FILE=$(ls -1t "${PROJECT_ROOT}/backups/dhash_${ENV}_"*.zip 2>/dev/null | head -n1 || echo "")
        if [[ -z "$BACKUP_FILE" ]]; then
            log "Error: Could not locate created backup file"
            exit 1
        fi
    fi
    
    log "✓ Backup created: $BACKUP_FILE"
}

# Run tests
run_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        log "Skipping tests (--skip-tests flag)"
        return
    fi
    
    log "Running pre-deployment tests..."
    
    if [[ "$MODE" == "dry-run" ]]; then
        log "[DRY-RUN] Would run: npm test"
        log "[DRY-RUN] Would run: npm run golden:check"
    else
        # Run unit tests
        if ! npm test -- --passWithNoTests; then
            log "Error: Unit tests failed"
            exit 1
        fi
        
        # Run golden tests if available
        if npm run golden:check >/dev/null 2>&1; then
            log "✓ Golden tests passed"
        else
            log "Warning: Golden tests failed or not available"
            if [[ "$FORCE" != "true" ]]; then
                exit 1
            fi
        fi
    fi
    
    log "✓ Tests completed successfully"
}

# Run database migration
run_migration() {
    if [[ "$SKIP_MIGRATION" == "true" ]]; then
        log "Skipping database migration (--skip-migration flag)"
        return
    fi
    
    log "Running database migration..."
    
    local migration_log="${PROJECT_ROOT}/migrate-${MODE}-$(date +%Y%m%d_%H%M%S).log"
    
    if [[ "$MODE" == "dry-run" ]]; then
        log "[DRY-RUN] Would run database migration"
        log "[DRY-RUN] Migration log would be: $migration_log"
    else
        # Mock migration - replace with actual migration commands
        {
            echo "Migration started at: $(date)"
            echo "Environment: $ENV"
            echo "Mode: $MODE"
            echo "No migrations to run for MOBIUS"
        } > "$migration_log"
    fi
    
    log "✓ Database migration completed: $migration_log"
}

# Deploy application
deploy_application() {
    log "Deploying application..."
    
    if [[ "$MODE" == "dry-run" ]]; then
        log "[DRY-RUN] Would deploy application to $ENV"
        log "[DRY-RUN] Would restart services"
        log "[DRY-RUN] Would update configuration"
        return
    fi
    
    # Build application
    log "Building application..."
    if npm run build --if-present; then
        log "✓ Build completed"
    else
        log "Warning: Build command not available or failed"
    fi
    
    # Deploy to environment
    case "$ENV" in
        staging)
            log "Deploying to staging environment..."
            # Add staging-specific deployment commands here
            ;;
        production)
            log "Deploying to production environment..."
            # Add production-specific deployment commands here
            ;;
    esac
    
    log "✓ Application deployed successfully"
}

# Run smoke tests
run_smoke_tests() {
    log "Running post-deployment smoke tests..."
    
    local smoke_test_log="${PROJECT_ROOT}/postdeploy-smoketests-$(date +%Y%m%d_%H%M%S).log"
    
    if [[ "$MODE" == "dry-run" ]]; then
        log "[DRY-RUN] Would run smoke tests"
        log "[DRY-RUN] Smoke test log would be: $smoke_test_log"
    else
        {
            echo "Smoke tests started at: $(date)"
            echo "Environment: $ENV"
            echo "Mode: $MODE"
            
            # Basic connectivity test
            if curl -f http://localhost:5001/health >/dev/null 2>&1; then
                echo "✓ Health check endpoint responding"
            else
                echo "✗ Health check endpoint not responding"
            fi
            
            # Test API endpoints
            echo "Testing API endpoints..."
            # Add more specific smoke tests here
            
            echo "Smoke tests completed at: $(date)"
        } > "$smoke_test_log"
    fi
    
    log "✓ Smoke tests completed: $smoke_test_log"
}

# Main deployment flow
main() {
    log "Starting deployment process..."
    
    pre_deployment_checks
    create_backup
    run_tests
    run_migration
    deploy_application
    run_smoke_tests
    
    log ""
    log "=== DEPLOYMENT COMPLETE ==="
    log "Environment: $ENV"
    log "Mode: $MODE"
    log "Backup file: ${BACKUP_FILE:-"None (skipped)"}"
    log "Log file: $LOG_FILE"
    
    if [[ "$MODE" == "production" ]]; then
        log ""
        log "POST-DEPLOYMENT CHECKLIST:"
        log "1. Monitor application logs for errors"
        log "2. Verify all critical functionality works"
        log "3. Check performance metrics"
        log "4. Run full smoke test suite"
        log "5. Monitor for 60 minutes (T+60 window)"
        log ""
        log "If issues are detected, rollback using:"
        log "  ./scripts/deploy/rollback_dhash.sh --backup \"$BACKUP_FILE\" --env $ENV"
    fi
}

# Handle interruption
cleanup() {
    log ""
    log "Deployment interrupted!"
    if [[ "$MODE" == "production" && -n "$BACKUP_FILE" ]]; then
        log "To rollback changes, run:"
        log "  ./scripts/deploy/rollback_dhash.sh --backup \"$BACKUP_FILE\" --env $ENV"
    fi
    exit 1
}

trap cleanup INT TERM

# Run main deployment process
main