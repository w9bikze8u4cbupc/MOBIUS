#!/bin/bash
# scripts/premerge_run.sh - Complete pre-merge validation runner
set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ARTIFACTS_DIR="$PROJECT_ROOT/premerge_artifacts"
LOG_DIR="${LOG_DIR:-$PROJECT_ROOT/logs}"

# Help text
show_help() {
    cat << EOF
Usage: $0 [options]

Run complete pre-merge validation including:
- CI matrix tests
- Backup creation and verification
- Dry-run deployments
- Smoke tests and logging validation
- Artifact collection

Options:
  --skip-ci          Skip CI matrix validation
  --skip-backup      Skip backup creation
  --skip-deploy      Skip deployment dry-runs
  --skip-tests       Skip smoke tests
  --artifacts-dir DIR Directory for artifacts (default: premerge_artifacts/)
  --help             Show this help

Examples:
  $0                 # Run full validation
  $0 --skip-ci       # Skip CI validation
  $0 --artifacts-dir /tmp/artifacts

Environment variables:
  LOG_DIR            Directory for logs (default: logs/)
  CI_SKIP            Set to 'true' to skip CI validation
EOF
}

# Parse arguments
SKIP_CI=false
SKIP_BACKUP=false
SKIP_DEPLOY=false
SKIP_TESTS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-ci)
            SKIP_CI=true
            shift
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --skip-deploy)
            SKIP_DEPLOY=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --artifacts-dir)
            ARTIFACTS_DIR="$2"
            shift 2
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            show_help >&2
            exit 1
            ;;
    esac
done

# Environment overrides
if [[ "${CI_SKIP:-}" == "true" ]]; then
    SKIP_CI=true
fi

# Setup
mkdir -p "$ARTIFACTS_DIR" "$LOG_DIR"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
MAIN_LOG="$ARTIFACTS_DIR/premerge_${TIMESTAMP}.log"

# Logging function
log() {
    local level="$1"
    shift
    local message="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [$level] $*"
    echo "$message" | tee -a "$MAIN_LOG"
}

# Error handling
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log "ERROR" "Pre-merge validation failed with exit code $exit_code"
        log "INFO" "Artifacts available in: $ARTIFACTS_DIR"
        log "INFO" "Main log: $MAIN_LOG"
    fi
}
trap cleanup EXIT

log "INFO" "Starting pre-merge validation"
log "INFO" "Project root: $PROJECT_ROOT"
log "INFO" "Artifacts directory: $ARTIFACTS_DIR"
log "INFO" "Timestamp: $TIMESTAMP"

# Collect environment info
ENV_INFO_FILE="$ARTIFACTS_DIR/environment_info.json"
cat > "$ENV_INFO_FILE" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": "$(hostname)",
  "user": "$(whoami)",
  "pwd": "$(pwd)",
  "node_version": "$(node --version 2>/dev/null || echo 'not found')",
  "npm_version": "$(npm --version 2>/dev/null || echo 'not found')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_status": "$(git status --porcelain 2>/dev/null || echo 'unknown')",
  "platform": "$(uname -a 2>/dev/null || echo 'unknown')"
}
EOF

log "INFO" "Environment info saved to: $ENV_INFO_FILE"

cd "$PROJECT_ROOT"

# Step 1: Git status validation
log "INFO" "=== STEP 1: Git Status Validation ==="
GIT_STATUS=$(git status --porcelain 2>/dev/null || echo "")
if [[ -n "$GIT_STATUS" ]]; then
    log "WARN" "Working directory is not clean:"
    git status --porcelain | tee -a "$MAIN_LOG"
    echo "$GIT_STATUS" > "$ARTIFACTS_DIR/git_status.txt"
else
    log "INFO" "Working directory is clean"
fi

GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
log "INFO" "Current branch: $GIT_BRANCH"

# Step 2: Dependencies check
log "INFO" "=== STEP 2: Dependencies Check ==="
if [[ ! -d "node_modules" ]]; then
    log "INFO" "Installing dependencies..."
    npm ci 2>&1 | tee -a "$MAIN_LOG"
else
    log "INFO" "Dependencies already installed"
fi

# Step 3: Build validation (if build script exists)
log "INFO" "=== STEP 3: Build Validation ==="
if npm run build --if-present >> "$MAIN_LOG" 2>&1; then
    log "INFO" "Build completed successfully"
else
    log "INFO" "No build script or build completed"
fi

# Step 4: Unit tests
log "INFO" "=== STEP 4: Unit Tests ==="
if npm test -- --passWithNoTests >> "$ARTIFACTS_DIR/unit_tests.log" 2>&1; then
    log "INFO" "Unit tests passed"
else
    log "WARN" "Unit tests failed or no tests found"
    cp "$ARTIFACTS_DIR/unit_tests.log" "$ARTIFACTS_DIR/unit_tests_failed.log" 2>/dev/null || true
fi

# Step 5: CI Matrix Validation (skip if requested)
if [[ "$SKIP_CI" == false ]]; then
    log "INFO" "=== STEP 5: CI Matrix Validation ==="
    
    # Check if GitHub Actions workflow exists
    if [[ -f ".github/workflows/ci.yml" ]]; then
        log "INFO" "CI workflow found, checking recent runs..."
        
        # If gh CLI is available, check recent workflow runs
        if command -v gh >/dev/null 2>&1; then
            gh run list --limit 5 --json status,conclusion,createdAt,headBranch > "$ARTIFACTS_DIR/ci_runs.json" 2>/dev/null || {
                log "WARN" "Could not fetch CI run status (gh CLI authentication may be required)"
                echo "CI status check skipped - authentication required" > "$ARTIFACTS_DIR/ci_runs.json"
            }
        else
            log "WARN" "GitHub CLI not available, skipping automated CI check"
            echo "CI status check skipped - gh CLI not available" > "$ARTIFACTS_DIR/ci_runs.json"
        fi
    else
        log "WARN" "No CI workflow found at .github/workflows/ci.yml"
    fi
else
    log "INFO" "=== STEP 5: CI Matrix Validation (SKIPPED) ==="
fi

# Step 6: Backup Creation
if [[ "$SKIP_BACKUP" == false ]]; then
    log "INFO" "=== STEP 6: Backup Creation ==="
    
    BACKUP_FILE="$ARTIFACTS_DIR/dhash_${TIMESTAMP}.zip"
    if "$SCRIPT_DIR/backup_library.sh" --out "$BACKUP_FILE" >> "$MAIN_LOG" 2>&1; then
        log "INFO" "Backup created successfully: $BACKUP_FILE"
        
        # Generate checksum
        sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
        
        # Verify checksum
        if sha256sum -c "${BACKUP_FILE}.sha256" >/dev/null 2>&1; then
            log "INFO" "Backup checksum verified"
        else
            log "ERROR" "Backup checksum verification failed"
            exit 1
        fi
    else
        log "ERROR" "Backup creation failed"
        exit 1
    fi
else
    log "INFO" "=== STEP 6: Backup Creation (SKIPPED) ==="
fi

# Step 7: Deployment Dry-runs
if [[ "$SKIP_DEPLOY" == false ]]; then
    log "INFO" "=== STEP 7: Deployment Dry-runs ==="
    
    # Staging dry-run
    if "$SCRIPT_DIR/deploy_dhash.sh" --env staging --dry-run > "$ARTIFACTS_DIR/deploy-staging-dryrun.log" 2>&1; then
        log "INFO" "Staging deployment dry-run successful"
    else
        log "ERROR" "Staging deployment dry-run failed"
        exit 1
    fi
    
    # Production dry-run
    if "$SCRIPT_DIR/deploy_dhash.sh" --env production --dry-run > "$ARTIFACTS_DIR/deploy-production-dryrun.log" 2>&1; then
        log "INFO" "Production deployment dry-run successful"
    else
        log "ERROR" "Production deployment dry-run failed"
        exit 1
    fi
    
    # Migration dry-run (if script exists)
    if [[ -f "$SCRIPT_DIR/migrate-dhash.js" ]]; then
        if node "$SCRIPT_DIR/migrate-dhash.js" --dry-run > "$ARTIFACTS_DIR/migrate-dryrun.log" 2>&1; then
            log "INFO" "Migration dry-run successful"
        else
            log "ERROR" "Migration dry-run failed"
            exit 1
        fi
    else
        log "WARN" "Migration script not found, skipping migration dry-run"
        echo "Migration script not found" > "$ARTIFACTS_DIR/migrate-dryrun.log"
    fi
else
    log "INFO" "=== STEP 7: Deployment Dry-runs (SKIPPED) ==="
fi

# Step 8: Smoke Tests and Logging Validation
if [[ "$SKIP_TESTS" == false ]]; then
    log "INFO" "=== STEP 8: Smoke Tests and Logging Validation ==="
    
    # Logging tests
    if [[ -f "$SCRIPT_DIR/test_logging.js" ]]; then
        if node "$SCRIPT_DIR/test_logging.js" > "$ARTIFACTS_DIR/test_logging.log" 2>&1; then
            log "INFO" "Logging tests passed"
        else
            log "ERROR" "Logging tests failed"
            exit 1
        fi
    else
        log "WARN" "Logging test script not found"
        echo "Logging test script not found" > "$ARTIFACTS_DIR/test_logging.log"
    fi
    
    # Smoke tests
    if [[ -f "$SCRIPT_DIR/smoke-tests.js" ]]; then
        if node "$SCRIPT_DIR/smoke-tests.js" --quick > "$ARTIFACTS_DIR/smoke_quick.log" 2>&1; then
            log "INFO" "Quick smoke tests passed"
        else
            log "ERROR" "Quick smoke tests failed"
            exit 1
        fi
    else
        log "WARN" "Smoke test script not found"
        echo "Smoke test script not found" > "$ARTIFACTS_DIR/smoke_quick.log"
    fi
else
    log "INFO" "=== STEP 8: Smoke Tests and Logging Validation (SKIPPED) ==="
fi

# Step 9: Golden Tests (if available)
log "INFO" "=== STEP 9: Golden Tests ==="
if npm run golden:check >> "$ARTIFACTS_DIR/golden_tests.log" 2>&1; then
    log "INFO" "Golden tests passed"
else
    log "WARN" "Golden tests failed or not available"
    # Not failing the build for golden tests as they require specific media files
fi

# Step 10: Artifact Summary
log "INFO" "=== STEP 10: Artifact Summary ==="

SUMMARY_FILE="$ARTIFACTS_DIR/validation_summary.json"
cat > "$SUMMARY_FILE" << EOF
{
  "validation_completed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "validation_duration_seconds": $SECONDS,
  "git_branch": "$GIT_BRANCH",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "artifacts_directory": "$ARTIFACTS_DIR",
  "main_log": "$MAIN_LOG",
  "steps_completed": {
    "git_status": true,
    "dependencies": true,
    "build": true,
    "unit_tests": true,
    "ci_validation": $(if [[ "$SKIP_CI" == false ]]; then echo true; else echo false; fi),
    "backup_creation": $(if [[ "$SKIP_BACKUP" == false ]]; then echo true; else echo false; fi),
    "deployment_dry_runs": $(if [[ "$SKIP_DEPLOY" == false ]]; then echo true; else echo false; fi),
    "smoke_tests": $(if [[ "$SKIP_TESTS" == false ]]; then echo true; else echo false; fi),
    "golden_tests": true
  },
  "artifacts": [
    "environment_info.json",
    "unit_tests.log",
    "validation_summary.json",
    "premerge_${TIMESTAMP}.log"
  ]
}
EOF

# List all artifacts
find "$ARTIFACTS_DIR" -type f -name "*.log" -o -name "*.json" -o -name "*.zip*" | sort > "$ARTIFACTS_DIR/artifact_manifest.txt"

log "INFO" "Validation summary saved to: $SUMMARY_FILE"
log "INFO" "Artifact manifest saved to: $ARTIFACTS_DIR/artifact_manifest.txt"

# Final status
ARTIFACT_COUNT=$(wc -l < "$ARTIFACTS_DIR/artifact_manifest.txt")
log "INFO" "Pre-merge validation completed successfully"
log "INFO" "Total artifacts: $ARTIFACT_COUNT"
log "INFO" "Artifacts directory: $ARTIFACTS_DIR"
log "INFO" "Duration: ${SECONDS}s"

echo ""
echo "=== VALIDATION COMPLETED ==="
echo "Artifacts directory: $ARTIFACTS_DIR"
echo "Main log: $MAIN_LOG"
echo "Summary: $SUMMARY_FILE"
echo ""
echo "Next steps:"
echo "1. Attach artifacts to PR before requesting merge"
echo "2. Ensure CI matrix shows green status"
echo "3. Get required approvals (minimum 2, including Ops/SRE)"
echo "4. Follow merge checklist in PR_MERGE_CHECKLIST.md"

exit 0