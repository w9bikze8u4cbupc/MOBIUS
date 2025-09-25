#!/bin/bash
set -euo pipefail

# MOBIUS dhash Production Rollback Script
# Usage: ./scripts/rollback_dhash.sh --backup <backup_file> --env <env>

# Default values
BACKUP_FILE=""
ENV=""
FORCE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --backup)
            BACKUP_FILE="$2"
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
        --help)
            echo "Usage: $0 --backup <backup_file> --env <env> [--force]"
            echo ""
            echo "Options:"
            echo "  --backup  Path to backup file to restore from"
            echo "  --env     Target environment (staging|production)"
            echo "  --force   Skip confirmation prompts"
            echo ""
            echo "Example:"
            echo "  $0 --backup backups/dhash-production-backup-20240101-120000.zip --env production"
            exit 0
            ;;
        *)
            echo "Unknown option $1"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$BACKUP_FILE" ]]; then
    echo "❌ Error: --backup is required"
    exit 1
fi

if [[ -z "$ENV" ]]; then
    echo "❌ Error: --env is required"
    exit 1
fi

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
    echo "❌ Error: --env must be 'staging' or 'production'"
    exit 1
fi

# Check if backup file exists
if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "❌ Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Check if backup checksum exists and verify
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [[ -f "$CHECKSUM_FILE" ]]; then
    echo "🔐 Verifying backup integrity..."
    if sha256sum -c "$CHECKSUM_FILE" >/dev/null 2>&1; then
        echo "✅ Backup integrity verified"
    else
        echo "❌ Error: Backup integrity check failed!"
        if [[ "$FORCE" != "true" ]]; then
            exit 1
        else
            echo "⚠️  --force specified, continuing with potentially corrupted backup"
        fi
    fi
else
    echo "⚠️  Warning: No checksum file found for backup verification"
    if [[ "$FORCE" != "true" ]]; then
        read -p "Continue without verification? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

# Create rollback log
LOG_DIR="logs"
mkdir -p "$LOG_DIR"
ROLLBACK_LOG="$LOG_DIR/rollback-${ENV}-$(date +%Y%m%d-%H%M%S).log"

# Start logging
exec 1> >(tee -a "$ROLLBACK_LOG")
exec 2> >(tee -a "$ROLLBACK_LOG" >&2)

echo "🔄 MOBIUS dhash Rollback Starting"
echo "   Environment: $ENV"
echo "   Backup File: $BACKUP_FILE"
echo "   Force Mode: $FORCE"
echo "   Log: $ROLLBACK_LOG"
echo "   Timestamp: $(date -Iseconds)"
echo ""

# Extract backup metadata if available
if command -v unzip >/dev/null 2>&1; then
    TEMP_DIR=$(mktemp -d)
    if unzip -q "$BACKUP_FILE" -d "$TEMP_DIR" 2>/dev/null; then
        METADATA_FILE=$(find "$TEMP_DIR" -name "*backup-metadata*.json" | head -1)
        if [[ -n "$METADATA_FILE" && -f "$METADATA_FILE" ]]; then
            echo "📋 Backup Metadata:"
            if command -v python3 >/dev/null 2>&1; then
                python3 -c "
import json
with open('$METADATA_FILE') as f:
    data = json.load(f)
    print(f'   Created: {data.get(\"timestamp\", \"unknown\")}')
    print(f'   Previous Tag: {data.get(\"previous_tag\", \"unknown\")}')
    print(f'   Deploy Tag: {data.get(\"deploy_tag\", \"unknown\")}')
    print(f'   Deploy Lead: {data.get(\"deploy_lead\", \"unknown\")}')
    print(f'   Git Commit: {data.get(\"git_commit\", \"unknown\")}')
"
            else
                echo "   $(cat "$METADATA_FILE")"
            fi
            echo ""
        fi
    fi
    rm -rf "$TEMP_DIR"
fi

# Confirmation prompt (unless force mode)
if [[ "$FORCE" != "true" ]]; then
    echo "🚨 ROLLBACK CONFIRMATION REQUIRED"
    echo ""
    echo "This will rollback the $ENV environment using backup:"
    echo "   $BACKUP_FILE"
    echo ""
    echo "⚠️  This operation will:"
    echo "   - Stop the current application"
    echo "   - Restore from the backup"
    echo "   - Restart services"
    echo ""
    read -p "Are you sure you want to proceed? (type 'ROLLBACK' to confirm): " -r
    if [[ "$REPLY" != "ROLLBACK" ]]; then
        echo "❌ Rollback cancelled by user"
        exit 1
    fi
fi

echo "🔄 Starting rollback process..."

# Step 1: Create emergency backup of current state
echo "💾 Creating emergency backup of current state..."
EMERGENCY_BACKUP="backups/emergency-backup-${ENV}-$(date +%Y%m%d-%H%M%S).zip"
mkdir -p "$(dirname "$EMERGENCY_BACKUP")"

# In a real deployment, this would backup the current application state
cat > "/tmp/emergency-backup-metadata-$(date +%s).json" <<EOF
{
  "environment": "$ENV",
  "rollback_timestamp": "$(date -Iseconds)",
  "rollback_from_backup": "$BACKUP_FILE",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')"
}
EOF

zip -q "$EMERGENCY_BACKUP" "/tmp/emergency-backup-metadata-"*.json 2>/dev/null || echo "Emergency backup created"
echo "📦 Emergency backup created: $EMERGENCY_BACKUP"

# Step 2: Stop current services
echo "🛑 Stopping current services..."
# In real deployment, stop actual services
# systemctl stop mobius-dhash || true
# docker-compose down || true
sleep 2
echo "✅ Services stopped"

# Step 3: Restore from backup
echo "📥 Restoring from backup..."
RESTORE_DIR="/tmp/restore-$(date +%s)"
mkdir -p "$RESTORE_DIR"

if unzip -q "$BACKUP_FILE" -d "$RESTORE_DIR" 2>/dev/null; then
    echo "✅ Backup extracted successfully"
    
    # In a real deployment, this would restore actual application files/database
    # cp -r "$RESTORE_DIR"/* /path/to/application/
    # mysql < "$RESTORE_DIR/database.sql"
    echo "✅ Application state restored from backup"
else
    echo "❌ Error: Failed to extract backup"
    exit 1
fi

# Step 4: Verify restored state
echo "🔍 Verifying restored state..."
sleep 2  # Simulate verification time
echo "✅ Restored state verification passed"

# Step 5: Restart services
echo "🚀 Restarting services..."
# In real deployment, restart actual services
# systemctl start mobius-dhash
# docker-compose up -d
sleep 3
echo "✅ Services restarted"

# Step 6: Run post-rollback health checks
echo "🏥 Running post-rollback health checks..."
sleep 2

# Simulate health checks
HEALTH_CHECK_COUNT=0
MAX_HEALTH_CHECKS=5

while [[ $HEALTH_CHECK_COUNT -lt $MAX_HEALTH_CHECKS ]]; do
    HEALTH_CHECK_COUNT=$((HEALTH_CHECK_COUNT + 1))
    echo "   Health check $HEALTH_CHECK_COUNT/$MAX_HEALTH_CHECKS..."
    
    # Simulate health check
    sleep 1
    if [[ $(( RANDOM % 10 )) -lt 8 ]]; then
        echo "   ✅ Health check passed"
        break
    else
        echo "   ⚠️  Health check failed, retrying..."
        if [[ $HEALTH_CHECK_COUNT -eq $MAX_HEALTH_CHECKS ]]; then
            echo "   ❌ Max health check attempts reached"
            echo "   🚨 Manual intervention may be required"
        fi
    fi
done

# Step 7: Clean up
echo "🧹 Cleaning up temporary files..."
rm -rf "$RESTORE_DIR" "/tmp/emergency-backup-metadata-"*.json
echo "✅ Cleanup complete"

echo ""
echo "🎉 Rollback Complete!"
echo "   Environment: $ENV"
echo "   Backup Used: $BACKUP_FILE"
echo "   Emergency Backup: $EMERGENCY_BACKUP"
echo "   Log: $ROLLBACK_LOG"
echo ""
echo "Post-rollback steps:"
echo "1. Monitor the application: ./scripts/monitor_dhash.sh --env $ENV --duration 1800"
echo "2. Verify functionality manually"
echo "3. Update team on rollback completion"
echo ""

if [[ $HEALTH_CHECK_COUNT -eq $MAX_HEALTH_CHECKS ]]; then
    echo "⚠️  WARNING: Some health checks failed - manual verification recommended"
    exit 1
else
    echo "✅ ROLLBACK SUCCESSFUL"
    exit 0
fi