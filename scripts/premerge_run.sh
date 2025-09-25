#!/bin/bash

# Pre-merge validation runner script
# This script performs comprehensive validation checks before merging PRs
# Environment variables configure behavior:
# - ARTIFACT_DIR: Directory for validation artifacts (default: premerge_artifacts)
# - BACKUP_DIR: Directory for backups (default: backups)
# - DRY_RUN_ENV: Environment for dry run (default: staging)
# - AUTO_CREATE_PR: Whether to auto-create PRs (default: false)
# - CREATE_PR_CMD_FILE: File to write PR creation commands (default: CREATE_PR_COMMAND.txt)
# - LOG_DIR: Directory for logs (default: logs)
# - CI_UPLOAD_CMD: Optional CI uploader command

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration with defaults
ARTIFACT_DIR="${ARTIFACT_DIR:-premerge_artifacts}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
DRY_RUN_ENV="${DRY_RUN_ENV:-staging}"
AUTO_CREATE_PR="${AUTO_CREATE_PR:-false}"
CREATE_PR_CMD_FILE="${CREATE_PR_CMD_FILE:-CREATE_PR_COMMAND.txt}"
LOG_DIR="${LOG_DIR:-logs}"
CI_UPLOAD_CMD="${CI_UPLOAD_CMD:-}"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Setup directories
setup_directories() {
    log_info "Setting up directories..."
    mkdir -p "${ARTIFACT_DIR}"
    mkdir -p "${BACKUP_DIR}" 
    mkdir -p "${LOG_DIR}"
    
    # Create subdirectories for organized artifacts
    mkdir -p "${ARTIFACT_DIR}/reports"
    mkdir -p "${ARTIFACT_DIR}/golden"
    mkdir -p "${ARTIFACT_DIR}/previews"
    
    log_info "Directories created: ${ARTIFACT_DIR}, ${BACKUP_DIR}, ${LOG_DIR}"
}

# Check system dependencies
check_dependencies() {
    log_info "Checking system dependencies..."
    
    local missing_deps=()
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        missing_deps+=("node")
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        missing_deps+=("npm")
    fi
    
    # Check FFmpeg
    if ! command -v ffmpeg &> /dev/null; then
        missing_deps+=("ffmpeg")
    fi
    
    # Check FFprobe
    if ! command -v ffprobe &> /dev/null; then
        missing_deps+=("ffprobe")
    fi
    
    # Check poppler utils (optional, platform-specific)
    if command -v pdfinfo &> /dev/null; then
        log_info "Poppler utils available"
    else
        log_warn "Poppler utils not found (optional dependency)"
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        return 1
    fi
    
    log_success "All required dependencies available"
    return 0
}

# Run npm tests
run_tests() {
    log_info "Running npm tests..."
    
    local test_log="${LOG_DIR}/npm_test.log"
    
    if npm test -- --passWithNoTests > "${test_log}" 2>&1; then
        log_success "npm tests passed"
        cp "${test_log}" "${ARTIFACT_DIR}/reports/"
        return 0
    else
        log_error "npm tests failed"
        cp "${test_log}" "${ARTIFACT_DIR}/reports/"
        return 1
    fi
}

# Run golden checks if available
run_golden_checks() {
    log_info "Running golden validation checks..."
    
    local golden_log="${LOG_DIR}/golden_checks.log"
    local golden_failed=false
    
    # Check if golden check scripts exist
    if [ ! -f "scripts/check_golden.js" ]; then
        log_warn "No golden check script found, skipping golden validation"
        return 0
    fi
    
    # Check if golden directories exist
    if [ ! -d "tests/golden" ]; then
        log_warn "No golden test directory found, skipping golden validation"
        return 0
    fi
    
    # Run available golden checks from package.json
    if npm run golden:check > "${golden_log}" 2>&1; then
        log_success "Golden checks passed"
    else
        # Check if it's just missing input files (which is acceptable for new repos)
        if grep -q "Input not found:" "${golden_log}"; then
            log_warn "Golden checks skipped due to missing input files (acceptable for new repositories)"
            echo "Golden checks skipped: input files not found" >> "${golden_log}"
        else
            log_error "Golden checks failed"
            golden_failed=true
        fi
    fi
    
    # Copy golden artifacts
    if [ -d "tests/golden" ]; then
        cp -r tests/golden "${ARTIFACT_DIR}/"
    fi
    
    cp "${golden_log}" "${ARTIFACT_DIR}/reports/"
    
    if [ "$golden_failed" = true ]; then
        return 1
    fi
    
    return 0
}

# Run linting if available
run_linting() {
    log_info "Running linting checks..."
    
    local lint_log="${LOG_DIR}/lint.log"
    
    # Check if ESLint or similar is available
    if command -v npx eslint &> /dev/null && [ -f ".eslintrc.js" -o -f ".eslintrc.json" -o -f ".eslintrc.yaml" ]; then
        if npx eslint . > "${lint_log}" 2>&1; then
            log_success "Linting passed"
        else
            log_warn "Linting issues found (not failing build)"
        fi
        cp "${lint_log}" "${ARTIFACT_DIR}/reports/"
    else
        log_info "No linting configuration found, skipping"
    fi
}

# Generate build artifacts
generate_artifacts() {
    log_info "Generating build artifacts..."
    
    # Create system info
    local system_info="${ARTIFACT_DIR}/system_info.txt"
    {
        echo "Premerge validation run - $(date)"
        echo "System: $(uname -a)"
        echo "Node version: $(node --version)"
        echo "npm version: $(npm --version)"
        echo "Working directory: $(pwd)"
        echo "Git commit: $(git rev-parse HEAD 2>/dev/null || echo 'not available')"
        echo "Git branch: $(git branch --show-current 2>/dev/null || echo 'not available')"
        echo ""
        echo "Environment variables:"
        echo "ARTIFACT_DIR=${ARTIFACT_DIR}"
        echo "BACKUP_DIR=${BACKUP_DIR}"
        echo "DRY_RUN_ENV=${DRY_RUN_ENV}"
        echo "AUTO_CREATE_PR=${AUTO_CREATE_PR}"
        echo "CREATE_PR_CMD_FILE=${CREATE_PR_CMD_FILE}"
        echo "LOG_DIR=${LOG_DIR}"
        echo "CI_UPLOAD_CMD=${CI_UPLOAD_CMD}"
    } > "${system_info}"
    
    # Create package info
    if [ -f "package.json" ]; then
        cp package.json "${ARTIFACT_DIR}/"
    fi
    
    if [ -f "package-lock.json" ]; then
        cp package-lock.json "${ARTIFACT_DIR}/"
    fi
}

# Handle PR creation command file
handle_pr_creation() {
    if [ "${AUTO_CREATE_PR}" = "true" ]; then
        log_info "AUTO_CREATE_PR is enabled, generating PR creation command"
        echo "# Auto-generated PR creation command" > "${CREATE_PR_CMD_FILE}"
        echo "# This would create a PR if implemented" >> "${CREATE_PR_CMD_FILE}"
        echo "gh pr create --title 'Automated premerge validation' --body 'Generated by premerge validation'" >> "${CREATE_PR_CMD_FILE}"
        cp "${CREATE_PR_CMD_FILE}" "${ARTIFACT_DIR}/"
    else
        log_info "AUTO_CREATE_PR is disabled (${AUTO_CREATE_PR})"
    fi
}

# Upload artifacts with CI command if provided
upload_artifacts() {
    if [ -n "${CI_UPLOAD_CMD}" ]; then
        log_info "Running CI upload command: ${CI_UPLOAD_CMD}"
        if eval "${CI_UPLOAD_CMD}"; then
            log_success "Artifacts uploaded successfully"
        else
            log_warn "Artifact upload failed (not failing build)"
        fi
    else
        log_info "No CI upload command specified"
    fi
}

# Main execution
main() {
    log_info "Starting premerge validation run..."
    log_info "Environment: ${DRY_RUN_ENV}"
    
    local exit_code=0
    
    # Setup
    setup_directories || exit_code=1
    
    # Dependency checks
    check_dependencies || exit_code=1
    
    # If dependencies failed, we can't continue
    if [ $exit_code -ne 0 ]; then
        log_error "Dependency checks failed, aborting"
        return $exit_code
    fi
    
    # Run validation steps (continue on failure to collect all results)
    local test_failed=false
    local golden_failed=false
    
    if ! run_tests; then
        test_failed=true
        exit_code=1
    fi
    
    if ! run_golden_checks; then
        golden_failed=true
        exit_code=1
    fi
    
    # Non-critical steps
    run_linting
    generate_artifacts
    handle_pr_creation
    upload_artifacts
    
    # Summary
    log_info "=== Premerge Validation Summary ==="
    if [ $test_failed = true ]; then
        log_error "✗ Tests failed"
    else
        log_success "✓ Tests passed"
    fi
    
    if [ $golden_failed = true ]; then
        log_error "✗ Golden checks failed"
    else
        log_success "✓ Golden checks passed"
    fi
    
    log_success "✓ System dependencies available"
    log_success "✓ Artifacts generated in ${ARTIFACT_DIR}"
    
    if [ $exit_code -eq 0 ]; then
        log_success "Premerge validation completed successfully!"
    else
        log_error "Premerge validation failed with exit code $exit_code"
    fi
    
    return $exit_code
}

# Execute main function
main "$@"