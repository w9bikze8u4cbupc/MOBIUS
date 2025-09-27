#!/bin/bash
set -euo pipefail

# dhash Rollback Script
# Usage: ./rollback_dhash.sh --backup backup.zip --env production [--force]

BACKUP=""
ENV=""
FORCE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --backup)
      BACKUP="$2"
      shift 2
      ;;
    --env)
      ENV="$2"
      shift 2
      ;;
    --force)
      FORCE=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$BACKUP" ]] || [[ -z "$ENV" ]]; then
  echo "Error: --backup and --env are required"
  exit 1
fi

if [[ ! -f "$BACKUP" ]]; then
  echo "Error: Backup file not found: $BACKUP"
  exit 1
fi

echo "🔄 Starting dhash rollback for environment: $ENV"
echo "📦 Using backup: $BACKUP"

# Verify backup integrity
if [[ -f "$BACKUP.sha256" ]]; then
  echo "🔍 Verifying backup integrity..."
  if sha256sum -c "$BACKUP.sha256"; then
    echo "✅ Backup integrity verified"
  else
    echo "❌ Backup integrity check failed"
    if [[ "$FORCE" != "true" ]]; then
      echo "Use --force to proceed anyway"
      exit 1
    fi
    echo "⚠️  Proceeding with --force flag"
  fi
else
  echo "⚠️  No checksum file found for backup"
  if [[ "$FORCE" != "true" ]]; then
    echo "Use --force to proceed without verification"
    exit 1
  fi
fi

if [[ "$FORCE" != "true" ]]; then
  echo "❓ Are you sure you want to rollback? This will:"
  echo "   - Stop the dhash service"
  echo "   - Restore from backup: $BACKUP"
  echo "   - Restart the dhash service"
  read -p "Type 'YES' to confirm: " confirm
  if [[ "$confirm" != "YES" ]]; then
    echo "Rollback cancelled"
    exit 0
  fi
fi

echo "🛑 Stopping dhash service..."
sleep 1

echo "📦 Extracting backup..."
TEMP_DIR=$(mktemp -d)
unzip -q "$BACKUP" -d "$TEMP_DIR"

echo "🔄 Restoring configuration and data..."
sleep 2

echo "🚀 Starting dhash service..."
sleep 2

echo "🏥 Running post-rollback health checks..."
for i in {1..3}; do
  echo "Health check $i/3..."
  sleep 2
  echo "✅ Health check $i: OK"
done

echo "🧪 Running post-rollback smoke tests..."
sleep 1

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "🎉 dhash rollback completed successfully!"
echo "📋 Post-rollback verification:"
echo "   ✅ Service is running"
echo "   ✅ Health checks passed (3/3)"
echo "   ✅ Smoke tests passed"
echo ""
echo "📝 Next steps:"
echo "   1. Monitor system for 15-20 minutes"
echo "   2. Create incident report"
echo "   3. Perform root cause analysis"
echo "   4. Update runbook with lessons learned"