#!/bin/bash
set -euo pipefail

# MOBIUS Deployment - Pre-merge Orchestration
# Coordinates all pre-merge automation steps

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --env ENV          Environment (staging|production) [required]"
    echo "  --artifacts-dir    Directory for artifacts [default: ./premerge_artifacts]"
    echo "  --skip-backup      Skip backup creation"
    echo "  --skip-tests       Skip smoke tests"
    echo "  --help             Show this help message"
    echo ""
    echo "Automation steps:"
    echo "  1. SHA256 backup creation"
    echo "  2. Deployment dry-run validation"
    echo "  3. Migration dry-run validation"
    echo "  4. Smoke tests execution"
    echo "  5. Artifact collection and packaging"
    exit 1
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

# Parse arguments
ENV=""
ARTIFACTS_DIR="${PROJECT_ROOT}/premerge_artifacts"
SKIP_BACKUP=false
SKIP_TESTS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            shift 2
            ;;
        --artifacts-dir)
            ARTIFACTS_DIR="$2"
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
        --help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

if [[ -z "$ENV" ]]; then
    echo "Error: --env is required"
    usage
fi

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
    echo "Error: --env must be 'staging' or 'production'"
    exit 1
fi

# Initialize orchestration state
STEPS_PASSED=0
STEPS_FAILED=0
STEPS_TOTAL=6

# Cleanup and setup artifacts directory
rm -rf "$ARTIFACTS_DIR"
mkdir -p "$ARTIFACTS_DIR"

log "Starting pre-merge orchestration for environment: $ENV"
log "Artifacts directory: $ARTIFACTS_DIR"

# Function to run an orchestration step
run_step() {
    local step_name="$1"
    local step_command="$2"
    local critical="${3:-true}"
    
    log "🔄 Step: $step_name"
    
    local step_start=$(date +%s)
    local step_output
    local step_result
    
    if step_output=$(eval "$step_command" 2>&1); then
        step_result="PASS"
        STEPS_PASSED=$((STEPS_PASSED + 1))
        log "✅ $step_name - COMPLETED"
    else
        step_result="FAIL"
        STEPS_FAILED=$((STEPS_FAILED + 1))
        log "❌ $step_name - FAILED"
        
        if [[ "$critical" == "true" ]]; then
            log "💥 Critical step failed: $step_name"
            echo "$step_output" | tee "${ARTIFACTS_DIR}/error_${step_name// /_}.log"
            return 1
        fi
    fi
    
    local step_end=$(date +%s)
    local step_duration=$((step_end - step_start))
    
    # Log step result to orchestration log
    cat >> "${ARTIFACTS_DIR}/orchestration.log" << EOF
$(date '+%Y-%m-%d %H:%M:%S')|$step_name|$step_result|${step_duration}s
EOF
    
    # Save step output
    echo "$step_output" > "${ARTIFACTS_DIR}/${step_name// /_}_output.log"
    
    return 0
}

# Step 1: Create SHA256 backup
if [[ "$SKIP_BACKUP" != "true" ]]; then
    log "🔄 Step 1/6: Creating SHA256 backup"
    
    run_step "SHA256 Backup" "${SCRIPT_DIR}/backup.sh --env $ENV" true || {
        log "💥 Backup creation failed, aborting orchestration"
        exit 1
    }
    
    # Copy backup files to artifacts
    if [[ -d "${PROJECT_ROOT}/backups" ]]; then
        latest_backup=$(ls -1 "${PROJECT_ROOT}"/backups/dhash_${ENV}_*.zip 2>/dev/null | sort -r | head -n1 || echo "")
        if [[ -n "$latest_backup" ]]; then
            cp "$latest_backup" "${latest_backup}.sha256" "$ARTIFACTS_DIR/" 2>/dev/null || true
            log "📦 Backup artifacts copied to $ARTIFACTS_DIR"
        fi
    fi
else
    log "⏭️  Step 1/6: Skipping backup creation"
    STEPS_PASSED=$((STEPS_PASSED + 1))
fi

# Step 2: Deployment dry-run
log "🔄 Step 2/6: Running deployment dry-run"

run_step "Deploy Dry-Run" "${SCRIPT_DIR}/deploy_dryrun.sh --env $ENV --output ${ARTIFACTS_DIR}/deploy-dryrun.log" true || {
    log "💥 Deployment validation failed, aborting orchestration"
    exit 1
}

# Step 3: Migration dry-run
log "🔄 Step 3/6: Running migration dry-run"

run_step "Migration Dry-Run" "${SCRIPT_DIR}/migration_dryrun.sh --env $ENV --output ${ARTIFACTS_DIR}/migration-dryrun.log" true || {
    log "💥 Migration validation failed, aborting orchestration"
    exit 1
}

# Step 4: Smoke tests (if not skipped)
if [[ "$SKIP_TESTS" != "true" ]]; then
    log "🔄 Step 4/6: Running smoke tests"
    
    # For pre-merge, we run smoke tests against current environment
    run_step "Smoke Tests" "${SCRIPT_DIR}/smoke_tests.sh --env $ENV --output ${ARTIFACTS_DIR}/postdeploy-smoketests.log --quick" false
    
    # Copy test logging to artifacts
    if [[ -f "${PROJECT_ROOT}/test_logging_${ENV}"*.log ]]; then
        cp "${PROJECT_ROOT}/test_logging_${ENV}"*.log "$ARTIFACTS_DIR/" 2>/dev/null || true
    fi
else
    log "⏭️  Step 4/6: Skipping smoke tests"
    STEPS_PASSED=$((STEPS_PASSED + 1))
fi

# Step 5: Collect system information
log "🔄 Step 5/6: Collecting system information"

collect_system_info() {
    # Git information
    cat > "${ARTIFACTS_DIR}/git_info.json" << EOF
{
  "commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')",
  "status": "$(git status --porcelain | wc -l) uncommitted changes",
  "remote": "$(git remote get-url origin 2>/dev/null || echo 'unknown')"
}
EOF
    
    # System information
    cat > "${ARTIFACTS_DIR}/system_info.json" << EOF
{
  "timestamp": "$(date --iso-8601)",
  "hostname": "$(hostname)",
  "user": "${USER:-unknown}",
  "os": "$(uname -s)",
  "arch": "$(uname -m)",
  "node_version": "$(node --version 2>/dev/null || echo 'unknown')",
  "npm_version": "$(npm --version 2>/dev/null || echo 'unknown')",
  "disk_space": "$(df -h "$PROJECT_ROOT" | awk 'NR==2 {print $4}') available"
}
EOF
    
    # Package information
    cd "$PROJECT_ROOT"
    if [[ -f "package.json" ]]; then
        cp "package.json" "${ARTIFACTS_DIR}/"
        npm list --depth=0 --json > "${ARTIFACTS_DIR}/npm_list.json" 2>/dev/null || echo "{}" > "${ARTIFACTS_DIR}/npm_list.json"
    fi
    
    return 0
}

run_step "System Info Collection" "collect_system_info" false

# Step 6: Package artifacts
log "🔄 Step 6/6: Packaging artifacts"

package_artifacts() {
    cd "$ARTIFACTS_DIR"
    
    # Create artifact manifest
    cat > "manifest.json" << EOF
{
  "environment": "$ENV",
  "timestamp": "$(date --iso-8601)",
  "orchestration_version": "1.0",
  "steps_total": $STEPS_TOTAL,
  "steps_passed": $STEPS_PASSED,
  "steps_failed": $STEPS_FAILED,
  "artifacts": [
EOF
    
    # List all artifacts
    local first=true
    for file in *; do
        if [[ "$file" != "manifest.json" ]]; then
            if [[ "$first" == "true" ]]; then
                first=false
            else
                echo "," >> manifest.json
            fi
            echo "    \"$file\"" >> manifest.json
        fi
    done
    
    cat >> "manifest.json" << EOF
  ]
}
EOF
    
    # Create compressed artifact bundle
    tar -czf "premerge_artifacts_${ENV}_$(date '+%Y%m%d_%H%M%S').tar.gz" *
    
    return 0
}

run_step "Artifact Packaging" "package_artifacts" false

# Generate final orchestration report
TOTAL_DURATION=$(($(date +%s) - $(date -d "$(head -n1 "${ARTIFACTS_DIR}/orchestration.log" | cut -d'|' -f1)" +%s) || 0))

log "🎯 Pre-merge orchestration completed"
log "Results: $STEPS_PASSED passed, $STEPS_FAILED failed, $STEPS_TOTAL total"
log "Total duration: ${TOTAL_DURATION}s"
log "Artifacts location: $ARTIFACTS_DIR"

# Create final summary
cat > "${ARTIFACTS_DIR}/orchestration_summary.json" << EOF
{
  "environment": "$ENV",
  "timestamp": "$(date --iso-8601)",
  "total_steps": $STEPS_TOTAL,
  "steps_passed": $STEPS_PASSED,
  "steps_failed": $STEPS_FAILED,
  "success_rate": $(($STEPS_PASSED * 100 / $STEPS_TOTAL)),
  "total_duration_seconds": $TOTAL_DURATION,
  "artifacts_directory": "$ARTIFACTS_DIR",
  "critical_failures": $(($STEPS_FAILED > 0 ? 1 : 0))
}
EOF

# List key artifacts for easy access
log "📋 Key artifacts generated:"
log "  - Orchestration log: ${ARTIFACTS_DIR}/orchestration.log"
log "  - Deploy dry-run: ${ARTIFACTS_DIR}/deploy-dryrun.log"
log "  - Migration dry-run: ${ARTIFACTS_DIR}/migration-dryrun.log"
log "  - Smoke test results: ${ARTIFACTS_DIR}/postdeploy-smoketests.log"
log "  - System information: ${ARTIFACTS_DIR}/system_info.json"
log "  - Artifact bundle: ${ARTIFACTS_DIR}/premerge_artifacts_${ENV}_*.tar.gz"

# Exit with appropriate code
if [[ $STEPS_FAILED -eq 0 ]]; then
    log "🎉 All orchestration steps completed successfully!"
    exit 0
else
    log "💥 Orchestration completed with $STEPS_FAILED failed steps"
    exit 1
fi