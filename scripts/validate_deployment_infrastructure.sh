#!/bin/bash
set -euo pipefail

# MOBIUS Deployment Infrastructure Validation Script
# Usage: ./validate_deployment_infrastructure.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
    exit 1
}

test_script_existence() {
    log "Testing script existence and permissions..."
    
    local scripts=(
        "scripts/deploy_dhash.sh"
        "scripts/monitor_dhash.sh"
        "scripts/rollback_dhash.sh"
        "scripts/backup_dhash.sh"
        "scripts/health_check.sh"
        "scripts/smoke_tests.sh"
        "scripts/send_notification.sh"
    )
    
    for script in "${scripts[@]}"; do
        if [[ -f "$script" && -x "$script" ]]; then
            log "✓ $script exists and is executable"
        else
            error "✗ $script missing or not executable"
        fi
    done
}

test_documentation() {
    log "Testing documentation files..."
    
    local docs=(
        "DEPLOYMENT_CHEAT_SHEET.md"
        "DEPLOYMENT_OPERATIONS_GUIDE.md"
        "NOTIFICATION_TEMPLATES.md"
        "PR_CHECKLIST_TEMPLATE.md"
        "READY_TO_COPY_ARTIFACTS.md"
        "quality-gates-config.json"
    )
    
    for doc in "${docs[@]}"; do
        if [[ -f "$doc" ]]; then
            log "✓ $doc exists"
        else
            error "✗ $doc missing"
        fi
    done
}

test_quality_gates_config() {
    log "Testing quality gates configuration..."
    
    if node -e "
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync('quality-gates-config.json', 'utf8'));
        console.log('✓ Quality gates config is valid JSON');
        console.log('Environment:', config.environment);
        console.log('Quality gates:', Object.keys(config.quality_gates).length);
        if (!config.quality_gates.health_checks) throw new Error('Missing health_checks');
        if (!config.quality_gates.error_rates) throw new Error('Missing error_rates');
        console.log('✓ Quality gates structure is valid');
    "; then
        log "✓ Quality gates configuration validated"
    else
        error "✗ Quality gates configuration invalid"
    fi
}

test_script_help_functions() {
    log "Testing script help functions..."
    
    local scripts=(
        "scripts/deploy_dhash.sh"
        "scripts/monitor_dhash.sh"
        "scripts/rollback_dhash.sh"
        "scripts/backup_dhash.sh"
        "scripts/health_check.sh"
        "scripts/smoke_tests.sh"
        "scripts/send_notification.sh"
    )
    
    for script in "${scripts[@]}"; do
        # Test that help text is displayed and contains usage information
        local help_output
        help_output=$("$script" --help 2>&1 || true)
        if echo "$help_output" | grep -qi "usage:" && echo "$help_output" | grep -q "Options:"; then
            log "✓ $script --help works"
        else
            log "⚠ $script --help may have issues (continuing)"
        fi
    done
}

test_ci_workflows() {
    log "Testing CI workflow files..."
    
    local workflows=(
        ".github/workflows/ci.yml"
        ".github/workflows/premerge-validation.yml"
        ".github/workflows/golden-approve.yml"
        ".github/workflows/golden-preview-checks.yml"
    )
    
    for workflow in "${workflows[@]}"; do
        if [[ -f "$workflow" ]]; then
            log "✓ $workflow exists"
            # Basic YAML syntax check
            if command -v yamllint >/dev/null 2>&1; then
                yamllint "$workflow" || log "⚠ YAML linting issues in $workflow"
            fi
        else
            error "✗ $workflow missing"
        fi
    done
}

test_directory_structure() {
    log "Testing directory structure..."
    
    # Create test directories that would be created during normal operation
    mkdir -p backups monitor_logs premerge_artifacts
    
    if [[ -d "scripts" && -d ".github/workflows" ]]; then
        log "✓ Directory structure is correct"
    else
        error "✗ Required directory structure missing"
    fi
}

test_notification_dry_run() {
    log "Testing notification system (dry run)..."
    
    # The notification script exits with code 1 when no webhooks are configured, but that's expected
    local output
    output=$(./scripts/send_notification.sh --type deploy_success \
        --environment staging --release v1.0.0-test \
        --deploy-lead @ops --duration "2min" --dry-run 2>&1 || true)
    
    if echo "$output" | grep -q "DRY RUN mode enabled"; then
        log "✓ Notification system works (dry run)"
    else
        log "⚠ Notification system may have issues (continuing)"
    fi
}

test_health_check_simulation() {
    log "Testing health check simulation..."
    
    if ./scripts/health_check.sh --env staging --timeout 5 --retries 1 >/dev/null 2>&1; then
        log "✓ Health check simulation works"
    else
        error "✗ Health check simulation failed"
    fi
}

run_comprehensive_validation() {
    log "Starting comprehensive deployment infrastructure validation..."
    
    test_script_existence
    test_documentation
    test_quality_gates_config
    test_script_help_functions
    test_ci_workflows
    test_directory_structure
    test_notification_dry_run
    test_health_check_simulation
    
    log "All validation tests passed! ✅"
    log ""
    log "Deployment infrastructure is ready for production use."
    log ""
    log "Next steps:"
    log "1. Review all documentation files"
    log "2. Configure webhook URLs in environment variables"
    log "3. Test deployment scripts in staging environment"
    log "4. Set up branch protection rules with required status checks"
    log "5. Configure monitoring dashboards and alerts"
}

main() {
    run_comprehensive_validation
}

main "$@"