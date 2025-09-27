#!/bin/bash
# quick-deploy.sh - Quick deployment wrapper for dhash guarded rollout
# Usage: ./quick-deploy.sh <environment> [--skip-backup] [--skip-monitoring] [--dry-run]

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default options
SKIP_BACKUP=false
SKIP_MONITORING=false
DRY_RUN=false
ENVIRONMENT=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_status() {
  local color=$1
  local message=$2
  echo -e "${color}${message}${NC}"
}

# Print usage
usage() {
  echo "DHash Quick Deploy - Guarded Rollout System"
  echo ""
  echo "Usage: $0 <environment> [options]"
  echo ""
  echo "Environments:"
  echo "  production    Production deployment with full monitoring"
  echo "  staging       Staging deployment with monitoring"
  echo "  development   Development deployment (minimal checks)"
  echo ""
  echo "Options:"
  echo "  --skip-backup      Skip pre-deployment backup"
  echo "  --skip-monitoring  Skip post-deployment monitoring"
  echo "  --dry-run         Show what would be done without executing"
  echo "  -h, --help        Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0 production"
  echo "  $0 staging --skip-backup"
  echo "  $0 development --dry-run"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    production|staging|development)
      if [[ -z "$ENVIRONMENT" ]]; then
        ENVIRONMENT="$1"
      else
        echo "Error: Multiple environments specified"
        exit 1
      fi
      shift
      ;;
    --skip-backup)
      SKIP_BACKUP=true
      shift
      ;;
    --skip-monitoring)
      SKIP_MONITORING=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

# Validate environment
if [[ -z "$ENVIRONMENT" ]]; then
  echo "Error: Environment is required"
  usage
  exit 1
fi

# Configuration based on environment
configure_deployment() {
  local env=$1
  
  case $env in
    production)
      print_status $RED "🚨 PRODUCTION DEPLOYMENT"
      BACKUP_REQUIRED=true
      MONITORING_REQUIRED=true
      SMOKE_TEST_TIER="all"
      QUALITY_GATES_STRICT=true
      ;;
    staging)
      print_status $YELLOW "🧪 STAGING DEPLOYMENT"
      BACKUP_REQUIRED=true
      MONITORING_REQUIRED=true
      SMOKE_TEST_TIER="critical"
      QUALITY_GATES_STRICT=false
      ;;
    development)
      print_status $BLUE "🛠️  DEVELOPMENT DEPLOYMENT"
      BACKUP_REQUIRED=false
      MONITORING_REQUIRED=false
      SMOKE_TEST_TIER="critical"
      QUALITY_GATES_STRICT=false
      ;;
    *)
      echo "Error: Invalid environment '$env'"
      exit 1
      ;;
  esac
}

# Pre-flight checks
preflight_checks() {
  print_status $BLUE "🔍 Running pre-flight checks..."
  
  # Check if required scripts exist
  local required_scripts=(
    "scripts/deploy_dhash.sh"
    "scripts/backup_dhash.sh"
    "scripts/monitor_dhash.js"
    "scripts/smoke_tests.sh"
    "scripts/notify.js"
  )
  
  for script in "${required_scripts[@]}"; do
    if [[ ! -f "$script" ]]; then
      print_status $RED "❌ Required script not found: $script"
      exit 1
    fi
  done
  
  # Check if configuration file exists
  if [[ ! -f "quality-gates-config.json" ]]; then
    print_status $YELLOW "⚠️  Quality gates config not found, using defaults"
  fi
  
  # Check if Node.js is available for monitoring
  if ! command -v node &> /dev/null; then
    print_status $YELLOW "⚠️  Node.js not found, monitoring may not work"
  fi
  
  # Check environment-specific requirements
  if [[ "$ENVIRONMENT" == "production" ]]; then
    if [[ -z "${WEBHOOK_URL:-}" ]]; then
      print_status $YELLOW "⚠️  WEBHOOK_URL not set, notifications will use fallback"
    fi
  fi
  
  print_status $GREEN "✅ Pre-flight checks completed"
}

# Send deployment notification
send_notification() {
  local event=$1
  local message=$2
  
  if [[ "$DRY_RUN" == "true" ]]; then
    print_status $BLUE "[DRY-RUN] Would send notification: $event - $message"
    return
  fi
  
  if [[ -f "scripts/deploy/deploy-notify.js" ]]; then
    node scripts/deploy/deploy-notify.js \
      --event "$event" \
      --env "$ENVIRONMENT" \
      --message "$message" \
      --deployment-id "${DEPLOYMENT_ID:-quick-deploy-$(date +%s)}" \
      --commit-sha "${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}" \
      || print_status $YELLOW "⚠️  Notification failed but continuing"
  else
    print_status $YELLOW "⚠️  Deployment notification script not found"
  fi
}

# Main deployment function
main() {
  print_status $GREEN "🚀 DHash Quick Deploy Starting..."
  echo ""
  echo "Environment: $ENVIRONMENT"
  echo "Skip backup: $SKIP_BACKUP"
  echo "Skip monitoring: $SKIP_MONITORING"
  echo "Dry run: $DRY_RUN"
  echo ""
  
  # Configure deployment based on environment
  configure_deployment "$ENVIRONMENT"
  
  # Run pre-flight checks
  preflight_checks
  
  # Send pre-deployment notification
  send_notification "pre-deploy" "Quick deployment initiated"
  
  # Build deployment command
  DEPLOY_CMD="scripts/deploy_dhash.sh --env $ENVIRONMENT"
  
  # Add backup option
  if [[ "$BACKUP_REQUIRED" == "true" && "$SKIP_BACKUP" != "true" ]]; then
    DEPLOY_CMD="$DEPLOY_CMD --backup-first"
    print_status $BLUE "📦 Backup will be created before deployment"
  elif [[ "$SKIP_BACKUP" == "true" ]]; then
    print_status $YELLOW "⚠️  Skipping backup (--skip-backup specified)"
  fi
  
  # Add monitoring option
  if [[ "$MONITORING_REQUIRED" == "false" || "$SKIP_MONITORING" == "true" ]]; then
    DEPLOY_CMD="$DEPLOY_CMD --skip-monitoring"
    if [[ "$SKIP_MONITORING" == "true" ]]; then
      print_status $YELLOW "⚠️  Skipping monitoring (--skip-monitoring specified)"
    fi
  fi
  
  # Add dry-run option
  if [[ "$DRY_RUN" == "true" ]]; then
    DEPLOY_CMD="$DEPLOY_CMD --dry-run"
  fi
  
  print_status $BLUE "🎯 Executing deployment command:"
  echo "   $DEPLOY_CMD"
  echo ""
  
  # Execute deployment
  if eval "$DEPLOY_CMD"; then
    print_status $GREEN "✅ Deployment completed successfully"
    send_notification "deploy-success" "Deployment completed successfully"
  else
    print_status $RED "❌ Deployment failed"
    send_notification "deploy-failed" "Deployment failed during execution"
    exit 1
  fi
  
  # Run additional smoke tests if not already run by deploy script
  if [[ "$DRY_RUN" != "true" ]]; then
    print_status $BLUE "🧪 Running additional smoke tests..."
    if scripts/smoke_tests.sh --env "$ENVIRONMENT" --tier "$SMOKE_TEST_TIER"; then
      print_status $GREEN "✅ Smoke tests passed"
    else
      print_status $YELLOW "⚠️  Some smoke tests failed (not blocking)"
    fi
  fi
  
  # Final status
  echo ""
  print_status $GREEN "🎉 Quick deployment workflow completed!"
  
  if [[ "$DRY_RUN" != "true" ]]; then
    echo ""
    echo "📋 Next steps:"
    echo "   1. Monitor the application for the next 60 minutes"
    if [[ "$MONITORING_REQUIRED" == "true" && "$SKIP_MONITORING" != "true" ]]; then
      echo "   2. Check monitoring logs: monitor_${ENVIRONMENT}_*.log"
    fi
    echo "   3. Review deployment notifications"
    echo "   4. Verify service health in monitoring dashboard"
    
    if [[ "$ENVIRONMENT" == "production" ]]; then
      echo ""
      print_status $RED "🚨 PRODUCTION DEPLOYMENT COMPLETED"
      echo "   - Monitoring is active for 60 minutes"
      echo "   - Auto-rollback is enabled if quality gates are violated"
      echo "   - Check backup availability for emergency rollback"
      
      # Show latest backup
      if [[ -d "backups" ]]; then
        LATEST_BACKUP=$(ls -1 backups/dhash_${ENVIRONMENT}_*.zip 2>/dev/null | sort -r | head -n1 || echo "")
        if [[ -n "$LATEST_BACKUP" ]]; then
          echo "   - Latest backup: $LATEST_BACKUP"
          echo "   - Emergency rollback: scripts/rollback_dhash.sh --backup \"$LATEST_BACKUP\" --env $ENVIRONMENT"
        fi
      fi
    fi
  fi
}

# Handle signals for graceful shutdown
trap 'print_status $YELLOW "⚠️  Deployment interrupted"; exit 1' INT TERM

# Execute main function
main