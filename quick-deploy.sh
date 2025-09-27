#!/bin/bash
# Quick deployment utility script
# Usage: ./quick-deploy.sh [staging|production]

set -euo pipefail

ENVIRONMENT="${1:-staging}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Quick dhash deployment to ${ENVIRONMENT}"
echo "=================================="

# Validate environment
if [[ "${ENVIRONMENT}" != "staging" && "${ENVIRONMENT}" != "production" ]]; then
  echo "❌ Error: Environment must be 'staging' or 'production'"
  exit 1
fi

# Production safety check
if [[ "${ENVIRONMENT}" == "production" ]]; then
  echo "⚠️  WARNING: This will deploy to PRODUCTION"
  echo -n "Type 'DEPLOY' to confirm: "
  read -r confirmation
  if [[ "${confirmation}" != "DEPLOY" ]]; then
    echo "❌ Deployment cancelled"
    exit 0
  fi
fi

# Step 1: Create backup
echo "📦 Step 1/4: Creating backup..."
if ! ./scripts/backup_dhash.sh --env "${ENVIRONMENT}"; then
  echo "❌ Backup failed"
  exit 1
fi

# Step 2: Run migrations (if needed)
echo "🔄 Step 2/4: Running migrations..."
if ! ./scripts/migrate_dhash.sh --env "${ENVIRONMENT}"; then
  echo "❌ Migration failed"
  exit 1
fi

# Step 3: Deploy service
echo "🚀 Step 3/4: Deploying service..."
if ! ./scripts/deploy_dhash.sh --env "${ENVIRONMENT}" --backup-first; then
  echo "❌ Deployment failed"
  exit 1
fi

# Step 4: Start monitoring
echo "👁️  Step 4/4: Starting monitoring..."
echo "Monitoring will run in the background..."

# Send deployment notification
node scripts/deploy/deploy-notify.js --type deployment_start --env "${ENVIRONMENT}" || true

# Start monitoring in background and capture PID
node scripts/monitor_dhash.js --env "${ENVIRONMENT}" &
MONITOR_PID=$!

# Run smoke tests
echo "🧪 Running smoke tests..."
if ./scripts/smoke_tests.sh --env "${ENVIRONMENT}" --quick; then
  echo "✅ Smoke tests passed"
  node scripts/deploy/deploy-notify.js --type deployment_success --env "${ENVIRONMENT}" || true
else
  echo "❌ Smoke tests failed - check logs"
  # Don't fail the deployment, but log the issue
fi

echo ""
echo "🎉 Deployment initiated successfully!"
echo "📊 Monitoring PID: ${MONITOR_PID}"
echo "📝 Monitor logs: tail -f monitor_logs/dhash_${ENVIRONMENT}_*.log"
echo "🛑 Stop monitoring: kill ${MONITOR_PID}"
echo ""
echo "📋 Rollback command (if needed):"
echo "   LATEST_BACKUP=\$(ls -1 backups/dhash_*.zip | sort -r | head -n1)"
echo "   ./scripts/rollback_dhash.sh --backup \"\$LATEST_BACKUP\" --env ${ENVIRONMENT}"

# Wait for monitoring to complete or user interruption
echo "⏰ Monitoring will run for the configured window..."
echo "   Press Ctrl+C to stop monitoring early"

wait ${MONITOR_PID} || echo "Monitoring stopped"

echo "✅ Deployment and monitoring complete!"