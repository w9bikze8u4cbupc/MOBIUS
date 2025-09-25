#!/bin/bash

# create_premerge_bundle.sh - Bundle all premerge artifacts for easy PR attachment
# Usage: ./scripts/create_premerge_bundle.sh

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BUNDLE_NAME="premerge_artifacts_bundle_${TIMESTAMP}.tar.gz"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS $(date +'%H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN $(date +'%H:%M:%S')]${NC} $1"
}

cd "$PROJECT_ROOT"

log "Creating premerge artifact bundle: $BUNDLE_NAME"

# Run premerge validation if artifacts don't exist
if [[ ! -d "premerge_artifacts" ]]; then
    log "Running premerge validation to generate artifacts..."
    ARTIFACT_DIR=premerge_artifacts ./scripts/premerge_run.sh
fi

# Create the bundle
log "Bundling artifacts and logs..."
tar -czf "$BUNDLE_NAME" \
    premerge_artifacts/ \
    quality-gates-config.json \
    DEPLOYMENT_CHEAT_SHEET.md \
    NOTIFICATION_TEMPLATES.md \
    DEPLOYMENT_OPERATIONS_GUIDE.md \
    PR_CHECKLIST_TEMPLATE.md \
    2>/dev/null || true

# Generate manifest
log "Generating manifest..."
{
    echo "MOBIUS dhash Premerge Bundle Manifest"
    echo "====================================="
    echo ""
    echo "Bundle: $BUNDLE_NAME"
    echo "Created: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
    echo "Git Commit: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
    echo "Git Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
    echo ""
    echo "Contents:"
    tar -tzf "$BUNDLE_NAME" | sort | sed 's/^/  - /'
    echo ""
    echo "Bundle Size: $(ls -lh "$BUNDLE_NAME" | awk '{print $5}')"
    echo "SHA256: $(sha256sum "$BUNDLE_NAME" | cut -d' ' -f1)"
} > "premerge_bundle_manifest_${TIMESTAMP}.txt"

# Generate checksum
sha256sum "$BUNDLE_NAME" > "${BUNDLE_NAME}.sha256"

success "Premerge bundle created successfully!"
log "Bundle: $BUNDLE_NAME"
log "Manifest: premerge_bundle_manifest_${TIMESTAMP}.txt"
log "Checksum: ${BUNDLE_NAME}.sha256"
log ""
log "Upload these files to your PR:"
echo "  📦 $BUNDLE_NAME"
echo "  📋 premerge_bundle_manifest_${TIMESTAMP}.txt"
echo "  🔒 ${BUNDLE_NAME}.sha256"