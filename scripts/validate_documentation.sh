#!/bin/bash

# validate_documentation.sh - Validate all documentation files and links
# Usage: ./scripts/validate_documentation.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR $(date +'%H:%M:%S')]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS $(date +'%H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN $(date +'%H:%M:%S')]${NC} $1"
}

cd "$PROJECT_ROOT"

log "Validating MOBIUS dhash documentation..."

ISSUES_FOUND=0

# Check required documentation files exist
log "=== Checking Documentation Files ==="

REQUIRED_DOCS=(
    "DEPLOYMENT_CHEAT_SHEET.md"
    "NOTIFICATION_TEMPLATES.md" 
    "DEPLOYMENT_OPERATIONS_GUIDE.md"
    "PR_CHECKLIST_TEMPLATE.md"
    "PR_COMMENT_TEMPLATES.md"
    "quality-gates-config.json"
)

for doc in "${REQUIRED_DOCS[@]}"; do
    if [[ -f "$doc" ]]; then
        success "✓ $doc exists"
    else
        error "✗ Missing required documentation: $doc"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
done

# Check required scripts exist and are executable
log "=== Checking Script Files ==="

REQUIRED_SCRIPTS=(
    "scripts/premerge_run.sh"
    "scripts/deploy_dhash.sh" 
    "scripts/monitor_dhash.sh"
    "scripts/rollback_dhash.sh"
    "scripts/create_premerge_bundle.sh"
)

for script in "${REQUIRED_SCRIPTS[@]}"; do
    if [[ -f "$script" ]]; then
        if [[ -x "$script" ]]; then
            success "✓ $script exists and is executable"
        else
            error "✗ $script exists but is not executable"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        fi
    else
        error "✗ Missing required script: $script"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
done

# Validate JSON configuration
log "=== Validating JSON Configuration ==="

if [[ -f "quality-gates-config.json" ]]; then
    if node -e "JSON.parse(require('fs').readFileSync('quality-gates-config.json', 'utf8'))" 2>/dev/null; then
        success "✓ quality-gates-config.json is valid JSON"
        
        # Check required fields
        REQUIRED_FIELDS=(
            ".quality_gates.environments.production.audio.lufs_tolerance"
            ".quality_gates.environments.production.video.ssim_threshold"
            ".quality_gates.monitoring.check_interval_seconds"
        )
        
        for field in "${REQUIRED_FIELDS[@]}"; do
            if node -e "
                const config = JSON.parse(require('fs').readFileSync('quality-gates-config.json', 'utf8'));
                const getValue = (obj, path) => path.split('.').slice(1).reduce((o, k) => o && o[k], obj);
                const value = getValue(config, '$field');
                if (value !== undefined) { console.log('Found: $field =', value); } else { process.exit(1); }
            " 2>/dev/null; then
                success "✓ Required field present: $field"
            else
                error "✗ Missing required field: $field"
                ISSUES_FOUND=$((ISSUES_FOUND + 1))
            fi
        done
    else
        error "✗ quality-gates-config.json is not valid JSON"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
fi

# Check for placeholder replacements needed
log "=== Checking for Placeholders ==="

PLACEHOLDER_FILES=(
    "DEPLOYMENT_CHEAT_SHEET.md"
    "NOTIFICATION_TEMPLATES.md"
    "DEPLOYMENT_OPERATIONS_GUIDE.md"
)

PLACEHOLDERS_TO_CHECK=(
    "RELEASE_TAG"
    "@DEPLOY_LEAD"
    "BACKUP_FILE"
)

for file in "${PLACEHOLDER_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        log "Checking placeholders in $file..."
        for placeholder in "${PLACEHOLDERS_TO_CHECK[@]}"; do
            count=$(grep -c "$placeholder" "$file" 2>/dev/null || echo "0")
            if [[ $count -gt 0 ]]; then
                log "  Found $count instances of '$placeholder' (to be replaced before use)"
            fi
        done
    fi
done

# Validate script help output
log "=== Validating Script Help Output ==="

for script in scripts/deploy_dhash.sh scripts/monitor_dhash.sh scripts/rollback_dhash.sh; do
    if [[ -x "$script" ]]; then
        if "$script" --help >/dev/null 2>&1; then
            success "✓ $script --help works"
        else
            warn "⚠ $script --help failed (may be expected)"
        fi
    fi
done

# Check GitHub workflow file
log "=== Checking GitHub Workflow ==="

WORKFLOW_FILE=".github/workflows/premerge-validation.yml"
if [[ -f "$WORKFLOW_FILE" ]]; then
    success "✓ Premerge validation workflow exists"
    
    # Basic YAML syntax check
    if command -v python3 >/dev/null 2>&1; then
        if python3 -c "import yaml; yaml.safe_load(open('$WORKFLOW_FILE'))" 2>/dev/null; then
            success "✓ Workflow YAML syntax is valid"
        else
            error "✗ Workflow YAML syntax error"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        fi
    else
        warn "⚠ Cannot validate YAML (python3 not available)"
    fi
else
    error "✗ Missing GitHub workflow: $WORKFLOW_FILE"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check documentation cross-references
log "=== Checking Documentation Cross-references ==="

# Check that scripts referenced in docs exist
if [[ -f "DEPLOYMENT_OPERATIONS_GUIDE.md" ]]; then
    # Extract script references from the operations guide
    REFERENCED_SCRIPTS=$(grep -o "scripts/[a-zA-Z_]*\.sh" "DEPLOYMENT_OPERATIONS_GUIDE.md" 2>/dev/null | sort -u || true)
    
    for ref_script in $REFERENCED_SCRIPTS; do
        if [[ -f "$ref_script" ]]; then
            success "✓ Referenced script exists: $ref_script"
        else
            warn "⚠ Referenced script missing: $ref_script"
        fi
    done
fi

# Generate validation report
log "=== Generating Validation Report ==="

REPORT_FILE="documentation_validation_report_$(date +%Y%m%d_%H%M%S).txt"

{
    echo "MOBIUS dhash Documentation Validation Report"
    echo "==========================================="
    echo ""
    echo "Validation Time: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
    echo "Git Commit: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
    echo "Git Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
    echo ""
    echo "Files Validated:"
    for doc in "${REQUIRED_DOCS[@]}" "${REQUIRED_SCRIPTS[@]}" "$WORKFLOW_FILE"; do
        if [[ -f "$doc" ]]; then
            echo "  ✓ $doc"
        else
            echo "  ✗ $doc (missing)"
        fi
    done
    echo ""
    if [[ $ISSUES_FOUND -eq 0 ]]; then
        echo "Result: ✅ ALL VALIDATIONS PASSED"
        echo ""
        echo "Documentation is ready for production deployment."
        echo "Remember to replace placeholders before actual use:"
        echo "  - RELEASE_TAG → actual version (e.g., v2.1.0)"
        echo "  - @DEPLOY_LEAD → actual deploy lead"
        echo "  - Environment-specific values as needed"
    else
        echo "Result: ❌ $ISSUES_FOUND ISSUES FOUND"
        echo ""
        echo "Please fix the issues above before proceeding."
    fi
    echo ""
    echo "Quality Gates Configuration:"
    if [[ -f "quality-gates-config.json" ]]; then
        echo "  SSIM Threshold: $(node -e "console.log(JSON.parse(require('fs').readFileSync('quality-gates-config.json', 'utf8')).quality_gates.environments.production.video.ssim_threshold)" 2>/dev/null || echo 'N/A')"
        echo "  LUFS Tolerance: ±$(node -e "console.log(JSON.parse(require('fs').readFileSync('quality-gates-config.json', 'utf8')).quality_gates.environments.production.audio.lufs_tolerance)" 2>/dev/null || echo 'N/A') dB"
        echo "  Response Time Max: $(node -e "console.log(JSON.parse(require('fs').readFileSync('quality-gates-config.json', 'utf8')).quality_gates.environments.production.performance.response_time_max_ms)" 2>/dev/null || echo 'N/A')ms"
    fi
    echo ""
    echo "Deployment Scripts Available:"
    for script in "${REQUIRED_SCRIPTS[@]}"; do
        if [[ -x "$script" ]]; then
            echo "  ✓ $script"
        else
            echo "  ✗ $script (missing or not executable)"
        fi
    done
} > "$REPORT_FILE"

success "Validation report generated: $REPORT_FILE"

# Final summary
echo ""
echo "====================================================================="
if [[ $ISSUES_FOUND -eq 0 ]]; then
    success "🎉 Documentation validation completed successfully!"
    log "All required files exist and are properly configured."
    log "Ready for production deployment process."
else
    error "❌ Found $ISSUES_FOUND issues that need to be addressed."
    log "Please fix the issues above before proceeding with deployment."
fi
echo "====================================================================="
echo ""
log "Validation Summary:"
echo "  📁 Documentation files: ${#REQUIRED_DOCS[@]} checked"
echo "  🔧 Script files: ${#REQUIRED_SCRIPTS[@]} checked"  
echo "  ⚙️ Configuration: quality-gates-config.json validated"
echo "  🚀 GitHub workflow: premerge-validation.yml checked"
echo "  📋 Report: $REPORT_FILE"
echo ""
log "Next steps:"
if [[ $ISSUES_FOUND -eq 0 ]]; then
    echo "  1. Review validation report: $REPORT_FILE"
    echo "  2. Test scripts in staging environment"
    echo "  3. Replace placeholders for actual deployment"
    echo "  4. Create PR with deployment-ready changes"
else
    echo "  1. Fix $ISSUES_FOUND issue(s) identified above"
    echo "  2. Re-run validation: ./scripts/validate_documentation.sh"
    echo "  3. Proceed when all checks pass"
fi
echo ""
echo "====================================================================="

exit $ISSUES_FOUND