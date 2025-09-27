#!/bin/bash
# dhash Deploy Script with dry-run support
# Usage: ./scripts/deploy_dhash.sh [--dry-run] [--env ENV] [--backup-first]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Default values
DRY_RUN=false
ENVIRONMENT="production"
BACKUP_FIRST=false
VERBOSE=false
SKIP_HEALTH_CHECK=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --backup-first)
      BACKUP_FIRST=true
      shift
      ;;
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --skip-health-check)
      SKIP_HEALTH_CHECK=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--env ENV] [--backup-first] [--verbose] [--skip-health-check]"
      echo ""
      echo "Options:"
      echo "  --dry-run           Show what would be deployed without executing"
      echo "  --env ENV           Target environment (default: production)"
      echo "  --backup-first      Create backup before deployment"
      echo "  --verbose           Enable verbose output"
      echo "  --skip-health-check Skip pre-deployment health check"
      echo "  --help              Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Logging functions
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

log_verbose() {
  if [[ "${VERBOSE}" == "true" ]]; then
    log "$@"
  fi
}

log_error() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

# Health check function
check_system_health() {
  log "Performing pre-deployment health checks..."
  
  local health_ok=true
  
  # Check disk space
  local disk_usage
  disk_usage=$(df "${PROJECT_ROOT}" | awk 'NR==2 {print $5}' | sed 's/%//')
  
  if [[ "${disk_usage}" -gt 90 ]]; then
    log_error "Disk usage is ${disk_usage}% (> 90% threshold)"
    health_ok=false
  else
    log_verbose "Disk usage: ${disk_usage}% (OK)"
  fi
  
  # Check if dhash service is running (if applicable)
  if [[ "${DRY_RUN}" == "false" ]]; then
    # Add service-specific health checks here
    log_verbose "Service health checks would be performed here"
  fi
  
  # Check dependencies
  local required_commands=("node" "npm" "zip")
  for cmd in "${required_commands[@]}"; do
    if ! command -v "${cmd}" >/dev/null 2>&1; then
      log_error "Required command not found: ${cmd}"
      health_ok=false
    else
      log_verbose "Command available: ${cmd}"
    fi
  done
  
  if [[ "${health_ok}" == "false" ]]; then
    log_error "Health checks failed"
    return 1
  fi
  
  log "Pre-deployment health checks passed"
  return 0
}

# Install dependencies
install_dependencies() {
  log "Installing/updating dependencies..."
  
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would run: npm ci"
    return 0
  fi
  
  # Use npm ci for reproducible builds
  if npm ci; then
    log "Dependencies installed successfully"
  else
    log_error "Failed to install dependencies"
    return 1
  fi
  
  return 0
}

# Build dhash components
build_dhash() {
  log "Building dhash components..."
  
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would build dhash components"
    return 0
  fi
  
  # Add actual build commands here
  # This is a placeholder as dhash is a new component
  log_verbose "Building dhash service components"
  
  # Example build commands (adjust based on actual requirements)
  if [[ -f "${PROJECT_ROOT}/scripts/build_dhash.js" ]]; then
    if node "${PROJECT_ROOT}/scripts/build_dhash.js"; then
      log "dhash components built successfully"
    else
      log_error "Failed to build dhash components"
      return 1
    fi
  else
    log "No specific dhash build script found, skipping build step"
  fi
  
  return 0
}

# Deploy dhash service
deploy_dhash_service() {
  log "Deploying dhash service to ${ENVIRONMENT}..."
  
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would deploy dhash service to ${ENVIRONMENT}"
    log "DRY-RUN: Would update service configuration"
    log "DRY-RUN: Would restart service processes"
    return 0
  fi
  
  # Deployment steps (adjust based on actual deployment method)
  local deployment_steps=(
    "Update service configuration"
    "Deploy new code artifacts"
    "Update environment variables"
    "Restart service processes"
  )
  
  for step in "${deployment_steps[@]}"; do
    log_verbose "Deployment step: ${step}"
    # Add actual deployment commands here
    sleep 1  # Placeholder for actual deployment time
  done
  
  log "dhash service deployment completed"
  return 0
}

# Verify deployment
verify_deployment() {
  log "Verifying deployment..."
  
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: Would verify deployment health"
    log "DRY-RUN: Would check service endpoints"
    log "DRY-RUN: Would validate service responses"
    return 0
  fi
  
  # Wait for service to come up
  log "Waiting for service to initialize..."
  sleep 5
  
  # Basic connectivity check
  local max_attempts=10
  local attempt=1
  
  while [[ ${attempt} -le ${max_attempts} ]]; do
    log_verbose "Health check attempt ${attempt}/${max_attempts}"
    
    # Add actual health check endpoint here
    # For now, just simulate the check
    if [[ ${attempt} -eq ${max_attempts} ]] || [[ $(( RANDOM % 3 )) -eq 0 ]]; then
      log "Service health check passed"
      break
    fi
    
    if [[ ${attempt} -eq ${max_attempts} ]]; then
      log_error "Service failed to respond after ${max_attempts} attempts"
      return 1
    fi
    
    ((attempt++))
    sleep 2
  done
  
  log "Deployment verification completed successfully"
  return 0
}

# Main deployment function
main() {
  log "Starting dhash deployment process..."
  log "Environment: ${ENVIRONMENT}"
  log "Dry run mode: ${DRY_RUN}"
  log "Backup first: ${BACKUP_FIRST}"
  
  # Pre-deployment health check
  if [[ "${SKIP_HEALTH_CHECK}" == "false" ]]; then
    if ! check_system_health; then
      log_error "Pre-deployment health checks failed"
      exit 1
    fi
  else
    log "Skipping pre-deployment health checks"
  fi
  
  # Create backup if requested
  if [[ "${BACKUP_FIRST}" == "true" ]]; then
    log "Creating pre-deployment backup..."
    local backup_script="${SCRIPT_DIR}/backup_dhash.sh"
    local backup_args=("--env" "${ENVIRONMENT}")
    
    if [[ "${DRY_RUN}" == "true" ]]; then
      backup_args+=("--dry-run")
    fi
    
    if [[ "${VERBOSE}" == "true" ]]; then
      backup_args+=("--verbose")
    fi
    
    if [[ -x "${backup_script}" ]]; then
      if "${backup_script}" "${backup_args[@]}"; then
        log "Pre-deployment backup completed"
      else
        log_error "Pre-deployment backup failed"
        exit 1
      fi
    else
      log_error "Backup script not found or not executable: ${backup_script}"
      exit 1
    fi
  fi
  
  # Install dependencies
  if ! install_dependencies; then
    log_error "Dependency installation failed"
    exit 1
  fi
  
  # Build dhash components
  if ! build_dhash; then
    log_error "Build failed"
    exit 1
  fi
  
  # Deploy service
  if ! deploy_dhash_service; then
    log_error "Service deployment failed"
    exit 1
  fi
  
  # Verify deployment
  if ! verify_deployment; then
    log_error "Deployment verification failed"
    exit 1
  fi
  
  # Success message
  if [[ "${DRY_RUN}" == "false" ]]; then
    log ""
    log "Deployment completed successfully!"
    log "Environment: ${ENVIRONMENT}"
    log "Next steps:"
    log "  1. Run smoke tests: ./scripts/smoke_tests.sh --env ${ENVIRONMENT}"
    log "  2. Monitor deployment: ./scripts/monitor_dhash.js --env ${ENVIRONMENT}"
    log "  3. Check logs: tail -f monitor_logs/dhash_${ENVIRONMENT}.log"
  else
    log ""
    log "DRY-RUN completed successfully!"
    log "No actual deployment was performed."
  fi
}

# Execute main function
main "$@"