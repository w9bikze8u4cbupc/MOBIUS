#!/bin/bash
# MOBIUS Deployment Framework - LCM Export Script  
# Exports lifecycle management artifacts and configuration

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default configuration
ENV="${ENV:-staging}"
EXPORT_DIR="${REPO_ROOT}/lcm_exports"
INCLUDE_SECRETS=false

# Help message
show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Export lifecycle management artifacts for MOBIUS

OPTIONS:
    --env ENV           Target environment (staging|production) [default: staging]
    --export-dir DIR    Export directory [default: ${EXPORT_DIR}]
    --include-secrets   Include sensitive configuration (use with caution)
    --help             Show this help message

EXAMPLES:
    $0 --env production --export-dir /path/to/exports
    $0 --env staging --include-secrets

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            shift 2
            ;;
        --export-dir)
            EXPORT_DIR="$2"
            shift 2
            ;;
        --include-secrets)
            INCLUDE_SECRETS=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            show_help >&2
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! "$ENV" =~ ^(staging|production)$ ]]; then
    echo "ERROR: Invalid environment '$ENV'. Must be 'staging' or 'production'." >&2
    exit 1
fi

TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
EXPORT_SUBDIR="$EXPORT_DIR/lcm_export_${ENV}_${TIMESTAMP}"

echo "========================================"
echo "MOBIUS LCM Export"
echo "========================================"
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "Environment: $ENV"
echo "Export Directory: $EXPORT_SUBDIR"
echo "Include Secrets: $INCLUDE_SECRETS"
echo "Git Commit: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
echo "Git Branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
echo "========================================"

# Create export directory
mkdir -p "$EXPORT_SUBDIR"

echo ""
echo "=== Phase 1: Application Configuration Export ==="

# Export package.json configuration
if [[ -f "$REPO_ROOT/package.json" ]]; then
    cp "$REPO_ROOT/package.json" "$EXPORT_SUBDIR/"
    echo "✓ Exported package.json"
fi

if [[ -f "$REPO_ROOT/package-lock.json" ]]; then
    cp "$REPO_ROOT/package-lock.json" "$EXPORT_SUBDIR/"
    echo "✓ Exported package-lock.json"
fi

# Export client configuration if exists
if [[ -d "$REPO_ROOT/client" ]]; then
    mkdir -p "$EXPORT_SUBDIR/client"
    if [[ -f "$REPO_ROOT/client/package.json" ]]; then
        cp "$REPO_ROOT/client/package.json" "$EXPORT_SUBDIR/client/"
        echo "✓ Exported client/package.json"
    fi
    if [[ -f "$REPO_ROOT/client/package-lock.json" ]]; then
        cp "$REPO_ROOT/client/package-lock.json" "$EXPORT_SUBDIR/client/"
        echo "✓ Exported client/package-lock.json"
    fi
fi

echo ""
echo "=== Phase 2: Deployment Configuration Export ==="

# Export deployment scripts
if [[ -d "$REPO_ROOT/scripts/deploy" ]]; then
    cp -r "$REPO_ROOT/scripts/deploy" "$EXPORT_SUBDIR/"
    echo "✓ Exported deployment scripts"
fi

# Export CI/CD workflows
if [[ -d "$REPO_ROOT/.github/workflows" ]]; then
    mkdir -p "$EXPORT_SUBDIR/.github"
    cp -r "$REPO_ROOT/.github/workflows" "$EXPORT_SUBDIR/.github/"
    echo "✓ Exported CI/CD workflows"
fi

# Export runbooks if they exist
if [[ -d "$REPO_ROOT/runbooks" ]]; then
    cp -r "$REPO_ROOT/runbooks" "$EXPORT_SUBDIR/"
    echo "✓ Exported runbooks"
fi

echo ""
echo "=== Phase 3: Environment-Specific Configuration ==="

# Create environment configuration manifest
cat > "$EXPORT_SUBDIR/environment_config.json" << EOF
{
  "environment": "$ENV",
  "timestamp": "$TIMESTAMP",
  "export_date": "$(date -u '+%Y-%m-%d %H:%M:%S UTC')",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "nodejs_version": "$(node --version 2>/dev/null || echo 'unknown')",
  "npm_version": "$(npm --version 2>/dev/null || echo 'unknown')",
  "include_secrets": $INCLUDE_SECRETS,
  "exported_components": [
    "application_config",
    "deployment_scripts", 
    "ci_cd_workflows",
    "runbooks",
    "environment_metadata"
  ]
}
EOF
echo "✓ Created environment configuration manifest"

# Export environment variables template
if [[ -f "$REPO_ROOT/.env.example" ]]; then
    cp "$REPO_ROOT/.env.example" "$EXPORT_SUBDIR/"
    echo "✓ Exported environment variables template"
else
    # Create a basic template
    cat > "$EXPORT_SUBDIR/.env.example" << EOF
# MOBIUS Environment Configuration Template
# Generated on $(date -u '+%Y-%m-%d %H:%M:%S UTC')

# Environment
NODE_ENV=${ENV}

# API Configuration
API_KEY=your_api_key_here
API_BASE_URL=http://localhost:5001

# Database Configuration (if applicable)
# DATABASE_URL=your_database_url_here

# Logging
LOG_LEVEL=info

# Feature Flags
# ENABLE_FEATURE_X=false
EOF
    echo "✓ Created environment variables template"
fi

echo ""
echo "=== Phase 4: Operational Metadata Export ==="

# Export git information
cat > "$EXPORT_SUBDIR/git_info.json" << EOF
{
  "commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "tag": "$(git describe --tags --exact-match 2>/dev/null || echo 'none')",
  "author": "$(git log -1 --format='%an <%ae>' 2>/dev/null || echo 'unknown')",
  "commit_date": "$(git log -1 --format='%ai' 2>/dev/null || echo 'unknown')",
  "commit_message": "$(git log -1 --format='%s' 2>/dev/null || echo 'unknown')",
  "repository_url": "$(git config --get remote.origin.url 2>/dev/null || echo 'unknown')"
}
EOF
echo "✓ Exported git information"

# Export dependency information
if [[ -f "$REPO_ROOT/package.json" ]]; then
    echo "Exporting dependency information..."
    
    # Create dependency manifest
    cat > "$EXPORT_SUBDIR/dependency_info.json" << EOF
{
  "export_timestamp": "$(date -u '+%Y-%m-%d %H:%M:%S UTC')",
  "environment": "$ENV",
  "package_manager": "npm",
  "nodejs_version": "$(node --version 2>/dev/null || echo 'unknown')",
  "npm_version": "$(npm --version 2>/dev/null || echo 'unknown')",
  "dependencies": $(jq '.dependencies // {}' "$REPO_ROOT/package.json"),
  "devDependencies": $(jq '.devDependencies // {}' "$REPO_ROOT/package.json"),
  "scripts": $(jq '.scripts // {}' "$REPO_ROOT/package.json")
}
EOF
    echo "✓ Created dependency manifest"
    
    # Export dependency tree
    if npm list --json > "$EXPORT_SUBDIR/dependency_tree.json" 2>/dev/null; then
        echo "✓ Exported dependency tree"
    else
        echo "⚠ Could not export full dependency tree"
    fi
fi

echo ""
echo "=== Phase 5: System Information Export ==="

# Export system information
cat > "$EXPORT_SUBDIR/system_info.json" << EOF
{
  "export_timestamp": "$(date -u '+%Y-%m-%d %H:%M:%S UTC')",
  "environment": "$ENV", 
  "operating_system": "$(uname -s 2>/dev/null || echo 'unknown')",
  "architecture": "$(uname -m 2>/dev/null || echo 'unknown')",
  "kernel_version": "$(uname -r 2>/dev/null || echo 'unknown')",
  "hostname": "$(hostname 2>/dev/null || echo 'unknown')",
  "user": "$(whoami 2>/dev/null || echo 'unknown')",
  "working_directory": "$REPO_ROOT",
  "disk_usage": $(df -h "$REPO_ROOT" 2>/dev/null | awk 'NR==2 {printf "{\"filesystem\":\"%s\",\"size\":\"%s\",\"used\":\"%s\",\"available\":\"%s\",\"use_percent\":\"%s\",\"mount\":\"%s\"}", $1,$2,$3,$4,$5,$6}' || echo '{}')
}
EOF
echo "✓ Exported system information"

echo ""
echo "=== Phase 6: Security and Compliance ==="

if [[ "$INCLUDE_SECRETS" == "true" ]]; then
    echo "⚠ WARNING: Including sensitive configuration data"
    
    # Export current environment variables (filtered)
    env | grep -E '^(NODE_ENV|API_|DATABASE_|LOG_)' > "$EXPORT_SUBDIR/current_env_vars.txt" 2>/dev/null || true
    echo "✓ Exported filtered environment variables"
    
    # Note about security
    cat > "$EXPORT_SUBDIR/SECURITY_WARNING.txt" << EOF
⚠️  SECURITY WARNING ⚠️

This export includes potentially sensitive configuration data.

- Review all files before sharing or storing
- Remove or redact sensitive information as needed
- Ensure secure storage and transmission
- Follow your organization's data handling policies

Export created: $(date -u '+%Y-%m-%d %H:%M:%S UTC')
Environment: $ENV
EOF
else
    echo "✓ Secrets excluded from export (use --include-secrets to include)"
fi

# Create audit trail
cat > "$EXPORT_SUBDIR/export_audit.json" << EOF
{
  "export_id": "${ENV}_${TIMESTAMP}",
  "export_timestamp": "$(date -u '+%Y-%m-%d %H:%M:%S UTC')",
  "export_user": "$(whoami 2>/dev/null || echo 'unknown')",
  "export_host": "$(hostname 2>/dev/null || echo 'unknown')", 
  "environment": "$ENV",
  "include_secrets": $INCLUDE_SECRETS,
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "export_size_bytes": $(du -sb "$EXPORT_SUBDIR" | cut -f1),
  "file_count": $(find "$EXPORT_SUBDIR" -type f | wc -l)
}
EOF
echo "✓ Created export audit trail"

echo ""
echo "=== Phase 7: Archive Creation ==="

# Create compressed archive
ARCHIVE_NAME="lcm_export_${ENV}_${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="$EXPORT_DIR/$ARCHIVE_NAME"

echo "Creating compressed archive..."
cd "$EXPORT_DIR"
tar -czf "$ARCHIVE_NAME" "$(basename "$EXPORT_SUBDIR")"

# Create checksum
sha256sum "$ARCHIVE_NAME" > "$ARCHIVE_NAME.sha256"

# Get final sizes
EXPORT_SIZE=$(du -h "$EXPORT_SUBDIR" | cut -f1)
ARCHIVE_SIZE=$(du -h "$ARCHIVE_PATH" | cut -f1)
FILE_COUNT=$(find "$EXPORT_SUBDIR" -type f | wc -l)

echo ""
echo "========================================"
echo "LCM EXPORT COMPLETED"
echo "========================================"
echo "Environment: $ENV"
echo "Export Directory: $EXPORT_SUBDIR"
echo "Archive: $ARCHIVE_PATH"
echo "Export Size: $EXPORT_SIZE"
echo "Archive Size: $ARCHIVE_SIZE" 
echo "Files Exported: $FILE_COUNT"
echo "Include Secrets: $INCLUDE_SECRETS"
echo "Checksum: $ARCHIVE_NAME.sha256"
echo ""
echo "Verification command:"
echo "  cd $EXPORT_DIR && sha256sum -c $ARCHIVE_NAME.sha256"
echo ""
echo "Extract command:"
echo "  cd $EXPORT_DIR && tar -xzf $ARCHIVE_NAME"
echo ""
if [[ "$INCLUDE_SECRETS" == "true" ]]; then
    echo "⚠️  REMEMBER: This export contains sensitive data"
    echo "   Handle according to security policies"
fi
echo "========================================"