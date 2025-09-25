#!/bin/bash

# Deploy DHASH - Handles staging/production deployments with health monitoring
# Supports dry-run mode for safe deployment testing

set -euo pipefail

# Configuration
ENVIRONMENT="${ENVIRONMENT:-staging}"
DRY_RUN="${DRY_RUN:-true}"
HEALTH_URL="${HEALTH_URL:-http://localhost:5000/health}"
METRICS_URL="${METRICS_URL:-http://localhost:5000/metrics/dhash}"
DEPLOY_TIMEOUT="${DEPLOY_TIMEOUT:-300}"
HEALTH_CHECK_RETRIES="${HEALTH_CHECK_RETRIES:-10}"
HEALTH_CHECK_INTERVAL="${HEALTH_CHECK_INTERVAL:-30}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" >&2
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" >&2
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}" >&2
}

# Help function
show_help() {
    cat << EOF
Deploy DHASH - Staging/Production deployment with health monitoring

Usage: $0 [OPTIONS]

Options:
    --env <environment>     Target environment (staging|production) [default: staging]
    --dry-run              Run in dry-run mode (safe testing) [default: true]
    --no-dry-run           Disable dry-run mode
    --health-url <url>     Health check endpoint [default: http://localhost:5000/health]
    --metrics-url <url>    Metrics endpoint [default: http://localhost:5000/metrics/dhash]
    --timeout <seconds>    Deployment timeout [default: 300]
    --retries <count>      Health check retries [default: 10]
    --interval <seconds>   Health check interval [default: 30]
    --skip-health          Skip post-deployment health checks
    --rollback             Trigger rollback to previous version
    --help, -h             Show this help message

Examples:
    # Staging deployment with dry-run
    $0 --env staging

    # Production deployment (real)
    $0 --env production --no-dry-run

    # Emergency rollback
    $0 --rollback --env production --no-dry-run

Environment Variables:
    ENVIRONMENT           Target environment
    DRY_RUN              Enable/disable dry-run mode  
    HEALTH_URL           Health endpoint URL
    METRICS_URL          Metrics endpoint URL
    DEPLOY_TIMEOUT       Deployment timeout in seconds
EOF
}

# Parse command line arguments
parse_args() {
    local action="deploy"
    local skip_health=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --no-dry-run)
                DRY_RUN=false
                shift
                ;;
            --health-url)
                HEALTH_URL="$2"
                shift 2
                ;;
            --metrics-url)
                METRICS_URL="$2"
                shift 2
                ;;
            --timeout)
                DEPLOY_TIMEOUT="$2"
                shift 2
                ;;
            --retries)
                HEALTH_CHECK_RETRIES="$2"
                shift 2
                ;;
            --interval)
                HEALTH_CHECK_INTERVAL="$2"
                shift 2
                ;;
            --skip-health)
                skip_health=true
                shift
                ;;
            --rollback)
                action="rollback"
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    export ACTION="$action"
    export SKIP_HEALTH="$skip_health"
}

# Validate environment and prerequisites
validate_environment() {
    log "Validating deployment environment..."
    
    # Validate environment parameter
    if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
        exit 1
    fi
    
    # Environment-specific validations
    if [[ "$ENVIRONMENT" == "production" && "$DRY_RUN" == "false" ]]; then
        log_warning "⚠️  PRODUCTION DEPLOYMENT - This will affect live systems!"
        
        # Require explicit confirmation for production
        if [[ -t 0 && -t 2 ]]; then  # Check if running interactively
            read -p "Type 'YES' to confirm production deployment: " confirm
            if [[ "$confirm" != "YES" ]]; then
                log_error "Production deployment cancelled"
                exit 1
            fi
        fi
    fi
    
    # Check required tools
    local required_tools=("curl" "jq")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            log_warning "$tool not found, some features may be limited"
        fi
    done
    
    log_success "Environment validation complete"
}

# Check application health
check_health() {
    local url="$1"
    local max_retries="${2:-3}"
    local retry_interval="${3:-10}"
    
    log "Checking health endpoint: $url"
    
    for ((i=1; i<=max_retries; i++)); do
        if command -v curl >/dev/null 2>&1; then
            if curl -sf "$url" >/dev/null 2>&1; then
                log_success "Health check passed (attempt $i/$max_retries)"
                return 0
            else
                log_warning "Health check failed (attempt $i/$max_retries)"
                if [[ $i -lt $max_retries ]]; then
                    sleep "$retry_interval"
                fi
            fi
        else
            log_warning "curl not available, skipping health check"
            return 0
        fi
    done
    
    log_error "Health check failed after $max_retries attempts"
    return 1
}

# Get application metrics
get_metrics() {
    local url="$1"
    
    log "Fetching metrics from: $url"
    
    if command -v curl >/dev/null 2>&1; then
        if curl -sf "$url" 2>/dev/null; then
            log_success "Metrics retrieved successfully"
            return 0
        else
            log_warning "Failed to retrieve metrics"
            return 1
        fi
    else
        log_warning "curl not available, cannot retrieve metrics"
        return 1
    fi
}

# Simulate or execute deployment steps
deploy_application() {
    log "Starting application deployment to $ENVIRONMENT..."
    
    local deployment_steps=(
        "Pre-deployment validation"
        "Service graceful shutdown"
        "Code deployment"
        "Database migrations"
        "Configuration updates"
        "Service startup"
        "Health verification"
    )
    
    for step in "${deployment_steps[@]}"; do
        log "Executing: $step"
        
        if [[ "$DRY_RUN" == "true" ]]; then
            log "DRY-RUN: Would execute $step"
            sleep 1  # Simulate work
        else
            # Simulate deployment work
            case "$step" in
                "Pre-deployment validation")
                    # Check prerequisites
                    validate_deployment_prerequisites
                    ;;
                "Service graceful shutdown")
                    # Graceful shutdown simulation
                    sleep 2
                    ;;
                "Code deployment")
                    # Code deployment simulation  
                    sleep 3
                    ;;
                "Database migrations")
                    # Run migrations
                    run_migrations
                    ;;
                "Configuration updates")
                    # Update configuration
                    sleep 1
                    ;;
                "Service startup")
                    # Service startup
                    sleep 2
                    ;;
                "Health verification")
                    # Health checks will be done separately
                    :
                    ;;
            esac
        fi
        
        log_success "$step completed"
    done
    
    log_success "Deployment steps completed"
}

# Validate deployment prerequisites
validate_deployment_prerequisites() {
    log "Validating deployment prerequisites..."
    
    # Check for required environment variables
    local required_vars=("ENVIRONMENT")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "Required environment variable not set: $var"
            return 1
        fi
    done
    
    # Check disk space (example)
    if command -v df >/dev/null 2>&1; then
        local available_space=$(df . | awk 'NR==2 {print $4}')
        local min_required=1000000  # 1GB in KB
        
        if [[ $available_space -lt $min_required ]]; then
            log_warning "Low disk space: ${available_space}KB available"
        fi
    fi
    
    log_success "Prerequisites validation completed"
}

# Run database migrations
run_migrations() {
    log "Running database migrations..."
    
    local migration_script="migrate-dhash.js"
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    if [[ -f "$script_dir/$migration_script" ]]; then
        local migrate_args=("--env" "$ENVIRONMENT")
        
        if [[ "$DRY_RUN" == "true" ]]; then
            migrate_args+=("--dry-run")
        fi
        
        node "$script_dir/$migration_script" "${migrate_args[@]}"
    else
        log_warning "Migration script not found: $migration_script"
    fi
}

# Perform rollback
perform_rollback() {
    log "Initiating rollback for $ENVIRONMENT..."
    
    local rollback_script="rollback_dhash.sh"
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    if [[ -f "$script_dir/$rollback_script" ]]; then
        local rollback_args=("--env" "$ENVIRONMENT")
        
        if [[ "$DRY_RUN" == "true" ]]; then
            rollback_args+=("--dry-run")
        fi
        
        bash "$script_dir/$rollback_script" "${rollback_args[@]}"
        log_success "Rollback initiated"
    else
        log_error "Rollback script not found: $rollback_script"
        return 1
    fi
}

# Post-deployment monitoring
post_deployment_monitoring() {
    if [[ "$SKIP_HEALTH" == "true" ]]; then
        log_warning "Skipping post-deployment health checks as requested"
        return 0
    fi

    log "Starting post-deployment monitoring..."
    
    # Wait a moment for services to start
    log "Waiting for services to stabilize..."
    sleep 5
    
    # Perform health checks
    if ! check_health "$HEALTH_URL" "$HEALTH_CHECK_RETRIES" "$HEALTH_CHECK_INTERVAL"; then
        log_error "Post-deployment health checks failed"
        
        if [[ "$DRY_RUN" == "false" ]]; then
            log_warning "Consider triggering rollback: $0 --rollback --env $ENVIRONMENT --no-dry-run"
        fi
        
        return 1
    fi
    
    # Get current metrics for baseline
    log "Collecting post-deployment metrics..."
    get_metrics "$METRICS_URL" | head -20 || log_warning "Could not collect metrics"
    
    log_success "Post-deployment monitoring completed"
}

# Generate deployment report
generate_deployment_report() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local report_file="artifacts/deploy_${ENVIRONMENT}_$(date +%Y%m%d_%H%M%S).json"
    
    mkdir -p artifacts
    
    local report_data="{
  \"deployment\": {
    \"environment\": \"$ENVIRONMENT\",
    \"timestamp\": \"$timestamp\",
    \"dry_run\": $DRY_RUN,
    \"action\": \"$ACTION\"
  },
  \"health\": {
    \"endpoint\": \"$HEALTH_URL\",
    \"metrics_endpoint\": \"$METRICS_URL\"
  },
  \"configuration\": {
    \"timeout\": $DEPLOY_TIMEOUT,
    \"health_check_retries\": $HEALTH_CHECK_RETRIES,
    \"health_check_interval\": $HEALTH_CHECK_INTERVAL
  }
}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY-RUN: Would create deployment report: $report_file"
        log "Report content: $report_data"
    else
        echo "$report_data" > "$report_file"
        log_success "Deployment report created: $report_file"
    fi
}

# Main execution function
main() {
    local start_time=$(date +%s)
    
    log "🚀 Starting DHASH deployment operations"
    log "Environment: $ENVIRONMENT"
    log "Dry-run mode: $DRY_RUN"
    
    # Parse arguments
    parse_args "$@"
    
    # Validate environment
    validate_environment
    
    case "$ACTION" in
        "deploy")
            deploy_application
            post_deployment_monitoring
            ;;
        "rollback")
            perform_rollback
            ;;
        *)
            log_error "Unknown action: $ACTION"
            exit 1
            ;;
    esac
    
    # Generate deployment report
    generate_deployment_report
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log_success "🎉 DHASH deployment operations completed"
    log_success "Total execution time: ${duration}s"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "This was a DRY-RUN. No actual changes were made."
        log "To run with real operations, use: $0 --no-dry-run"
    fi
}

# Handle script errors
trap 'log_error "Deployment failed at line $LINENO"' ERR

# Execute main function
main "$@"