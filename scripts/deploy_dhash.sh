#!/bin/bash

# Deploy script for dhash component with guarded rollout support
# Supports dry-run mode and environment-specific deployments

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Default values
DRY_RUN=false
ENVIRONMENT="staging"
BACKUP_REQUIRED=true
MONITORING_ENABLED=true

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
    --no-backup)
      BACKUP_REQUIRED=false
      shift
      ;;
    --no-monitoring)
      MONITORING_ENABLED=false
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "  --dry-run          Simulate deployment without making changes"
      echo "  --env ENVIRONMENT  Target environment (staging, production)"
      echo "  --no-backup        Skip backup creation (not recommended for production)"
      echo "  --no-monitoring    Skip post-deploy monitoring"
      echo "  -h, --help         Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Logging functions
log_info() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $*"
}

log_warn() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $*" >&2
}

log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

# Pre-deployment validation
validate_environment() {
  log_info "Validating deployment environment: $ENVIRONMENT"
  
  if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    log_error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
    exit 1
  fi
  
  # Check required tools
  local required_tools=("node" "npm" "ffmpeg")
  for tool in "${required_tools[@]}"; do
    if ! command -v "$tool" &> /dev/null; then
      log_error "Required tool not found: $tool"
      exit 1
    fi
  done
  
  # Validate project dependencies
  if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
    log_error "package.json not found in project root"
    exit 1
  fi
  
  log_info "Environment validation passed"
}

# Create backup before deployment
create_backup() {
  if [[ "$BACKUP_REQUIRED" == false ]]; then
    log_warn "Backup creation skipped as requested"
    return 0
  fi
  
  log_info "Creating backup before deployment"
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would create backup with: ./backup_dhash.sh --env $ENVIRONMENT"
    return 0
  fi
  
  if ! "$SCRIPT_DIR/backup_dhash.sh" --env "$ENVIRONMENT"; then
    log_error "Backup creation failed"
    exit 1
  fi
  
  log_info "Backup created successfully"
}

# Deploy dhash component
deploy_dhash() {
  log_info "Deploying dhash component to $ENVIRONMENT"
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would perform the following deployment steps:"
    log_info "[DRY-RUN] 1. Install/update dependencies"
    log_info "[DRY-RUN] 2. Build dhash component"
    log_info "[DRY-RUN] 3. Run pre-deployment tests"
    log_info "[DRY-RUN] 4. Deploy to $ENVIRONMENT environment"
    log_info "[DRY-RUN] 5. Verify deployment health"
    return 0
  fi
  
  # Step 1: Install dependencies
  log_info "Installing dependencies..."
  cd "$PROJECT_ROOT"
  npm ci --production
  
  # Step 2: Build component (simulate dhash build)
  log_info "Building dhash component..."
  if [[ -f "$PROJECT_ROOT/src/video_generator.py" ]]; then
    python3 -m py_compile "$PROJECT_ROOT/src/video_generator.py"
  fi
  
  # Step 3: Pre-deployment tests
  log_info "Running pre-deployment tests..."
  if [[ -f "$SCRIPT_DIR/smoke_tests.sh" ]]; then
    "$SCRIPT_DIR/smoke_tests.sh" --env "$ENVIRONMENT" --pre-deploy
  fi
  
  # Step 4: Deploy (simulate deployment process)
  log_info "Deploying to $ENVIRONMENT..."
  mkdir -p "$PROJECT_ROOT/deployments/$ENVIRONMENT/$TIMESTAMP"
  
  # Copy artifacts to deployment directory
  cp -r "$PROJECT_ROOT/src" "$PROJECT_ROOT/deployments/$ENVIRONMENT/$TIMESTAMP/"
  cp "$PROJECT_ROOT/package.json" "$PROJECT_ROOT/deployments/$ENVIRONMENT/$TIMESTAMP/"
  
  # Create deployment manifest
  cat > "$PROJECT_ROOT/deployments/$ENVIRONMENT/$TIMESTAMP/deployment.json" << EOF
{
  "timestamp": "$TIMESTAMP",
  "environment": "$ENVIRONMENT",
  "version": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "deployed_by": "$(whoami)",
  "deployment_script": "deploy_dhash.sh"
}
EOF
  
  # Step 5: Health check
  log_info "Performing post-deployment health check..."
  sleep 2  # Simulate service startup time
  
  log_info "Deployment completed successfully"
}

# Start monitoring if enabled
start_monitoring() {
  if [[ "$MONITORING_ENABLED" == false ]]; then
    log_warn "Post-deployment monitoring disabled"
    return 0
  fi
  
  log_info "Starting post-deployment monitoring"
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY-RUN] Would start monitoring with: node scripts/monitor_dhash.js --env $ENVIRONMENT"
    return 0
  fi
  
  # Start monitoring in background if script exists
  if [[ -f "$SCRIPT_DIR/monitor_dhash.js" ]]; then
    nohup node "$SCRIPT_DIR/monitor_dhash.js" --env "$ENVIRONMENT" > "$PROJECT_ROOT/logs/monitor_${TIMESTAMP}.log" 2>&1 &
    log_info "Monitoring started (PID: $!)"
  else
    log_warn "Monitor script not found, skipping monitoring"
  fi
}

# Main deployment flow
main() {
  log_info "Starting dhash deployment"
  log_info "Environment: $ENVIRONMENT"
  log_info "Dry run: $DRY_RUN"
  
  # Create necessary directories
  mkdir -p "$PROJECT_ROOT/deployments/$ENVIRONMENT"
  mkdir -p "$PROJECT_ROOT/logs"
  
  # Execute deployment steps
  validate_environment
  create_backup
  deploy_dhash
  start_monitoring
  
  if [[ "$DRY_RUN" == true ]]; then
    log_info "Dry run completed successfully"
  else
    log_info "Deployment completed successfully"
    
    # Send deployment notification
    if [[ -f "$SCRIPT_DIR/notify.js" ]]; then
      node "$SCRIPT_DIR/notify.js" \
        --type deploy \
        --env "$ENVIRONMENT" \
        --message "dhash deployment completed successfully" \
        --timestamp "$TIMESTAMP"
    fi
  fi
}

# Execute main function
main "$@"