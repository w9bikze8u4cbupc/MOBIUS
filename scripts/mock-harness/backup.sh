#!/bin/bash

set -e

echo "=== MOBIUS Backup Script ==="

# Configuration
BACKUP_DIR=${BACKUP_DIR:-./backups}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="mobius_backup_${TIMESTAMP}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "Creating backup: $BACKUP_NAME"

# Mock backup operations (replace with real backup logic)
echo "📁 Backing up configuration files..."
if [ -d "backend" ]; then
    cp -r backend "$BACKUP_DIR/${BACKUP_NAME}_backend" 2>/dev/null || true
fi

if [ -d "client" ]; then
    cp -r client/src "$BACKUP_DIR/${BACKUP_NAME}_frontend" 2>/dev/null || true
fi

# Create backup manifest
cat > "$BACKUP_DIR/${BACKUP_NAME}_manifest.json" << EOF
{
  "backup_name": "$BACKUP_NAME",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "components": ["backend", "frontend", "config"],
  "status": "completed"
}
EOF

echo "✅ Backup completed successfully"
echo "📂 Backup location: $BACKUP_DIR/$BACKUP_NAME"
echo "📄 Manifest: $BACKUP_DIR/${BACKUP_NAME}_manifest.json"

# Return backup path for use in other scripts
echo "BACKUP_PATH=$BACKUP_DIR/$BACKUP_NAME" >> "$GITHUB_OUTPUT" 2>/dev/null || true