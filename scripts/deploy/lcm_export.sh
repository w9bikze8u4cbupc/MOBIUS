#!/bin/bash
# MOBIUS Lifecycle Management Export
# Exports deployment artifacts and configuration for lifecycle management

set -euo pipefail

EXPORT_DIR="${EXPORT_DIR:-./lcm_export}"
ENV="${DEPLOY_ENV:-production}"
EXPORT_LOG="${EXPORT_LOG:-./logs/lcm_export.log}"
INCLUDE_SENSITIVE="${INCLUDE_SENSITIVE:-false}"
EXPORT_FORMAT="${EXPORT_FORMAT:-tar.gz}"

# Ensure directories exist
mkdir -p "$(dirname "$EXPORT_LOG")" "$EXPORT_DIR"

# Function to log with timestamp
log() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$message" | tee -a "$EXPORT_LOG"
}

# Function to export application code
export_application_code() {
    log "=== Exporting Application Code ==="
    
    local code_dir="$EXPORT_DIR/application"
    mkdir -p "$code_dir"
    
    # Copy source code
    if [[ -d "src" ]]; then
        cp -r src "$code_dir/"
        log "✅ Source code exported"
    fi
    
    if [[ -d "client" ]]; then
        cp -r client "$code_dir/"
        log "✅ Client code exported"
    fi
    
    # Copy package files
    if [[ -f "package.json" ]]; then
        cp package.json "$code_dir/"
        log "✅ package.json exported"
    fi
    
    if [[ -f "package-lock.json" ]]; then
        cp package-lock.json "$code_dir/"
        log "✅ package-lock.json exported"
    fi
    
    # Copy other important files
    local important_files=("README.md" ".gitignore" ".env.example")
    for file in "${important_files[@]}"; do
        if [[ -f "$file" ]]; then
            cp "$file" "$code_dir/"
            log "✅ $file exported"
        fi
    done
}

# Function to export scripts and configuration
export_scripts_and_config() {
    log "=== Exporting Scripts and Configuration ==="
    
    local config_dir="$EXPORT_DIR/configuration"
    mkdir -p "$config_dir"
    
    # Copy deployment scripts
    if [[ -d "scripts" ]]; then
        cp -r scripts "$config_dir/"
        log "✅ Deployment scripts exported"
    fi
    
    # Copy GitHub workflows
    if [[ -d ".github" ]]; then
        cp -r .github "$config_dir/"
        log "✅ GitHub workflows exported"
    fi
    
    # Copy runbooks if they exist
    if [[ -d "runbooks" ]]; then
        cp -r runbooks "$config_dir/"
        log "✅ Runbooks exported"
    fi
}

# Function to export test artifacts
export_test_artifacts() {
    log "=== Exporting Test Artifacts ==="
    
    local test_dir="$EXPORT_DIR/tests"
    mkdir -p "$test_dir"
    
    # Copy golden test files
    if [[ -d "tests/golden" ]]; then
        cp -r tests/golden "$test_dir/"
        log "✅ Golden test files exported"
    fi
    
    # Copy any other test directories
    if [[ -d "tests" ]]; then
        find tests -name "*.json" -o -name "*.js" -o -name "*.ts" | while read -r test_file; do
            local rel_path
            rel_path=$(dirname "$test_file")
            mkdir -p "$test_dir/$rel_path"
            cp "$test_file" "$test_dir/$test_file"
        done
        log "✅ Additional test files exported"
    fi
}

# Function to export deployment artifacts
export_deployment_artifacts() {
    log "=== Exporting Deployment Artifacts ==="
    
    local artifacts_dir="$EXPORT_DIR/deployment_artifacts"
    mkdir -p "$artifacts_dir"
    
    # Copy backups
    if [[ -d "backups" ]]; then
        # Only copy recent backups (last 5)
        find backups -name "dhash_*.zip" -type f | sort -r | head -5 | while read -r backup; do
            cp "$backup" "${backup}.sha256" "$artifacts_dir/" 2>/dev/null || true
        done
        log "✅ Recent backups exported"
    fi
    
    # Copy premerge artifacts if they exist
    if [[ -d "premerge_artifacts" ]]; then
        cp -r premerge_artifacts "$artifacts_dir/"
        log "✅ Pre-merge artifacts exported"
    fi
    
    # Copy logs (recent ones only)
    if [[ -d "logs" ]]; then
        local logs_dir="$artifacts_dir/logs"
        mkdir -p "$logs_dir"
        
        # Copy recent logs (last 7 days)
        find logs -name "*.log" -mtime -7 -type f 2>/dev/null | while read -r log_file; do
            local rel_path
            rel_path=$(dirname "$log_file")
            mkdir -p "$logs_dir/$rel_path"
            cp "$log_file" "$logs_dir/$log_file" 2>/dev/null || true
        done
        log "✅ Recent logs exported"
    fi
}

# Function to export environment information
export_environment_info() {
    log "=== Exporting Environment Information ==="
    
    local env_dir="$EXPORT_DIR/environment"
    mkdir -p "$env_dir"
    
    # System information
    {
        echo "=== System Information ==="
        echo "Export Date: $(date)"
        echo "Environment: $ENV"
        echo "Hostname: $(hostname)"
        echo "OS: $(uname -a)"
        echo ""
        
        echo "=== Software Versions ==="
        if command -v node >/dev/null 2>&1; then
            echo "Node.js: $(node --version)"
        fi
        
        if command -v npm >/dev/null 2>&1; then
            echo "npm: $(npm --version)"
        fi
        
        if command -v git >/dev/null 2>&1; then
            echo "Git: $(git --version)"
        fi
        
        if command -v ffmpeg >/dev/null 2>&1; then
            echo "FFmpeg: $(ffmpeg -version | head -1)"
        fi
        
        echo ""
        echo "=== Git Information ==="
        if [[ -d ".git" ]]; then
            echo "Current branch: $(git rev-parse --abbrev-ref HEAD)"
            echo "Current commit: $(git rev-parse HEAD)"
            echo "Commit date: $(git log -1 --format=%cd)"
            echo "Commit message: $(git log -1 --format=%s)"
            echo "Author: $(git log -1 --format=%an)"
        fi
        
    } > "$env_dir/system_info.txt"
    
    # Package information
    if [[ -f "package.json" ]]; then
        {
            echo "=== Dependency Information ==="
            echo ""
            if command -v npm >/dev/null 2>&1; then
                echo "=== Production Dependencies ==="
                npm ls --prod --depth=0 2>/dev/null || echo "Error listing production dependencies"
                echo ""
                echo "=== All Dependencies ==="
                npm ls --depth=0 2>/dev/null || echo "Error listing all dependencies"
            fi
        } > "$env_dir/dependencies.txt"
    fi
    
    # Git diff and status
    if [[ -d ".git" ]]; then
        {
            echo "=== Git Status ==="
            git status || echo "Error getting git status"
            echo ""
            echo "=== Recent Commits (last 10) ==="
            git log --oneline -10 || echo "Error getting git log"
        } > "$env_dir/git_info.txt"
    fi
    
    log "✅ Environment information exported"
}

# Function to export configuration templates
export_configuration_templates() {
    log "=== Exporting Configuration Templates ==="
    
    local templates_dir="$EXPORT_DIR/templates"
    mkdir -p "$templates_dir"
    
    # Environment file template
    if [[ -f ".env.example" ]]; then
        cp ".env.example" "$templates_dir/environment.template"
        log "✅ Environment template exported"
    fi
    
    # Create deployment configuration template
    cat > "$templates_dir/deployment.template" << 'EOF'
# MOBIUS Deployment Configuration Template
# Copy this file and customize for your environment

# Environment
DEPLOY_ENV=production
NODE_ENV=production

# URLs
API_BASE_URL=http://localhost:5001
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL=

# Monitoring
MONITOR_DURATION=3600
CHECK_INTERVAL=60
AUTO_ROLLBACK=true
CONSECUTIVE_FAILURES_THRESHOLD=3

# Backup
BACKUP_DIR=./backups

# Logging
LOG_LEVEL=info
ORCHESTRATION_LOG=./logs/premerge_orchestration.log
EOF
    
    log "✅ Deployment configuration template created"
    
    # Create runbook template if runbooks directory doesn't exist
    if [[ ! -d "runbooks" ]]; then
        mkdir -p "$templates_dir/runbooks"
        
        cat > "$templates_dir/runbooks/deployment_checklist.md" << 'EOF'
# MOBIUS Deployment Checklist

## Pre-Deployment
- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] Backup created and verified
- [ ] Migration dry run completed
- [ ] Smoke tests validated
- [ ] Monitoring setup verified

## Deployment
- [ ] Deploy operator sign-off obtained
- [ ] Production deployment initiated
- [ ] Health checks passing
- [ ] Monitoring active

## Post-Deployment
- [ ] T+60 monitoring window completed
- [ ] Smoke tests executed in production
- [ ] Performance metrics within thresholds
- [ ] Error rates acceptable
- [ ] User acceptance confirmed

## Rollback (if needed)
- [ ] Rollback decision made
- [ ] Latest backup identified and verified
- [ ] Rollback script executed
- [ ] Post-rollback health checks passed
- [ ] Incident documented
EOF
        
        log "✅ Deployment runbook template created"
    fi
}

# Function to create export manifest
create_export_manifest() {
    log "=== Creating Export Manifest ==="
    
    local manifest_file="$EXPORT_DIR/MANIFEST.md"
    
    {
        echo "# MOBIUS Lifecycle Management Export"
        echo ""
        echo "**Export Date:** $(date)"
        echo "**Environment:** $ENV"
        echo "**Export Version:** $(date +%Y%m%d-%H%M%S)"
        echo ""
        
        echo "## Contents"
        echo ""
        
        # List all directories and their contents
        find "$EXPORT_DIR" -type d | sort | while read -r dir; do
            local rel_dir
            rel_dir=$(realpath --relative-to="$EXPORT_DIR" "$dir")
            
            if [[ "$rel_dir" != "." ]]; then
                echo "### $rel_dir"
                echo ""
                
                find "$dir" -maxdepth 1 -type f | sort | while read -r file; do
                    local filename
                    filename=$(basename "$file")
                    local filesize
                    filesize=$(du -h "$file" | cut -f1)
                    echo "- \`$filename\` ($filesize)"
                done
                
                echo ""
            fi
        done
        
        echo "## Usage Instructions"
        echo ""
        echo "1. **Application Code**: Contains source code and package configuration"
        echo "2. **Configuration**: Deployment scripts, workflows, and runbooks"
        echo "3. **Tests**: Golden test files and test artifacts"
        echo "4. **Deployment Artifacts**: Backups, logs, and pre-merge artifacts"
        echo "5. **Environment**: System information and dependency details"
        echo "6. **Templates**: Configuration templates for new environments"
        echo ""
        echo "## Restoration Instructions"
        echo ""
        echo "To restore from this export:"
        echo ""
        echo "1. Extract the archive to a new directory"
        echo "2. Copy application code to target location"
        echo "3. Install dependencies: \`npm ci\` or \`npm install\`"
        echo "4. Configure environment using templates"
        echo "5. Run deployment scripts as needed"
        echo "6. Verify with golden tests"
        echo ""
        
    } > "$manifest_file"
    
    log "✅ Export manifest created: $manifest_file"
}

# Function to create final export archive
create_export_archive() {
    log "=== Creating Export Archive ==="
    
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    local archive_name="mobius_lcm_export_${ENV}_${timestamp}"
    
    case "$EXPORT_FORMAT" in
        "zip")
            local archive_path="${archive_name}.zip"
            if zip -r "$archive_path" "$EXPORT_DIR" >/dev/null 2>&1; then
                log "✅ ZIP archive created: $archive_path"
                echo "$archive_path"
            else
                log "❌ Failed to create ZIP archive"
                return 1
            fi
            ;;
        "tar.gz")
            local archive_path="${archive_name}.tar.gz"
            if tar -czf "$archive_path" -C "." "$EXPORT_DIR" 2>/dev/null; then
                log "✅ TAR.GZ archive created: $archive_path"
                echo "$archive_path"
            else
                log "❌ Failed to create TAR.GZ archive"
                return 1
            fi
            ;;
        *)
            log "❌ Unsupported export format: $EXPORT_FORMAT"
            return 1
            ;;
    esac
}

# Main export function
main() {
    log "=== MOBIUS LIFECYCLE MANAGEMENT EXPORT STARTED ==="
    log "Environment: $ENV"
    log "Export directory: $EXPORT_DIR"
    log "Include sensitive: $INCLUDE_SENSITIVE"
    log "Export format: $EXPORT_FORMAT"
    
    # Clean export directory
    rm -rf "$EXPORT_DIR"
    mkdir -p "$EXPORT_DIR"
    
    # Export all components
    export_application_code
    export_scripts_and_config
    export_test_artifacts
    export_deployment_artifacts
    export_environment_info
    export_configuration_templates
    
    # Create manifest
    create_export_manifest
    
    # Create final archive
    local archive_path
    archive_path=$(create_export_archive)
    
    # Generate checksum
    if [[ -n "$archive_path" ]]; then
        if command -v sha256sum >/dev/null 2>&1; then
            sha256sum "$archive_path" > "${archive_path}.sha256"
            log "✅ Checksum created: ${archive_path}.sha256"
        fi
        
        local archive_size
        archive_size=$(du -h "$archive_path" | cut -f1)
        
        log "=== EXPORT COMPLETED ==="
        log "Archive: $archive_path"
        log "Size: $archive_size"
        log "Checksum: ${archive_path}.sha256"
        
        echo "EXPORT_ARCHIVE=$archive_path"
        echo "EXPORT_CHECKSUM=${archive_path}.sha256"
    fi
}

# Handle help argument
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    cat << EOF
Usage: $0 [options]

Exports MOBIUS deployment artifacts for lifecycle management.

Environment Variables:
  DEPLOY_ENV          Environment name (default: production)
  EXPORT_DIR          Export directory (default: ./lcm_export)
  EXPORT_LOG          Log file path (default: ./logs/lcm_export.log)
  INCLUDE_SENSITIVE   Include sensitive data (default: false)
  EXPORT_FORMAT       Archive format: zip or tar.gz (default: tar.gz)

Exit Codes:
  0   Export completed successfully
  1   Export failed

Examples:
  $0                              # Standard export
  EXPORT_FORMAT=zip $0           # Export as ZIP
  DEPLOY_ENV=staging $0          # Export for staging
EOF
    exit 0
fi

# Execute main function
main "$@"