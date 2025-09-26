#!/bin/bash
# MOBIUS Deployment Dry Run
# Validates deployment readiness without affecting production

set -euo pipefail

ENV="${DEPLOY_ENV:-staging}"
DRY_RUN_LOG="${DRY_RUN_LOG:-./logs/deploy-dryrun.log}"
SKIP_BACKUP="${SKIP_BACKUP:-false}"
SKIP_TESTS="${SKIP_TESTS:-false}"

# Ensure log directory exists
mkdir -p "$(dirname "$DRY_RUN_LOG")"

# Function to log with timestamp
log() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$message" | tee -a "$DRY_RUN_LOG"
}

# Function to validate environment
validate_environment() {
    log "=== Environment Validation ==="
    local failures=0
    
    # Check required commands
    local required_commands=("node" "npm" "zip" "git")
    for cmd in "${required_commands[@]}"; do
        if command -v "$cmd" >/dev/null 2>&1; then
            log "✓ PASS: $cmd is available"
        else
            log "✗ FAIL: $cmd is not available"
            ((failures++))
        fi
    done
    
    # Check Node.js version
    if command -v node >/dev/null 2>&1; then
        local node_version
        node_version=$(node --version)
        log "Node.js version: $node_version"
        
        # Check if version is compatible (Node 16+)
        local major_version
        major_version=$(echo "$node_version" | sed 's/v\([0-9]\+\).*/\1/')
        if [[ $major_version -ge 16 ]]; then
            log "✓ PASS: Node.js version compatible"
        else
            log "✗ FAIL: Node.js version too old (need 16+)"
            ((failures++))
        fi
    fi
    
    # Check npm version
    if command -v npm >/dev/null 2>&1; then
        local npm_version
        npm_version=$(npm --version)
        log "npm version: $npm_version"
    fi
    
    # Check Git status
    if [[ -d ".git" ]]; then
        local git_status
        git_status=$(git status --porcelain)
        if [[ -z "$git_status" ]]; then
            log "✓ PASS: Git working directory clean"
        else
            log "✗ WARNING: Git working directory has uncommitted changes"
            log "Uncommitted changes:"
            git status --short | head -10 | while read -r line; do
                log "  $line"
            done
        fi
        
        # Check current branch
        local current_branch
        current_branch=$(git rev-parse --abbrev-ref HEAD)
        log "Current branch: $current_branch"
    else
        log "✗ WARNING: Not a Git repository"
    fi
    
    return $failures
}

# Function to validate dependencies
validate_dependencies() {
    log "=== Dependency Validation ==="
    local failures=0
    
    # Check package.json exists
    if [[ ! -f "package.json" ]]; then
        log "✗ FAIL: package.json not found"
        ((failures++))
        return $failures
    fi
    
    log "✓ PASS: package.json exists"
    
    # Check package-lock.json exists
    if [[ -f "package-lock.json" ]]; then
        log "✓ PASS: package-lock.json exists (will use npm ci)"
    else
        log "⚠ WARNING: package-lock.json not found (will use npm install)"
    fi
    
    # Test dependency installation (dry run)
    log "Testing dependency installation..."
    
    # Create temporary directory for dependency test
    local temp_dir
    temp_dir=$(mktemp -d)
    cp package.json "$temp_dir/"
    if [[ -f "package-lock.json" ]]; then
        cp package-lock.json "$temp_dir/"
    fi
    
    cd "$temp_dir" || {
        log "✗ FAIL: Cannot change to temp directory"
        ((failures++))
        return $failures
    }
    
    # Test installation
    local install_output
    if [[ -f "package-lock.json" ]]; then
        install_output=$(npm ci 2>&1 || echo "npm ci failed")
    else
        install_output=$(npm install 2>&1 || echo "npm install failed")
    fi
    
    # Go back to original directory
    cd - >/dev/null
    
    # Check if installation succeeded
    if echo "$install_output" | grep -q "failed"; then
        log "✗ FAIL: Dependency installation failed"
        log "Error output (last 10 lines):"
        echo "$install_output" | tail -10 | while read -r line; do
            log "  $line"
        done
        ((failures++))
    else
        log "✓ PASS: Dependencies can be installed successfully"
    fi
    
    # Clean up temp directory
    rm -rf "$temp_dir"
    
    return $failures
}

# Function to validate deployment structure
validate_deployment_structure() {
    log "=== Deployment Structure Validation ==="
    local failures=0
    
    # Check required directories
    local required_dirs=("src" "client" "scripts")
    for dir in "${required_dirs[@]}"; do
        if [[ -d "$dir" ]]; then
            log "✓ PASS: Directory $dir exists"
        else
            log "✗ FAIL: Required directory $dir missing"
            ((failures++))
        fi
    done
    
    # Check required scripts
    local required_scripts=(
        "scripts/deploy/backup.sh"
        "scripts/deploy/rollback_dhash.sh"
        "scripts/deploy/smoke_tests.sh"
    )
    
    for script in "${required_scripts[@]}"; do
        if [[ -f "$script" && -x "$script" ]]; then
            log "✓ PASS: Script $script exists and is executable"
        elif [[ -f "$script" ]]; then
            log "⚠ WARNING: Script $script exists but is not executable"
            chmod +x "$script" && log "  Fixed: Made $script executable"
        else
            log "✗ FAIL: Required script $script missing"
            ((failures++))
        fi
    done
    
    # Check configuration files
    if [[ -f ".env.example" ]]; then
        log "✓ PASS: .env.example exists"
    else
        log "⚠ WARNING: .env.example not found"
    fi
    
    return $failures
}

# Function to test backup creation
test_backup_creation() {
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        log "=== Backup Test Skipped ==="
        return 0
    fi
    
    log "=== Backup Creation Test ==="
    local failures=0
    
    # Test backup script
    if [[ -x "./scripts/deploy/backup.sh" ]]; then
        log "Testing backup creation..."
        
        # Create test backup
        local backup_output
        backup_output=$(DEPLOY_ENV="dryrun_test" BACKUP_DIR="./tmp/backup_test" ./scripts/deploy/backup.sh 2>&1 || echo "Backup failed")
        
        if echo "$backup_output" | grep -q "Backup process completed successfully"; then
            log "✓ PASS: Backup creation test successful"
            
            # Extract backup path from output
            local backup_path
            backup_path=$(echo "$backup_output" | grep "BACKUP_PATH=" | cut -d'=' -f2)
            
            if [[ -n "$backup_path" && -f "$backup_path" ]]; then
                local backup_size
                backup_size=$(du -h "$backup_path" | cut -f1)
                log "  Backup size: $backup_size"
                
                # Clean up test backup
                rm -f "$backup_path" "${backup_path}.sha256"
                rmdir "$(dirname "$backup_path")" 2>/dev/null || true
            fi
        else
            log "✗ FAIL: Backup creation test failed"
            log "Error output (last 5 lines):"
            echo "$backup_output" | tail -5 | while read -r line; do
                log "  $line"
            done
            ((failures++))
        fi
    else
        log "✗ FAIL: Backup script not found or not executable"
        ((failures++))
    fi
    
    return $failures
}

# Function to test smoke tests
test_smoke_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        log "=== Smoke Tests Validation Skipped ==="
        return 0
    fi
    
    log "=== Smoke Tests Validation ==="
    local failures=0
    
    if [[ -x "./scripts/deploy/smoke_tests.sh" ]]; then
        log "✓ PASS: Smoke test script exists and is executable"
        
        # Test smoke test script help/validation
        local help_output
        help_output=$(./scripts/deploy/smoke_tests.sh --help 2>&1 || echo "Help failed")
        
        if echo "$help_output" | grep -q "Usage:"; then
            log "✓ PASS: Smoke test script help works"
        else
            log "⚠ WARNING: Smoke test script help may not work properly"
        fi
    else
        log "✗ FAIL: Smoke test script not found or not executable"
        ((failures++))
    fi
    
    return $failures
}

# Function to validate rollback capability
test_rollback_readiness() {
    log "=== Rollback Readiness Test ==="
    local failures=0
    
    if [[ -x "./scripts/deploy/rollback_dhash.sh" ]]; then
        log "✓ PASS: Rollback script exists and is executable"
        
        # Test rollback script help
        local help_output
        help_output=$(./scripts/deploy/rollback_dhash.sh --help 2>&1 || echo "Help failed")
        
        if echo "$help_output" | grep -q "Usage:"; then
            log "✓ PASS: Rollback script help works"
        else
            log "⚠ WARNING: Rollback script help may not work properly"
        fi
        
        # Check if we have any existing backups
        if [[ -d "./backups" ]]; then
            local backup_count
            backup_count=$(find ./backups -name "dhash_*.zip" -type f | wc -l)
            if [[ $backup_count -gt 0 ]]; then
                log "✓ PASS: $backup_count existing backups available for rollback"
            else
                log "⚠ WARNING: No existing backups found"
            fi
        else
            log "⚠ INFO: Backup directory does not exist yet"
        fi
    else
        log "✗ FAIL: Rollback script not found or not executable"
        ((failures++))
    fi
    
    return $failures
}

# Main dry run execution
main() {
    log "=== MOBIUS Deployment Dry Run Starting ==="
    log "Timestamp: $(date)"
    log "Environment: $ENV"
    log "Skip backup test: $SKIP_BACKUP"
    log "Skip smoke test validation: $SKIP_TESTS"
    
    local total_failures=0
    
    # Run all validation tests
    validate_environment || ((total_failures += $?))
    validate_dependencies || ((total_failures += $?))
    validate_deployment_structure || ((total_failures += $?))
    test_backup_creation || ((total_failures += $?))
    test_smoke_tests || ((total_failures += $?))
    test_rollback_readiness || ((total_failures += $?))
    
    log "=== Deployment Dry Run Summary ==="
    if [[ $total_failures -eq 0 ]]; then
        log "✓ ALL VALIDATIONS PASSED: Deployment is ready"
        log "Environment $ENV appears ready for deployment"
        exit 0
    else
        log "✗ VALIDATIONS FAILED: $total_failures validation failures detected"
        log "Address the failures above before proceeding with deployment"
        exit 1
    fi
}

# Handle help argument
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    cat << EOF
Usage: $0 [options]

Performs deployment dry run validation for MOBIUS.

Environment Variables:
  DEPLOY_ENV       Environment name (default: staging)
  DRY_RUN_LOG      Log file path (default: ./logs/deploy-dryrun.log)
  SKIP_BACKUP      Skip backup test (default: false)
  SKIP_TESTS       Skip smoke test validation (default: false)

Exit Codes:
  0   All validations passed
  1   One or more validations failed

Examples:
  $0                              # Run full dry run
  DEPLOY_ENV=production $0        # Test for production deployment
  SKIP_BACKUP=true $0            # Skip backup testing
EOF
    exit 0
fi

# Execute main function
main "$@"