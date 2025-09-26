#!/bin/bash
set -euo pipefail

# MOBIUS Deployment - Deploy Dry Run
# Validates deployment without making changes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --env ENV          Environment (staging|production) [required]"
    echo "  --output FILE      Output dry-run log to file [default: deploy-dryrun.log]"
    echo "  --verbose          Enable verbose logging"
    echo "  --help             Show this help message"
    echo ""
    echo "Validation checks:"
    echo "  - Git repository state"
    echo "  - Package dependencies"
    echo "  - Configuration files"
    echo "  - Environment variables"
    echo "  - Build requirements"
    echo "  - Deployment permissions"
    exit 1
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

# Parse arguments
ENV=""
OUTPUT_FILE="${PROJECT_ROOT}/deploy-dryrun.log"
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            shift 2
            ;;
        --output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
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

# Initialize validation state
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_TOTAL=0
WARNINGS=0

log "Starting deployment dry-run for environment: $ENV"
log "Output file: $OUTPUT_FILE"

# Create output directory
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Function to run a validation check
run_check() {
    local check_name="$1"
    local check_command="$2"
    local critical="${3:-false}"
    
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    
    log "Validating: $check_name"
    
    local check_output
    local check_result
    
    if check_output=$(eval "$check_command" 2>&1); then
        check_result="PASS"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        log "✅ $check_name - PASSED"
        
        if [[ "$VERBOSE" == "true" && -n "$check_output" ]]; then
            log "   Output: $check_output"
        fi
    else
        check_result="FAIL"
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
        log "❌ $check_name - FAILED"
        
        if [[ "$critical" == "true" ]]; then
            log "💥 Critical validation failed: $check_name"
            echo "CRITICAL_VALIDATION_FAILURE: $check_name" >> "$OUTPUT_FILE"
            echo "$check_output" >> "$OUTPUT_FILE"
            return 1
        else
            WARNINGS=$((WARNINGS + 1))
            log "⚠️  Non-critical validation failed: $check_name"
        fi
    fi
    
    # Log check result
    cat >> "$OUTPUT_FILE" << EOF
$(date '+%Y-%m-%d %H:%M:%S')|$check_name|$check_result|$check_output
EOF
}

# Validation functions
validate_git_state() {
    cd "$PROJECT_ROOT"
    
    # Check if we're in a git repository
    git rev-parse --git-dir > /dev/null 2>&1 &&
    
    # Check if there are uncommitted changes
    [[ -z "$(git status --porcelain)" ]] &&
    
    # Check if we're on a valid branch
    git branch --show-current > /dev/null 2>&1
}

validate_package_dependencies() {
    cd "$PROJECT_ROOT"
    
    # Check if package.json exists
    [[ -f "package.json" ]] &&
    
    # Check if package-lock.json exists
    [[ -f "package-lock.json" ]] &&
    
    # Validate package.json syntax
    node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" 2>/dev/null &&
    
    # Check if node_modules is present and up-to-date
    npm list --prod > /dev/null 2>&1
}

validate_configuration() {
    cd "$PROJECT_ROOT"
    
    # Check if environment-specific config exists
    if [[ -d "config/${ENV}" ]]; then
        # Validate config files are readable
        find "config/${ENV}" -type f -name "*.json" -exec node -e "JSON.parse(require('fs').readFileSync('{}', 'utf8'))" \; 2>/dev/null
    else
        # If no config directory, that might be OK
        return 0
    fi
}

validate_environment_variables() {
    # Check critical environment variables are set
    local required_vars=("NODE_ENV")
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            echo "Missing required environment variable: $var"
            return 1
        fi
    done
    
    return 0
}

validate_build_requirements() {
    # Check Node.js version
    local node_version
    node_version=$(node --version | sed 's/v//')
    
    # Require Node.js 16 or higher
    local major_version
    major_version=$(echo "$node_version" | cut -d. -f1)
    
    [[ $major_version -ge 16 ]]
}

validate_npm_audit() {
    cd "$PROJECT_ROOT"
    
    # Run npm audit and check for high/critical vulnerabilities
    local audit_output
    audit_output=$(npm audit --audit-level=high 2>&1 || true)
    
    # If audit finds issues, it returns non-zero
    if echo "$audit_output" | grep -q "found.*vulnerabilities"; then
        echo "Security vulnerabilities found in dependencies"
        echo "$audit_output"
        return 1
    fi
    
    return 0
}

validate_deployment_permissions() {
    # Check if deploy scripts are executable
    [[ -x "${SCRIPT_DIR}/backup.sh" ]] &&
    [[ -x "${SCRIPT_DIR}/rollback_dhash.sh" ]] &&
    [[ -x "${SCRIPT_DIR}/monitor.sh" ]] &&
    [[ -x "${SCRIPT_DIR}/smoke_tests.sh" ]]
}

validate_disk_space() {
    # Check available disk space (fail if <2GB available)
    local available_kb
    available_kb=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $4}')
    [[ $available_kb -gt 2097152 ]]  # 2GB in KB
}

validate_process_ports() {
    # Check if required ports are available
    local required_ports=("3000" "5001")
    
    for port in "${required_ports[@]}"; do
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            echo "Port $port is already in use"
            # This is a warning, not a failure for dry-run
        fi
    done
    
    return 0
}

validate_external_dependencies() {
    # Test external service connectivity (if applicable)
    # For now, just test internet connectivity
    curl -s -m 5 http://www.google.com > /dev/null 2>&1 || {
        echo "No internet connectivity detected"
        return 1
    }
}

# Run critical validations (must pass)
log "Running critical validations..."

run_check "Git Repository State" "validate_git_state" true || exit 1
run_check "Package Dependencies" "validate_package_dependencies" true || exit 1
run_check "Deployment Permissions" "validate_deployment_permissions" true || exit 1

# Run important validations (warnings only)
log "Running additional validations..."

run_check "Configuration Files" "validate_configuration" false
run_check "Environment Variables" "validate_environment_variables" false
run_check "Build Requirements" "validate_build_requirements" false
run_check "NPM Security Audit" "validate_npm_audit" false
run_check "Disk Space" "validate_disk_space" false
run_check "Process Ports" "validate_process_ports" false
run_check "External Dependencies" "validate_external_dependencies" false

# Generate deployment plan
log "Generating deployment plan..."

cat >> "$OUTPUT_FILE" << EOF

=== DEPLOYMENT PLAN FOR $ENV ===
Timestamp: $(date --iso-8601)
Git Commit: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')
Git Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')

Deployment steps would be:
1. Create backup using scripts/deploy/backup.sh --env $ENV
2. Install/update dependencies: npm ci --production
3. Run database migrations (if applicable)
4. Update configuration files for $ENV
5. Restart services
6. Run smoke tests using scripts/deploy/smoke_tests.sh --env $ENV
7. Start monitoring using scripts/deploy/monitor.sh --env $ENV

Rollback plan:
- Emergency rollback: scripts/deploy/rollback_dhash.sh --backup <latest-backup> --env $ENV
- Latest backup would be: $(ls -1 "${PROJECT_ROOT}"/backups/dhash_${ENV}_*.zip 2>/dev/null | sort -r | head -n1 || echo 'none found')
EOF

# Generate final report
log "Dry-run validation completed"
log "Results: $CHECKS_PASSED passed, $CHECKS_FAILED failed, $WARNINGS warnings, $CHECKS_TOTAL total"

# Create summary
cat >> "$OUTPUT_FILE" << EOF

=== VALIDATION SUMMARY ===
Total checks: $CHECKS_TOTAL
Passed: $CHECKS_PASSED
Failed: $CHECKS_FAILED
Warnings: $WARNINGS
Success rate: $(($CHECKS_PASSED * 100 / $CHECKS_TOTAL))%
EOF

log "Dry-run log: $OUTPUT_FILE"

# Exit with appropriate code
if [[ $CHECKS_FAILED -eq 0 ]]; then
    if [[ $WARNINGS -gt 0 ]]; then
        log "⚠️  Deployment validation passed with $WARNINGS warnings"
        exit 0
    else
        log "🎉 Deployment validation passed!"
        exit 0
    fi
else
    log "💥 Deployment validation failed with $CHECKS_FAILED critical issues"
    exit 1
fi