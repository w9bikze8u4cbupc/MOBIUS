#!/bin/bash
# MOBIUS Pre-Merge Orchestration
# Coordinates all pre-merge gates and validations

set -euo pipefail

ORCHESTRATION_LOG="${ORCHESTRATION_LOG:-./logs/premerge_orchestration.log}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-./premerge_artifacts}"
ENV="${DEPLOY_ENV:-production}"
SKIP_BACKUP="${SKIP_BACKUP:-false}"
SKIP_GOLDEN="${SKIP_GOLDEN:-false}"
SKIP_SMOKE="${SKIP_SMOKE:-false}"

# Ensure directories exist
mkdir -p "$(dirname "$ORCHESTRATION_LOG")" "$ARTIFACTS_DIR"

# Function to log with timestamp
log() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$message" | tee -a "$ORCHESTRATION_LOG"
}

# Function to run step with error handling
run_step() {
    local step_name="$1"
    local step_command="$2"
    local continue_on_failure="${3:-false}"
    
    log "=== STEP: $step_name ==="
    log "Command: $step_command"
    
    local step_log="$ARTIFACTS_DIR/step_${step_name// /_}.log"
    local start_time
    start_time=$(date +%s)
    
    # Execute step
    if eval "$step_command" > "$step_log" 2>&1; then
        local end_time
        end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log "✅ STEP PASSED: $step_name (${duration}s)"
        
        # Copy log to artifacts
        cp "$step_log" "$ARTIFACTS_DIR/"
        
        return 0
    else
        local end_time
        end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log "❌ STEP FAILED: $step_name (${duration}s)"
        log "Error log: $step_log"
        
        # Show last few lines of error log
        log "Last 10 lines of error log:"
        tail -10 "$step_log" | while read -r line; do
            log "  $line"
        done
        
        # Copy log to artifacts
        cp "$step_log" "$ARTIFACTS_DIR/"
        
        if [[ "$continue_on_failure" == "true" ]]; then
            log "⚠️ Continuing despite failure (continue_on_failure=true)"
            return 0
        else
            return 1
        fi
    fi
}

# Function to create backup
step_backup() {
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        log "BACKUP STEP SKIPPED (SKIP_BACKUP=true)"
        return 0
    fi
    
    run_step "Backup Creation" "BACKUP_DIR=./backups DEPLOY_ENV=premerge ./scripts/deploy/backup.sh"
}

# Function to run deployment dry run
step_deploy_dryrun() {
    run_step "Deploy Dry Run" "DEPLOY_ENV=$ENV DRY_RUN_LOG=./logs/deploy-dryrun.log ./scripts/deploy/deploy_dryrun.sh"
}

# Function to run migration dry run
step_migration_dryrun() {
    run_step "Migration Dry Run" "DEPLOY_ENV=$ENV DRY_RUN_LOG=./logs/migrate-dryrun.log ./scripts/deploy/migration_dryrun.sh" "true"
}

# Function to run golden tests
step_golden_tests() {
    if [[ "$SKIP_GOLDEN" == "true" ]]; then
        log "GOLDEN TESTS STEP SKIPPED (SKIP_GOLDEN=true)"
        return 0
    fi
    
    # Run golden tests for each configured game
    local golden_failures=0
    
    # Create reports directory
    mkdir -p "$ARTIFACTS_DIR/golden_reports"
    
    # Run golden checks for available games
    for game_dir in tests/golden/*/; do
        if [[ -d "$game_dir" ]]; then
            local game_name
            game_name=$(basename "$game_dir")
            
            log "Running golden tests for: $game_name"
            
            local junit_report="$ARTIFACTS_DIR/golden_reports/junit-${game_name}.xml"
            local golden_cmd="node scripts/check_golden.js --game \"$game_name\" --junit \"$junit_report\""
            
            if ! run_step "Golden Tests: $game_name" "$golden_cmd" "true"; then
                ((golden_failures++))
            fi
        fi
    done
    
    if [[ $golden_failures -gt 0 ]]; then
        log "⚠️ $golden_failures golden test suites failed"
        return 1
    else
        log "✅ All golden tests passed"
        return 0
    fi
}

# Function to run smoke tests validation
step_smoke_tests() {
    if [[ "$SKIP_SMOKE" == "true" ]]; then
        log "SMOKE TESTS STEP SKIPPED (SKIP_SMOKE=true)"
        return 0
    fi
    
    run_step "Smoke Tests Validation" "SMOKE_TEST_LOG=./logs/test_logging.log ./scripts/deploy/smoke_tests.sh" "true"
}

# Function to build the application
step_build() {
    # Check if there are any build scripts
    if [[ -f "package.json" ]]; then
        if npm run --silent | grep -q "build"; then
            run_step "Application Build" "npm run build"
        else
            log "ℹ️ No build script found in package.json, skipping build step"
            return 0
        fi
    else
        log "ℹ️ No package.json found, skipping build step"
        return 0
    fi
}

# Function to run unit tests
step_unit_tests() {
    if [[ -f "package.json" ]]; then
        if npm run --silent | grep -q "test"; then
            run_step "Unit Tests" "npm test -- --passWithNoTests --ci --reporters=default"
        else
            log "ℹ️ No test script found in package.json, skipping unit tests"
            return 0
        fi
    else
        log "ℹ️ No package.json found, skipping unit tests"
        return 0
    fi
}

# Function to run linting
step_lint() {
    if [[ -f "package.json" ]]; then
        if npm run --silent | grep -q "lint"; then
            run_step "Linting" "npm run lint" "true"
        else
            log "ℹ️ No lint script found in package.json, skipping linting"
            return 0
        fi
    else
        log "ℹ️ No package.json found, skipping linting"
        return 0
    fi
}

# Function to install dependencies
step_install_deps() {
    if [[ -f "package.json" ]]; then
        if [[ -f "package-lock.json" ]]; then
            run_step "Install Dependencies" "npm ci"
        else
            run_step "Install Dependencies" "npm install"
        fi
    else
        log "ℹ️ No package.json found, skipping dependency installation"
        return 0
    fi
}

# Function to collect system information
collect_system_info() {
    log "=== COLLECTING SYSTEM INFORMATION ==="
    
    local sys_info_file="$ARTIFACTS_DIR/system_info.txt"
    
    {
        echo "=== System Information ==="
        echo "Timestamp: $(date)"
        echo "OS: $(uname -a)"
        echo ""
        
        if command -v node >/dev/null 2>&1; then
            echo "Node.js: $(node --version)"
        fi
        
        if command -v npm >/dev/null 2>&1; then
            echo "npm: $(npm --version)"
        fi
        
        if command -v git >/dev/null 2>&1; then
            echo "Git: $(git --version)"
            echo "Current branch: $(git rev-parse --abbrev-ref HEAD)"
            echo "Current commit: $(git rev-parse HEAD)"
            echo "Uncommitted changes: $(git status --porcelain | wc -l) files"
        fi
        
        echo ""
        echo "=== Environment Variables ==="
        echo "DEPLOY_ENV: $ENV"
        echo "NODE_ENV: ${NODE_ENV:-not set}"
        echo "PWD: $(pwd)"
        
        echo ""
        echo "=== Disk Usage ==="
        df -h .
        
        echo ""
        echo "=== Memory Usage ==="
        if command -v free >/dev/null 2>&1; then
            free -h
        else
            echo "free command not available"
        fi
        
    } > "$sys_info_file"
    
    log "✅ System information collected: $sys_info_file"
}

# Function to create artifacts bundle
create_artifacts_bundle() {
    log "=== CREATING ARTIFACTS BUNDLE ==="
    
    local bundle_path="$ARTIFACTS_DIR.zip"
    
    # Create the bundle
    if zip -r "$bundle_path" "$ARTIFACTS_DIR/" >/dev/null 2>&1; then
        local bundle_size
        bundle_size=$(du -h "$bundle_path" | cut -f1)
        log "✅ Artifacts bundle created: $bundle_path ($bundle_size)"
        
        # Generate checksum
        if command -v sha256sum >/dev/null 2>&1; then
            sha256sum "$bundle_path" > "${bundle_path}.sha256"
            log "✅ Checksum created: ${bundle_path}.sha256"
        fi
        
        echo "ARTIFACTS_BUNDLE=$bundle_path"
    else
        log "❌ Failed to create artifacts bundle"
        return 1
    fi
}

# Function to generate summary report
generate_summary_report() {
    log "=== GENERATING SUMMARY REPORT ==="
    
    local summary_file="$ARTIFACTS_DIR/premerge_summary.md"
    local end_time
    end_time=$(date +%s)
    local total_duration=$((end_time - orchestration_start_time))
    
    {
        echo "# Pre-Merge Orchestration Summary"
        echo ""
        echo "**Timestamp:** $(date)"
        echo "**Environment:** $ENV"
        echo "**Total Duration:** ${total_duration}s"
        echo ""
        echo "## Steps Executed"
        echo ""
        
        # List all log files and their status
        for log_file in "$ARTIFACTS_DIR"/step_*.log; do
            if [[ -f "$log_file" ]]; then
                local step_name
                step_name=$(basename "$log_file" .log | sed 's/step_//' | tr '_' ' ')
                echo "- **$step_name**"
            fi
        done
        
        echo ""
        echo "## Artifacts Generated"
        echo ""
        
        # List all files in artifacts directory
        find "$ARTIFACTS_DIR" -type f | sort | while read -r file; do
            local relative_path
            relative_path=$(realpath --relative-to="$ARTIFACTS_DIR" "$file")
            local file_size
            file_size=$(du -h "$file" | cut -f1)
            echo "- \`$relative_path\` ($file_size)"
        done
        
        echo ""
        echo "## Next Steps"
        echo ""
        echo "1. Review all generated artifacts for any issues"
        echo "2. Verify backup integrity if backup was created"
        echo "3. Ensure all required approvals are in place"
        echo "4. Proceed with deployment if all gates have passed"
        
    } > "$summary_file"
    
    log "✅ Summary report generated: $summary_file"
}

# Main orchestration function
main() {
    local orchestration_start_time
    orchestration_start_time=$(date +%s)
    
    log "=== MOBIUS PRE-MERGE ORCHESTRATION STARTED ==="
    log "Environment: $ENV"
    log "Artifacts directory: $ARTIFACTS_DIR"
    log "Skip backup: $SKIP_BACKUP"
    log "Skip golden: $SKIP_GOLDEN"
    log "Skip smoke: $SKIP_SMOKE"
    
    local total_failures=0
    
    # Collect system information first
    collect_system_info
    
    # Execute all pre-merge steps
    step_install_deps || ((total_failures++))
    step_lint || ((total_failures++))
    step_build || ((total_failures++))
    step_unit_tests || ((total_failures++))
    step_backup || ((total_failures++))
    step_deploy_dryrun || ((total_failures++))
    step_migration_dryrun || ((total_failures++))
    step_golden_tests || ((total_failures++))
    step_smoke_tests || ((total_failures++))
    
    # Generate summary report
    generate_summary_report
    
    # Create artifacts bundle
    create_artifacts_bundle
    
    local end_time
    end_time=$(date +%s)
    local total_duration=$((end_time - orchestration_start_time))
    
    log "=== PRE-MERGE ORCHESTRATION SUMMARY ==="
    log "Total duration: ${total_duration}s"
    log "Total failures: $total_failures"
    
    if [[ $total_failures -eq 0 ]]; then
        log "✅ ALL PRE-MERGE GATES PASSED"
        log "Deployment is ready to proceed"
        exit 0
    else
        log "❌ PRE-MERGE GATES FAILED: $total_failures step(s) failed"
        log "Review failures above and fix issues before deployment"
        exit 1
    fi
}

# Handle help argument
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    cat << EOF
Usage: $0 [options]

Orchestrates all MOBIUS pre-merge gates and validations.

Environment Variables:
  DEPLOY_ENV           Environment name (default: production)
  ORCHESTRATION_LOG    Log file path (default: ./logs/premerge_orchestration.log)
  ARTIFACTS_DIR        Artifacts directory (default: ./premerge_artifacts)
  SKIP_BACKUP         Skip backup creation (default: false)
  SKIP_GOLDEN         Skip golden tests (default: false)
  SKIP_SMOKE          Skip smoke tests validation (default: false)

Exit Codes:
  0   All pre-merge gates passed
  1   One or more gates failed

Examples:
  $0                              # Run full pre-merge orchestration
  SKIP_BACKUP=true $0            # Skip backup step
  DEPLOY_ENV=staging $0          # Run for staging environment
EOF
    exit 0
fi

# Execute main function
main "$@"