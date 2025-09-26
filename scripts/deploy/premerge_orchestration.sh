#!/bin/bash
# MOBIUS Deployment Framework - Pre-merge Orchestration Script
# Orchestrates all pre-merge deployment readiness checks

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default configuration
ENV="${ENV:-staging}"
SKIP_BACKUP=false
SKIP_DRYRUN=false
SKIP_MIGRATION=false
SKIP_TESTS=false

# Help message
show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Orchestrate pre-merge deployment readiness checks for MOBIUS

OPTIONS:
    --env ENV          Target environment (staging|production) [default: staging]
    --skip-backup      Skip backup creation
    --skip-dryrun      Skip deployment dry run
    --skip-migration   Skip migration dry run
    --skip-tests       Skip smoke tests
    --help            Show this help message

EXAMPLES:
    $0 --env production
    $0 --env staging --skip-backup
    $0 --skip-tests --skip-migration

This script runs the complete pre-merge validation suite:
1. Creates backup
2. Runs deployment dry run
3. Runs migration dry run  
4. Executes smoke tests
5. Generates validation report

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            shift 2
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --skip-dryrun)
            SKIP_DRYRUN=true
            shift
            ;;
        --skip-migration)
            SKIP_MIGRATION=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
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

# Validate environment
if [[ ! "$ENV" =~ ^(staging|production)$ ]]; then
    echo "ERROR: Invalid environment '$ENV'. Must be 'staging' or 'production'." >&2
    exit 1
fi

TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
ARTIFACTS_DIR="${REPO_ROOT}/premerge_artifacts"
mkdir -p "$ARTIFACTS_DIR"

echo "========================================"
echo "MOBIUS Pre-merge Orchestration"
echo "========================================"
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "Environment: $ENV"
echo "Git Commit: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
echo "Git Branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
echo "Artifacts Directory: $ARTIFACTS_DIR"
echo ""
echo "Steps to execute:"
echo "- Backup: $(if [[ "$SKIP_BACKUP" == "true" ]]; then echo "SKIPPED"; else echo "ENABLED"; fi)"
echo "- Deploy Dry Run: $(if [[ "$SKIP_DRYRUN" == "true" ]]; then echo "SKIPPED"; else echo "ENABLED"; fi)"
echo "- Migration Dry Run: $(if [[ "$SKIP_MIGRATION" == "true" ]]; then echo "SKIPPED"; else echo "ENABLED"; fi)"
echo "- Smoke Tests: $(if [[ "$SKIP_TESTS" == "true" ]]; then echo "SKIPPED"; else echo "ENABLED"; fi)"
echo "========================================"

# Initialize result tracking
STEPS_TOTAL=0
STEPS_PASSED=0
STEPS_FAILED=0
STEP_RESULTS=()

# Helper function to run and track steps
run_step() {
    local step_name="$1"
    local step_command="$2"
    local skip_flag="$3"
    
    ((STEPS_TOTAL++))
    
    if [[ "$skip_flag" == "true" ]]; then
        echo ""
        echo "=== STEP $(($STEPS_TOTAL)): $step_name (SKIPPED) ==="
        echo "⏭ Skipped by user request"
        STEP_RESULTS+=("$step_name: SKIPPED")
        return 0
    fi
    
    echo ""
    echo "=== STEP $(($STEPS_TOTAL)): $step_name ==="
    echo "Command: $step_command"
    echo "Start time: $(date -u '+%H:%M:%S UTC')"
    
    local step_start_time=$(date +%s)
    
    if eval "$step_command"; then
        local step_end_time=$(date +%s)
        local step_duration=$((step_end_time - step_start_time))
        
        echo "✅ STEP $STEPS_TOTAL PASSED: $step_name (${step_duration}s)"
        ((STEPS_PASSED++))
        STEP_RESULTS+=("$step_name: PASSED (${step_duration}s)")
        return 0
    else
        local step_end_time=$(date +%s)
        local step_duration=$((step_end_time - step_start_time))
        
        echo "❌ STEP $STEPS_TOTAL FAILED: $step_name (${step_duration}s)"
        ((STEPS_FAILED++))
        STEP_RESULTS+=("$step_name: FAILED (${step_duration}s)")
        return 1
    fi
}

# Start orchestration
ORCHESTRATION_START_TIME=$(date +%s)

echo ""
echo "Starting pre-merge validation orchestration..."

# Step 1: Create Backup
run_step "Create Backup" \
    "'$SCRIPT_DIR/backup_dhash.sh' --env '$ENV' --backup-dir '$REPO_ROOT/backups'" \
    "$SKIP_BACKUP"

# Step 2: Deploy Dry Run
run_step "Deploy Dry Run" \
    "'$SCRIPT_DIR/deploy_dryrun.sh' --env '$ENV' --log-file '$ARTIFACTS_DIR/deploy-dryrun.log'" \
    "$SKIP_DRYRUN"

# Step 3: Migration Dry Run
run_step "Migration Dry Run" \
    "'$SCRIPT_DIR/migration_dryrun.sh' --env '$ENV' --log-file '$ARTIFACTS_DIR/migration-dryrun.log'" \
    "$SKIP_MIGRATION"

# Step 4: Smoke Tests
run_step "Smoke Tests" \
    "'$SCRIPT_DIR/smoke_tests.sh' --env '$ENV' --log-file '$ARTIFACTS_DIR/postdeploy-smoketests.log'" \
    "$SKIP_TESTS"

# Calculate final results
ORCHESTRATION_END_TIME=$(date +%s)
ORCHESTRATION_DURATION=$((ORCHESTRATION_END_TIME - ORCHESTRATION_START_TIME))

echo ""
echo "========================================"
echo "PRE-MERGE ORCHESTRATION RESULTS"
echo "========================================"
echo "Completion Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "Total Duration: ${ORCHESTRATION_DURATION}s ($(($ORCHESTRATION_DURATION/60))m $(($ORCHESTRATION_DURATION%60))s)"
echo "Environment: $ENV"
echo ""
echo "Step Results:"
for result in "${STEP_RESULTS[@]}"; do
    echo "  - $result"
done
echo ""
echo "Summary:"
echo "  Total Steps: $STEPS_TOTAL"
echo "  Passed: $STEPS_PASSED"
echo "  Failed: $STEPS_FAILED"
echo "  Success Rate: $(if [[ $STEPS_TOTAL -gt 0 ]]; then awk "BEGIN {printf \"%.1f%%\", ($STEPS_PASSED/$STEPS_TOTAL)*100}"; else echo "N/A"; fi)"

# Determine overall status
OVERALL_STATUS="FAILED"
if [[ $STEPS_FAILED -eq 0 ]]; then
    OVERALL_STATUS="PASSED"
elif [[ $STEPS_FAILED -le 1 ]] && [[ $STEPS_PASSED -ge 2 ]]; then
    OVERALL_STATUS="PASSED_WITH_WARNINGS"
fi

echo "  Overall Status: $OVERALL_STATUS"
echo ""

# Generate detailed report
REPORT_FILE="$ARTIFACTS_DIR/premerge_validation_report.json"
cat > "$REPORT_FILE" << EOF
{
  "premerge_validation": {
    "timestamp": "$(date -u '+%Y-%m-%d %H:%M:%S UTC')",
    "environment": "$ENV",
    "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
    "duration_seconds": $ORCHESTRATION_DURATION,
    "artifacts_directory": "$ARTIFACTS_DIR",
    "steps": {
      "total": $STEPS_TOTAL,
      "passed": $STEPS_PASSED,
      "failed": $STEPS_FAILED,
      "skipped": $((STEPS_TOTAL - STEPS_PASSED - STEPS_FAILED))
    },
    "overall_status": "$OVERALL_STATUS",
    "step_results": [$(IFS=$'\n'; for result in "${STEP_RESULTS[@]}"; do echo "\"$result\""; done | paste -sd,)]
  }
}
EOF

echo "Detailed report: $REPORT_FILE"

# Copy important logs to artifacts
echo ""
echo "Collecting artifacts..."

# Copy logs if they exist
if [[ -f "$REPO_ROOT/deploy-dryrun.log" ]]; then
    cp "$REPO_ROOT/deploy-dryrun.log" "$ARTIFACTS_DIR/"
    echo "✓ Copied deploy-dryrun.log"
fi

if [[ -f "$REPO_ROOT/migration-dryrun.log" ]]; then
    cp "$REPO_ROOT/migration-dryrun.log" "$ARTIFACTS_DIR/"
    echo "✓ Copied migration-dryrun.log"
fi

if [[ -f "$REPO_ROOT/postdeploy-smoketests.log" ]]; then
    cp "$REPO_ROOT/postdeploy-smoketests.log" "$ARTIFACTS_DIR/"
    echo "✓ Copied postdeploy-smoketests.log"
fi

if [[ -f "$REPO_ROOT/test_logging.log" ]]; then
    cp "$REPO_ROOT/test_logging.log" "$ARTIFACTS_DIR/"
    echo "✓ Copied test_logging.log"
fi

# Create artifact manifest
cat > "$ARTIFACTS_DIR/artifact_manifest.json" << EOF
{
  "manifest": {
    "creation_timestamp": "$(date -u '+%Y-%m-%d %H:%M:%S UTC')",
    "environment": "$ENV",
    "orchestration_status": "$OVERALL_STATUS",
    "artifacts": [
      $(find "$ARTIFACTS_DIR" -name "*.log" -o -name "*.json" | sed 's/.*\///' | jq -R . | paste -sd,)
    ],
    "artifact_count": $(find "$ARTIFACTS_DIR" -type f | wc -l),
    "total_size_bytes": $(du -sb "$ARTIFACTS_DIR" | cut -f1)
  }
}
EOF

echo "✓ Created artifact manifest"

# Create archive of artifacts
echo "Creating artifacts archive..."
cd "$REPO_ROOT"
tar -czf "premerge_artifacts_${ENV}_${TIMESTAMP}.tar.gz" -C . "premerge_artifacts"
sha256sum "premerge_artifacts_${ENV}_${TIMESTAMP}.tar.gz" > "premerge_artifacts_${ENV}_${TIMESTAMP}.tar.gz.sha256"

echo "✓ Artifacts archived: premerge_artifacts_${ENV}_${TIMESTAMP}.tar.gz"

echo ""
echo "========================================"
echo "NEXT STEPS"
echo "========================================"

if [[ "$OVERALL_STATUS" == "PASSED" ]]; then
    echo "✅ All pre-merge validation steps passed!"
    echo ""
    echo "Ready for deployment. Next actions:"
    echo "1. Attach artifacts to PR:"
    echo "   - premerge_artifacts_${ENV}_${TIMESTAMP}.tar.gz"
    echo "   - premerge_artifacts_${ENV}_${TIMESTAMP}.tar.gz.sha256"
    echo ""
    echo "2. Ensure backup files are attached:"
    echo "   - Latest backup from backups/ directory"
    echo "   - Corresponding .sha256 checksum file"
    echo ""
    echo "3. Obtain required approvals (≥2 reviewers, ≥1 Ops/SRE)"
    echo "4. Get Deploy operator (@ops) sign-off"
    echo "5. Proceed with guarded merge"
    
elif [[ "$OVERALL_STATUS" == "PASSED_WITH_WARNINGS" ]]; then
    echo "⚠️  Pre-merge validation passed with warnings"
    echo ""
    echo "Review warnings before proceeding:"
    for result in "${STEP_RESULTS[@]}"; do
        if [[ "$result" == *"FAILED"* ]]; then
            echo "  - $result"
        fi
    done
    echo ""
    echo "Consider fixing warnings before deployment"
    
else
    echo "❌ Pre-merge validation failed"
    echo ""
    echo "Failed steps:"
    for result in "${STEP_RESULTS[@]}"; do
        if [[ "$result" == *"FAILED"* ]]; then
            echo "  - $result"
        fi
    done
    echo ""
    echo "Required actions:"
    echo "1. Review failure logs in $ARTIFACTS_DIR/"
    echo "2. Fix identified issues"
    echo "3. Re-run validation before attempting deployment"
    echo "4. Do not proceed with deployment until all steps pass"
fi

echo ""
echo "Artifacts available at: $ARTIFACTS_DIR/"
echo "Archive: premerge_artifacts_${ENV}_${TIMESTAMP}.tar.gz"
echo "========================================"

# Exit with appropriate code
case "$OVERALL_STATUS" in
    "PASSED")
        exit 0
        ;;
    "PASSED_WITH_WARNINGS")
        exit 0  # Still allow merge, but with warnings
        ;;
    *)
        exit 1
        ;;
esac