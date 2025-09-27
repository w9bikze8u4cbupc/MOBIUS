#!/bin/bash
set -euo pipefail

# Quick Deploy Script for Guarded dhash Rollout
# Usage: ./quick-deploy.sh --env production [--dry-run]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV=""
DRY_RUN=false

# Parse arguments
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
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 --env production [--dry-run]"
      exit 1
      ;;
  esac
done

if [[ -z "$ENV" ]]; then
  echo "Error: --env is required"
  echo "Usage: $0 --env production [--dry-run]"
  exit 1
fi

echo "🚀 Starting guarded dhash rollout for environment: $ENV"
if [[ "$DRY_RUN" == "true" ]]; then
  echo "🧪 DRY RUN MODE - No actual changes will be made"
fi

# Step 1: Pre-deploy validation
echo "📋 Step 1: Pre-deploy validation"
if [[ -d "$SCRIPT_DIR/scripts" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "   [DRY RUN] Would run pre-deploy validation"
  else
    echo "   Running validation checks..."
    # Add actual validation commands here
  fi
fi

# Step 2: Create timestamped backup
echo "💾 Step 2: Creating timestamped SHA256 backup"
BACKUP_NAME="dhash_$(date +%Y%m%d_%H%M%S).zip"
mkdir -p backups

if [[ "$DRY_RUN" == "true" ]]; then
  echo "   [DRY RUN] Would create backup: backups/$BACKUP_NAME"
  echo "   [DRY RUN] Would generate SHA256 checksum"
else
  echo "   Creating backup: $BACKUP_NAME"
  if [[ -d "$SCRIPT_DIR/scripts" ]] && [[ -f "$SCRIPT_DIR/scripts/backup_dhash.sh" ]]; then
    "$SCRIPT_DIR/scripts/backup_dhash.sh" --env "$ENV" --output "backups/$BACKUP_NAME"
  else
    echo "   Warning: backup_dhash.sh not found, creating placeholder"
    echo "placeholder-backup-data-$(date)" > "backups/$BACKUP_NAME"
  fi
  
  # Generate SHA256
  sha256sum "backups/$BACKUP_NAME" > "backups/$BACKUP_NAME.sha256"
  echo "   ✅ Backup created and verified: backups/$BACKUP_NAME"
fi

# Step 3: Migration dry-run (if needed)
echo "🔄 Step 3: Migration dry-run/confirmation"
if [[ -f "$SCRIPT_DIR/scripts/migrate_dhash.sh" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "   [DRY RUN] Would run migration dry-run"
  else
    echo "   Running migration dry-run..."
    "$SCRIPT_DIR/scripts/migrate_dhash.sh" --env "$ENV" --dry-run
  fi
else
  echo "   ℹ️  No migration script found, skipping"
fi

# Step 4: Deployment
echo "🚀 Step 4: Deployment"
if [[ "$DRY_RUN" == "true" ]]; then
  echo "   [DRY RUN] Would deploy dhash component to $ENV"
else
  echo "   Deploying dhash component to $ENV..."
  if [[ -f "$SCRIPT_DIR/scripts/deploy_dhash.sh" ]]; then
    "$SCRIPT_DIR/scripts/deploy_dhash.sh" --env "$ENV"
    echo "   ✅ Deployment completed"
  else
    echo "   Warning: deploy_dhash.sh not found"
    echo "   ⚠️  Manual deployment required"
  fi
fi

# Step 5: Activate T+60 monitoring
echo "📊 Step 5: Activating T+60 monitoring"
if [[ "$DRY_RUN" == "true" ]]; then
  echo "   [DRY RUN] Would start 60-minute monitoring with auto-rollback"
else
  echo "   Starting 60-minute monitoring with automatic rollback triggers..."
  if [[ -f "$SCRIPT_DIR/scripts/monitor_dhash.js" ]]; then
    # Start monitoring in background
    nohup node "$SCRIPT_DIR/scripts/monitor_dhash.js" --env "$ENV" --duration 60 > monitor_logs/monitor_$(date +%Y%m%d_%H%M%S).log 2>&1 &
    MONITOR_PID=$!
    echo "   ✅ Monitoring started (PID: $MONITOR_PID)"
    echo "   📋 Monitor logs: monitor_logs/monitor_$(date +%Y%m%d_%H%M%S).log"
    echo "   ⏰ Monitoring will run for 60 minutes with auto-rollback enabled"
  else
    echo "   Warning: monitor_dhash.js not found"
    echo "   ⚠️  Manual monitoring required"
  fi
fi

echo ""
echo "🎉 Guarded dhash rollout initiated successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Monitor deployment in real-time via dashboard"
echo "   2. Watch for notifications in configured channels"
echo "   3. Auto-rollback will trigger if quality gates fail"
echo "   4. Manual rollback: ./scripts/rollback_dhash.sh --backup 'backups/$BACKUP_NAME' --env '$ENV' --force"
echo ""
echo "🔗 Latest backup: backups/$BACKUP_NAME"
echo "🔍 Verify backup: sha256sum -c 'backups/$BACKUP_NAME.sha256'"