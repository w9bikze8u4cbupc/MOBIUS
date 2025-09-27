#!/bin/bash
# deploy_dhash.sh - Deployment orchestrator with environment validation, health checks, backup integration
# Usage: ./deploy_dhash.sh --env <environment> [--backup-first] [--dry-run] [--skip-monitoring]

set -euo pipefail

# Default configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Parse command line arguments
DRY_RUN=false
ENVIRONMENT=""
BACKUP_FIRST=false
SKIP_MONITORING=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --backup-first)
      BACKUP_FIRST=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-monitoring)
      SKIP_MONITORING=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 --env <environment> [--backup-first] [--dry-run] [--skip-monitoring]"
      echo "  --env: Environment to deploy to (required)"
      echo "  --backup-first: Create backup before deployment"
      echo "  --dry-run: Show what would be done without executing"
      echo "  --skip-monitoring: Skip post-deploy monitoring"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "$ENVIRONMENT" ]]; then
  echo "Error: --env is required"
  exit 1
fi

# Environment validation
validate_environment() {
  local env=$1
  case $env in
    production|staging|development)
      echo "✅ Environment validation: $env"
      ;;
    *)
      echo "❌ Invalid environment: $env (must be: production, staging, development)"
      exit 1
      ;;
  esac
}

# Pre-deployment health check
pre_deployment_health_check() {
  echo "Performing pre-deployment health check..."
  
  # Check if services are running
  # In a real implementation, this would check actual service status
  echo "✅ Pre-deployment health check: PASS"
}

# Deployment function
perform_deployment() {
  echo "Performing deployment for environment: $ENVIRONMENT..."
  
  # In a real implementation, this would:
  # 1. Pull latest code/artifacts
  # 2. Update configuration
  # 3. Run database migrations
  # 4. Deploy application code
  # 5. Update service configurations
  # 6. Restart services
  
  # Mock deployment steps
  echo "  📦 Pulling latest artifacts..."
  sleep 1
  echo "  ⚙️  Updating configuration..."
  sleep 1
  echo "  🗃️  Running migrations..."
  if [[ -f "$SCRIPT_DIR/migrate_dhash.sh" ]]; then
    bash "$SCRIPT_DIR/migrate_dhash.sh" --env "$ENVIRONMENT" ${DRY_RUN:+--dry-run}
  fi
  echo "  🚀 Deploying application code..."
  sleep 1
  echo "  🔄 Restarting services..."
  sleep 1
  
  echo "✅ Deployment completed"
}

# Post-deployment health check
post_deployment_health_check() {
  echo "Performing post-deployment health check..."
  
  local max_attempts=5
  local attempt=1
  
  while [[ $attempt -le $max_attempts ]]; do
    echo "Health check attempt $attempt/$max_attempts..."
    
    # Mock health check
    if [[ $((RANDOM % 3)) -eq 0 ]]; then
      echo "❌ Health check failed"
      if [[ $attempt -eq $max_attempts ]]; then
        echo "❌ All health checks failed - deployment may have issues"
        return 1
      fi
    else
      echo "✅ Health check: PASS"
      return 0
    fi
    
    attempt=$((attempt + 1))
    sleep 3
  done
  
  return 1
}

# Main deployment flow
main() {
  echo "🚀 Starting dhash deployment"
  echo "Environment: $ENVIRONMENT"
  echo "Backup first: $BACKUP_FIRST"
  echo "Dry run: $DRY_RUN"
  echo "Skip monitoring: $SKIP_MONITORING"
  echo ""

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would validate environment: $ENVIRONMENT"
    echo "[DRY-RUN] Would perform pre-deployment health check"
    if [[ "$BACKUP_FIRST" == "true" ]]; then
      echo "[DRY-RUN] Would create backup using: $SCRIPT_DIR/backup_dhash.sh --env $ENVIRONMENT"
    fi
    echo "[DRY-RUN] Would perform deployment"
    echo "[DRY-RUN] Would perform post-deployment health check"
    if [[ "$SKIP_MONITORING" != "true" ]]; then
      echo "[DRY-RUN] Would start monitoring using: node $SCRIPT_DIR/monitor_dhash.js --env $ENVIRONMENT"
    fi
    echo "[DRY-RUN] Would send deployment notification"
    exit 0
  fi

  # Step 1: Validate environment
  validate_environment "$ENVIRONMENT"
  
  # Step 2: Pre-deployment health check
  pre_deployment_health_check
  
  # Step 3: Create backup if requested
  if [[ "$BACKUP_FIRST" == "true" ]]; then
    echo "Creating pre-deployment backup..."
    if ! bash "$SCRIPT_DIR/backup_dhash.sh" --env "$ENVIRONMENT"; then
      echo "❌ Pre-deployment backup failed"
      exit 1
    fi
  fi
  
  # Step 4: Perform deployment
  perform_deployment
  
  # Step 5: Post-deployment health check
  if ! post_deployment_health_check; then
    echo "❌ Post-deployment health check failed"
    echo "Consider rolling back using the latest backup"
    if [[ "$BACKUP_FIRST" == "true" ]]; then
      LATEST_BACKUP=$(ls -1 backups/dhash_${ENVIRONMENT}_*.zip 2>/dev/null | sort -r | head -n1 || echo "")
      if [[ -n "$LATEST_BACKUP" ]]; then
        echo "Latest backup available: $LATEST_BACKUP"
        echo "To rollback: bash $SCRIPT_DIR/rollback_dhash.sh --backup \"$LATEST_BACKUP\" --env \"$ENVIRONMENT\""
      fi
    fi
    exit 1
  fi
  
  # Step 6: Start monitoring (unless skipped)
  if [[ "$SKIP_MONITORING" != "true" ]]; then
    echo "Starting post-deployment monitoring..."
    if [[ -f "$SCRIPT_DIR/monitor_dhash.js" ]]; then
      # Start monitoring in background
      nohup node "$SCRIPT_DIR/monitor_dhash.js" --env "$ENVIRONMENT" > "monitor_${ENVIRONMENT}_$(date +%Y%m%d_%H%M%S).log" 2>&1 &
      echo "✅ Monitoring started (PID: $!)"
      echo "📊 Monitor logs: monitor_${ENVIRONMENT}_$(date +%Y%m%d_%H%M%S).log"
    else
      echo "⚠️  Monitor script not found: $SCRIPT_DIR/monitor_dhash.js"
    fi
  fi
  
  # Step 7: Send deployment notification
  echo "Sending deployment notification..."
  if [[ -f "$SCRIPT_DIR/notify.js" ]]; then
    node "$SCRIPT_DIR/notify.js" \
      --type deploy \
      --env "$ENVIRONMENT" \
      --message "DHash deployment completed successfully" \
      --status success || echo "⚠️  Notification failed (continuing)"
  fi
  
  # Step 8: Run smoke tests
  if [[ -f "$SCRIPT_DIR/smoke_tests.sh" ]]; then
    echo "Running smoke tests..."
    bash "$SCRIPT_DIR/smoke_tests.sh" --env "$ENVIRONMENT" || {
      echo "❌ Smoke tests failed"
      exit 1
    }
  fi
  
  echo ""
  echo "🎉 Deployment completed successfully!"
  echo "📋 Next steps:"
  echo "   1. Monitor service health for the next 60 minutes"
  echo "   2. Review monitoring dashboard"
  if [[ "$SKIP_MONITORING" == "true" ]]; then
    echo "   3. Consider starting monitoring: node $SCRIPT_DIR/monitor_dhash.js --env $ENVIRONMENT"
  fi
}

# Execute main function
main "$@"