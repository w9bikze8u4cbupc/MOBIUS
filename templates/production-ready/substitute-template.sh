#!/bin/bash
# Template Variable Substitution Utility
# Usage: ./substitute-template.sh <template-file> [variable-file]

set -e

TEMPLATE_FILE="$1"
VARIABLE_FILE="${2:-variables.env}"

if [ ! -f "$TEMPLATE_FILE" ]; then
    echo "❌ Template file not found: $TEMPLATE_FILE"
    echo "Usage: $0 <template-file> [variable-file]"
    exit 1
fi

if [ ! -f "$VARIABLE_FILE" ]; then
    echo "⚠️  Variable file not found: $VARIABLE_FILE"
    echo "Creating sample variable file..."
    
    # Create sample variables file
    cat > "$VARIABLE_FILE" << 'EOF'
# MOBIUS Template Variables
# Uncomment and set values as needed

# Release Information
RELEASE_TAG=v1.0.0
PREVIOUS_TAG=v0.9.0
RELEASE_DATE=$(date -u +"%Y-%m-%d")
RELEASE_TIME=$(date -u +"%H:%M:%S UTC")
RELEASE_URL=https://github.com/w9bikze8u4cbupc/MOBIUS/releases/tag/${RELEASE_TAG}

# Git Information  
BRANCH_NAME=main
COMMIT_SHA=$(git rev-parse --short HEAD)
PR_NUMBER=123

# Build Information
BUILD_STATUS=success
BUILD_DURATION=5m32s
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
WORKFLOW_NAME=CI
WORKFLOW_URL=https://github.com/w9bikze8u4cbupc/MOBIUS/actions

# Quality Metrics
SSIM_SCORE=0.998
SSIM_THRESHOLD=0.995
LUFS_VALUE=-23.2
LUFS_TOLERANCE=1.0
TRUE_PEAK_VALUE=-2.1
TP_TOLERANCE=1.0
TEST_COVERAGE=95

# URLs (update with actual artifact URLs)
PREVIEW_VIDEO_URL=https://github.com/w9bikze8u4cbupc/MOBIUS/actions/runs/123/artifacts/preview.mp4
AUDIO_REPORT_URL=https://github.com/w9bikze8u4cbupc/MOBIUS/actions/runs/123/artifacts/audio.txt
CONTAINER_DATA_URL=https://github.com/w9bikze8u4cbupc/MOBIUS/actions/runs/123/artifacts/ffprobe.json
JUNIT_REPORTS_URL=https://github.com/w9bikze8u4cbupc/MOBIUS/actions/runs/123/artifacts/junit.zip
DEBUG_ASSETS_URL=https://github.com/w9bikze8u4cbupc/MOBIUS/actions/runs/123/artifacts/debug.zip

# Repository Information
REPOSITORY=w9bikze8u4cbupc/MOBIUS
REPOSITORY_URL=https://github.com/w9bikze8u4cbupc/MOBIUS
ISSUES_URL=https://github.com/w9bikze8u4cbupc/MOBIUS/issues
DOCS_URL=https://github.com/w9bikze8u4cbupc/MOBIUS/wiki

# Contact Information (update with actual contacts)
ON_CALL_PHONE="+1-555-0199"
DEVOPS_LEAD_PHONE="+1-555-0123"
EOF
    
    echo "✅ Created sample variables file: $VARIABLE_FILE"
    echo "📝 Edit the variables and run again"
    exit 0
fi

# Load variables
echo "📄 Loading variables from: $VARIABLE_FILE"
source "$VARIABLE_FILE"

# Create output filename
OUTPUT_FILE="${TEMPLATE_FILE%.md}_output.${TEMPLATE_FILE##*.}"
if [[ "$TEMPLATE_FILE" == *.sh ]]; then
    OUTPUT_FILE="${TEMPLATE_FILE%.sh}_output.sh"
elif [[ "$TEMPLATE_FILE" == *.json ]]; then
    OUTPUT_FILE="${TEMPLATE_FILE%.json}_output.json"
fi

echo "🔄 Processing template: $TEMPLATE_FILE"
echo "📝 Output file: $OUTPUT_FILE"

# Process template with variable substitution
cp "$TEMPLATE_FILE" "$OUTPUT_FILE"

# Simple variable substitution (handles most common cases)
for var in $(env | grep -E '^[A-Z_]+=' | cut -d= -f1); do
    if [ -n "${!var}" ]; then
        # Use sed for substitution, handling special characters
        value="${!var}"
        # Escape special sed characters in the value
        escaped_value=$(printf '%s\n' "$value" | sed 's/[[\.*^$()+?{|]/\\&/g')
        sed -i.bak "s/{{${var}}}/${escaped_value}/g" "$OUTPUT_FILE"
    fi
done

# Clean up backup file
rm -f "${OUTPUT_FILE}.bak"

# Additional processing for specific file types
if [[ "$OUTPUT_FILE" == *.sh ]]; then
    chmod +x "$OUTPUT_FILE"
    echo "🔑 Made script executable"
fi

echo "✅ Template processed successfully!"
echo ""
echo "📋 Summary:"
echo "  Input:  $TEMPLATE_FILE"
echo "  Output: $OUTPUT_FILE"
echo "  Variables: $(grep -c '^[A-Z_]*=' "$VARIABLE_FILE" 2>/dev/null || echo 0) loaded"
echo ""
echo "💡 Next steps:"
echo "  - Review the output file: cat '$OUTPUT_FILE'"
echo "  - Copy to appropriate location"
echo "  - Use in your CI/CD pipeline or deployment process"