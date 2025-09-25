#!/bin/bash
set -euo pipefail

# MOBIUS dhash Deployment Script
# Usage: ./deploy_dhash.sh --env <environment> --tag <release_tag> [--dry-run]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="${PROJECT_ROOT}/deploy-dryrun.log"

# Default values
ENVIRONMENT=""
RELEASE_TAG=""
DRY_RUN=false
DEPLOY_LEAD="${DEPLOY_LEAD:-@ops}"

# Load quality gates config
QUALITY_GATES_CONFIG="${PROJECT_ROOT}/quality-gates-config.json"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
    exit 1
}

usage() {
    cat << EOF
Usage: $0 --env <environment> --tag <release_tag> [options]

Options:
    --env ENVIRONMENT    Target environment (staging|production)
    --tag RELEASE_TAG    Git tag or commit hash to deploy
    --dry-run           Simulate deployment without making changes
    --help              Show this help message

Environment Variables:
    DEPLOY_LEAD         Deploy operator (default: @ops)
EOF
    exit 1
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --tag)
                RELEASE_TAG="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help)
                usage
                ;;
            *)
                error "Unknown option: $1"
                ;;
        esac
    done

    if [[ -z "$ENVIRONMENT" ]]; then
        error "Environment is required (--env)"
    fi

    if [[ -z "$RELEASE_TAG" ]]; then
        error "Release tag is required (--tag)"
    fi

    if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
        error "Environment must be 'staging' or 'production'"
    fi
}

validate_prerequisites() {
    log "Validating prerequisites for $ENVIRONMENT deployment..."
    
    # Check if quality gates config exists
    if [[ ! -f "$QUALITY_GATES_CONFIG" ]]; then
        error "Quality gates config not found: $QUALITY_GATES_CONFIG"
    fi
    
    # Check if release tag exists
    if ! git rev-parse "$RELEASE_TAG" >/dev/null 2>&1; then
        error "Release tag '$RELEASE_TAG' not found in git repository"
    fi
    
    # Check required tools
    for tool in node npm ffmpeg ffprobe; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            error "Required tool not found: $tool"
        fi
    done
    
    # Check Node.js version
    local node_version
    node_version=$(node --version | sed 's/v//')
    if [[ "$(printf '%s\n' "20.0.0" "$node_version" | sort -V | head -n1)" != "20.0.0" ]]; then
        error "Node.js 20+ required, found: $node_version"
    fi
    
    log "Prerequisites validated successfully"
}

create_backup() {
    log "Creating backup before deployment..."
    
    local backup_script="${SCRIPT_DIR}/backup_dhash.sh"
    if [[ -f "$backup_script" ]]; then
        if $DRY_RUN; then
            log "[DRY-RUN] Would create backup with: $backup_script --env $ENVIRONMENT"
        else
            "$backup_script" --env "$ENVIRONMENT"
        fi
    else
        log "Warning: Backup script not found, skipping backup creation"
    fi
}

run_pre_deploy_checks() {
    log "Running pre-deployment checks..."
    
    # Health check
    local health_script="${SCRIPT_DIR}/health_check.sh"
    if [[ -f "$health_script" ]]; then
        if $DRY_RUN; then
            log "[DRY-RUN] Would run health check: $health_script --env $ENVIRONMENT"
        else
            "$health_script" --env "$ENVIRONMENT" || error "Pre-deploy health check failed"
        fi
    fi
    
    # Build verification
    log "Verifying build for tag: $RELEASE_TAG"
    if $DRY_RUN; then
        log "[DRY-RUN] Would verify build"
    else
        # Check out the specific tag for build verification
        local current_branch
        current_branch=$(git rev-parse --abbrev-ref HEAD)
        git checkout "$RELEASE_TAG"
        
        # Run build
        npm ci
        npm run build --if-present
        
        # Return to original branch
        git checkout "$current_branch"
    fi
    
    log "Pre-deployment checks completed"
}

deploy_application() {
    log "Deploying dhash to $ENVIRONMENT with tag: $RELEASE_TAG"
    
    if $DRY_RUN; then
        log "[DRY-RUN] Would deploy application"
        log "[DRY-RUN] - Environment: $ENVIRONMENT"
        log "[DRY-RUN] - Release tag: $RELEASE_TAG"
        log "[DRY-RUN] - Deploy lead: $DEPLOY_LEAD"
        return
    fi
    
    # Create deployment directory
    local deploy_dir="${PROJECT_ROOT}/deployments/${ENVIRONMENT}-${RELEASE_TAG}"
    mkdir -p "$deploy_dir"
    
    # Checkout specific tag
    git archive "$RELEASE_TAG" | tar -x -C "$deploy_dir"
    
    # Build application in deployment directory
    cd "$deploy_dir"
    npm ci --production
    npm run build --if-present
    
    # Create deployment metadata
    cat > deployment-info.json << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "environment": "$ENVIRONMENT",
    "release_tag": "$RELEASE_TAG",
    "deploy_lead": "$DEPLOY_LEAD",
    "commit_hash": "$(git rev-parse "$RELEASE_TAG")",
    "node_version": "$(node --version)",
    "npm_version": "$(npm --version)"
}
EOF
    
    log "Application deployed successfully to: $deploy_dir"
    cd "$PROJECT_ROOT"
}

run_post_deploy_checks() {
    log "Running post-deployment checks..."
    
    # Health check
    local health_script="${SCRIPT_DIR}/health_check.sh"
    if [[ -f "$health_script" ]]; then
        if $DRY_RUN; then
            log "[DRY-RUN] Would run post-deploy health check"
        else
            "$health_script" --env "$ENVIRONMENT" --retries 3 || error "Post-deploy health check failed"
        fi
    fi
    
    # Smoke tests
    local smoke_script="${SCRIPT_DIR}/smoke_tests.sh"
    if [[ -f "$smoke_script" ]]; then
        if $DRY_RUN; then
            log "[DRY-RUN] Would run smoke tests"
        else
            "$smoke_script" --env "$ENVIRONMENT" > "${PROJECT_ROOT}/postdeploy-smoketests.log" || error "Post-deploy smoke tests failed"
        fi
    fi
    
    log "Post-deployment checks completed"
}

generate_deployment_report() {
    log "Generating deployment report..."
    
    local report_file="${PROJECT_ROOT}/deployment-report-${ENVIRONMENT}-${RELEASE_TAG}.json"
    
    cat > "$report_file" << EOF
{
    "deployment": {
        "environment": "$ENVIRONMENT",
        "release_tag": "$RELEASE_TAG", 
        "deploy_lead": "$DEPLOY_LEAD",
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "dry_run": $DRY_RUN,
        "status": "completed"
    },
    "artifacts": {
        "deploy_log": "$LOG_FILE",
        "smoke_tests": "postdeploy-smoketests.log",
        "backup": "backups/",
        "quality_gates": "$QUALITY_GATES_CONFIG"
    },
    "next_steps": [
        "Start monitoring with: ./scripts/monitor_dhash.sh --env $ENVIRONMENT --duration 3600",
        "Review deployment report and logs",
        "Monitor dashboards for T+60 minutes",
        "Verify all quality gates are within thresholds"
    ]
}
EOF
    
    log "Deployment report generated: $report_file"
}

main() {
    # Initialize log file
    echo "MOBIUS dhash Deployment - $(date)" > "$LOG_FILE"
    
    log "Starting dhash deployment process..."
    log "Environment: $ENVIRONMENT"
    log "Release tag: $RELEASE_TAG"
    log "Deploy lead: $DEPLOY_LEAD"
    log "Dry run: $DRY_RUN"
    
    validate_prerequisites
    create_backup
    run_pre_deploy_checks
    deploy_application
    run_post_deploy_checks
    generate_deployment_report
    
    if $DRY_RUN; then
        log "Dry run completed successfully. Review $LOG_FILE for details."
        log "Run without --dry-run to execute actual deployment."
    else
        log "Deployment completed successfully!"
        log "Next steps:"
        log "1. Start monitoring: ./scripts/monitor_dhash.sh --env $ENVIRONMENT --duration 3600"
        log "2. Review postdeploy-smoketests.log"
        log "3. Monitor dashboards for the next 60 minutes"
    fi
}

# Parse arguments and run main function
parse_args "$@"
main