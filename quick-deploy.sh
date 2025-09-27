#!/bin/bash
#
# quick-deploy.sh - Convenience wrapper for production dhash deployments
#
# Usage: ./quick-deploy.sh [--dry-run] [--env production]
#

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default values
ENV="production"
DRY_RUN=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Usage information
usage() {
    cat << EOF
Quick Deploy - Convenience wrapper for dhash production deployments

Usage: $0 [OPTIONS]

This script provides a simplified interface for common dhash deployment tasks.

Options:
  --dry-run        Perform validation checks without actual deployment
  --env ENV        Target environment (default: production)
  --help          Show this help message

Examples:
  $0                    # Deploy to production
  $0 --dry-run          # Validate production deployment
  $0 --env staging      # Deploy to staging

Quick Commands:
  Deploy:     $0
  Validate:   $0 --dry-run
  Rollback:   $SCRIPT_DIR/scripts/rollback_dhash.sh --backup \$(ls -t backups/dhash_*.zip | head -n1) --env production

Safety Features:
  ✓ Automatic backup creation
  ✓ Health checks before and after deployment
  ✓ 60-minute post-deployment monitoring
  ✓ Configurable quality gates
  ✓ Multi-channel notifications
  ✓ Comprehensive logging

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENV="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# Pre-flight checks
pre_flight_checks() {
    log_info "Running pre-flight checks..."
    
    # Check if we're in the right directory
    if [[ ! -f "$SCRIPT_DIR/package.json" ]]; then
        log_error "Not in project root directory"
        log_error "Run this script from the project root: ./quick-deploy.sh"
        exit 1
    fi
    
    # Check for required scripts
    local required_scripts=(
        "scripts/deploy_dhash.sh"
        "scripts/backup_dhash.sh"
        "scripts/migrate_dhash.sh"
        "scripts/rollback_dhash.sh"
    )
    
    for script in "${required_scripts[@]}"; do
        if [[ ! -x "$SCRIPT_DIR/$script" ]]; then
            log_error "Required script not found or not executable: $script"
            exit 1
        fi
    done
    
    # Check for git status (warn if uncommitted changes)
    if command -v git &> /dev/null && git status &> /dev/null; then
        if ! git diff-index --quiet HEAD -- 2>/dev/null; then
            log_warn "Uncommitted changes detected in repository"
            if [[ "$DRY_RUN" == false ]]; then
                read -p "Continue with deployment? (y/N): " -n 1 -r
                echo
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    log_info "Deployment cancelled by user"
                    exit 0
                fi
            fi
        fi
    fi
    
    # Environment-specific checks
    case "$ENV" in
        production)
            log_warn "PRODUCTION DEPLOYMENT - Exercise extreme caution!"
            if [[ "$DRY_RUN" == false ]]; then
                echo
                echo "This will deploy dhash to PRODUCTION environment."
                echo "Are you sure you want to continue?"
                read -p "Type 'DEPLOY' to confirm: " -r
                echo
                if [[ "$REPLY" != "DEPLOY" ]]; then
                    log_info "Deployment cancelled"
                    exit 0
                fi
            fi
            ;;
        staging)
            log_info "Staging deployment - safer testing environment"
            ;;
        development)
            log_info "Development deployment - local testing"
            ;;
        *)
            log_error "Invalid environment: $ENV"
            exit 1
            ;;
    esac
    
    log_success "Pre-flight checks completed"
}

# Show deployment summary
show_deployment_summary() {
    local action="DEPLOY"
    if [[ "$DRY_RUN" == true ]]; then
        action="VALIDATE"
    fi
    
    cat << EOF

╔══════════════════════════════════════════════════════════════╗
║                    DHASH DEPLOYMENT SUMMARY                  ║
╠══════════════════════════════════════════════════════════════╣
║  Action:      $action                                       ║
║  Environment: $ENV                                          ║
║  Timestamp:   $(date)                         ║
║  User:        $(whoami)                                     ║
║  Host:        $(hostname)                                   ║
╚══════════════════════════════════════════════════════════════╝

Deployment Pipeline:
1. Environment validation and pre-flight checks
2. Pre-deployment health checks
3. Automatic backup creation with SHA256 verification
4. Database migrations (forward)
5. Application deployment
6. Post-deployment validation and smoke tests
7. 60-minute adaptive monitoring with auto-rollback
8. Multi-channel notifications

Quality Gates (configurable):
• Health failures: >2 consecutive → auto-rollback
• Extraction failure rate: >5% over 10 min → auto-rollback  
• P95 hash time: >2000ms over 15 min → auto-rollback
• Low-confidence queue: >1000 items → auto-rollback

EOF
}

# Show quick reference commands
show_quick_reference() {
    cat << EOF

═══════════════════════════════════════════════════════════════
QUICK REFERENCE COMMANDS
═══════════════════════════════════════════════════════════════

Monitor deployment:
  tail -f deploy_logs/monitor.log

Check recent backups:
  ls -la backups/dhash_*.zip | head -5

Emergency rollback:
  LATEST_BACKUP=\$(ls -t backups/dhash_*.zip | head -n1)
  ./scripts/rollback_dhash.sh --backup "\$LATEST_BACKUP" --env $ENV

Verify backup integrity:
  LATEST_BACKUP=\$(ls -t backups/dhash_*.zip | head -n1)
  sha256sum -c "\${LATEST_BACKUP}.sha256"

Check system health:
  curl -s \${DHASH_${ENV^^}_URL:-http://localhost:3000}/health | jq .

View deployment logs:
  tail -f deploy_logs/deploy.log

Stop monitoring (if needed):
  kill \$(cat deploy_logs/monitor.pid)

═══════════════════════════════════════════════════════════════

EOF
}

# Main execution
main() {
    # Parse arguments
    parse_args "$@"
    
    # Show deployment summary
    show_deployment_summary
    
    # Ask for final confirmation for production
    if [[ "$ENV" == "production" && "$DRY_RUN" == false ]]; then
        echo "Final confirmation required for PRODUCTION deployment."
        read -p "Proceed with deployment? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled"
            exit 0
        fi
    fi
    
    # Run pre-flight checks
    pre_flight_checks
    
    # Execute deployment
    log_info "Executing dhash deployment..."
    
    local deploy_args=(
        "--env" "$ENV"
    )
    
    if [[ "$DRY_RUN" == true ]]; then
        deploy_args+=("--dry-run")
    fi
    
    if "$SCRIPT_DIR/scripts/deploy_dhash.sh" "${deploy_args[@]}"; then
        if [[ "$DRY_RUN" == true ]]; then
            log_success "Deployment validation completed successfully!"
            echo
            log_info "To proceed with actual deployment, run:"
            log_info "$0 --env $ENV"
        else
            log_success "Deployment completed successfully!"
            show_quick_reference
        fi
        exit 0
    else
        log_error "Deployment failed!"
        log_error "Check logs for details: deploy_logs/"
        
        if [[ "$DRY_RUN" == false ]]; then
            echo
            log_warn "If deployment partially succeeded, you may need to rollback:"
            log_warn "LATEST_BACKUP=\$(ls -t backups/dhash_*.zip | head -n1)"
            log_warn "./scripts/rollback_dhash.sh --backup \"\$LATEST_BACKUP\" --env $ENV"
        fi
        
        exit 1
    fi
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi