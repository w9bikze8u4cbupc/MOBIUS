#!/bin/bash
# MOBIUS Deployment - Lifecycle Management (LCM) Export Script
# Exports deployment artifacts and configuration for external LCM systems

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Configuration
DEFAULT_FORMAT="json"
DEFAULT_OUTPUT="${PROJECT_ROOT}/lcm_export"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --format FORMAT      Output format (json|yaml|xml) (default: $DEFAULT_FORMAT)"
    echo "  --output DIR         Output directory (default: $DEFAULT_OUTPUT)"
    echo "  --env ENV           Environment to export (staging|production|all)"
    echo "  --include LIST      Comma-separated list of components to include"
    echo "                      Options: config,scripts,docs,workflows,templates"
    echo "                      Default: all components"
    echo "  --compress          Create compressed archive of export"
    echo "  --validate          Validate export completeness"
    echo "  --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --format yaml --output ./export --compress"
    echo "  $0 --env production --include config,scripts --validate"
    exit 1
}

# Parse arguments
FORMAT="${DEFAULT_FORMAT}"
OUTPUT_DIR="${DEFAULT_OUTPUT}"
ENV=""
INCLUDE=""
COMPRESS=false
VALIDATE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --format)
            FORMAT="$2"
            shift 2
            ;;
        --output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --env)
            ENV="$2"
            shift 2
            ;;
        --include)
            INCLUDE="$2"
            shift 2
            ;;
        --compress)
            COMPRESS=true
            shift
            ;;
        --validate)
            VALIDATE=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate format
if [[ ! "$FORMAT" =~ ^(json|yaml|xml)$ ]]; then
    echo "Error: Invalid format '$FORMAT'. Must be json, yaml, or xml."
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

LOG_FILE="${OUTPUT_DIR}/lcm_export_$(date +%Y%m%d_%H%M%S).log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== MOBIUS LCM EXPORT ==="
log "Format: $FORMAT"
log "Output directory: $OUTPUT_DIR"
log "Environment: ${ENV:-"all"}"
log "Include: ${INCLUDE:-"all components"}"
log "Compress: $COMPRESS"
log "Validate: $VALIDATE"
log ""

# Export metadata
export_metadata() {
    log "Exporting system metadata..."
    
    local metadata_file="${OUTPUT_DIR}/metadata.${FORMAT}"
    
    case "$FORMAT" in
        json)
            cat > "$metadata_file" << EOF
{
  "system": "MOBIUS",
  "description": "Game tutorial video generation system",
  "version": "$(git describe --tags --always 2>/dev/null || echo "unknown")",
  "export_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "export_version": "1.0.0",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo "unknown")",
  "git_branch": "$(git branch --show-current 2>/dev/null || echo "unknown")",
  "components": {
    "frontend": {
      "type": "React SPA",
      "location": "client/",
      "port": 3000
    },
    "backend": {
      "type": "Node.js Express API",
      "location": "src/api/",
      "port": 5001
    },
    "processing": {
      "type": "FFmpeg pipeline",
      "location": "scripts/",
      "dependencies": ["ffmpeg", "ffprobe"]
    }
  },
  "environments": {
    "staging": {
      "api_url": "https://staging-api.mobius.com",
      "status_url": "https://staging-status.mobius.com"
    },
    "production": {
      "api_url": "https://api.mobius.com", 
      "status_url": "https://status.mobius.com"
    }
  }
}
EOF
            ;;
        yaml)
            cat > "$metadata_file" << EOF
system: MOBIUS
description: Game tutorial video generation system
version: $(git describe --tags --always 2>/dev/null || echo "unknown")
export_timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)
export_version: 1.0.0
git_commit: $(git rev-parse HEAD 2>/dev/null || echo "unknown")
git_branch: $(git branch --show-current 2>/dev/null || echo "unknown")

components:
  frontend:
    type: React SPA
    location: client/
    port: 3000
  backend:
    type: Node.js Express API
    location: src/api/
    port: 5001
  processing:
    type: FFmpeg pipeline
    location: scripts/
    dependencies:
      - ffmpeg
      - ffprobe

environments:
  staging:
    api_url: https://staging-api.mobius.com
    status_url: https://staging-status.mobius.com
  production:
    api_url: https://api.mobius.com
    status_url: https://status.mobius.com
EOF
            ;;
        xml)
            cat > "$metadata_file" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<mobius-export>
    <system>MOBIUS</system>
    <description>Game tutorial video generation system</description>
    <version>$(git describe --tags --always 2>/dev/null || echo "unknown")</version>
    <export-timestamp>$(date -u +%Y-%m-%dT%H:%M:%SZ)</export-timestamp>
    <export-version>1.0.0</export-version>
    <git-commit>$(git rev-parse HEAD 2>/dev/null || echo "unknown")</git-commit>
    <git-branch>$(git branch --show-current 2>/dev/null || echo "unknown")</git-branch>
    
    <components>
        <frontend type="React SPA" location="client/" port="3000"/>
        <backend type="Node.js Express API" location="src/api/" port="5001"/>
        <processing type="FFmpeg pipeline" location="scripts/">
            <dependencies>
                <dependency>ffmpeg</dependency>
                <dependency>ffprobe</dependency>
            </dependencies>
        </processing>
    </components>
    
    <environments>
        <staging api-url="https://staging-api.mobius.com" status-url="https://staging-status.mobius.com"/>
        <production api-url="https://api.mobius.com" status-url="https://status.mobius.com"/>
    </environments>
</mobius-export>
EOF
            ;;
    esac
    
    log "✓ Metadata exported: $metadata_file"
}

# Export configuration
export_configuration() {
    log "Exporting configuration files..."
    
    local config_dir="${OUTPUT_DIR}/configuration"
    mkdir -p "$config_dir"
    
    # Copy configuration files
    [[ -f "${PROJECT_ROOT}/package.json" ]] && cp "${PROJECT_ROOT}/package.json" "$config_dir/"
    [[ -f "${PROJECT_ROOT}/client/package.json" ]] && cp "${PROJECT_ROOT}/client/package.json" "$config_dir/client-package.json"
    [[ -f "${PROJECT_ROOT}/.env.example" ]] && cp "${PROJECT_ROOT}/.env.example" "$config_dir/"
    [[ -d "${PROJECT_ROOT}/config" ]] && cp -r "${PROJECT_ROOT}/config" "$config_dir/"
    
    # Create configuration summary
    local config_summary="${config_dir}/summary.${FORMAT}"
    
    case "$FORMAT" in
        json)
            cat > "$config_summary" << EOF
{
  "configuration_files": [
    "package.json",
    "client-package.json", 
    ".env.example",
    "config/"
  ],
  "runtime_configuration": {
    "node_version": "$(node --version 2>/dev/null || echo "unknown")",
    "npm_version": "$(npm --version 2>/dev/null || echo "unknown")",
    "ffmpeg_version": "$(ffmpeg -version 2>/dev/null | head -n1 || echo "unknown")"
  },
  "environment_variables": {
    "required": [
      "OPENAI_API_KEY",
      "IMAGE_EXTRACTOR_API_KEY",
      "PORT"
    ],
    "optional": [
      "SLACK_WEBHOOK_GENERAL",
      "TEAMS_WEBHOOK_GENERAL",
      "OUTPUT_DIR"
    ]
  }
}
EOF
            ;;
        yaml)
            cat > "$config_summary" << EOF
configuration_files:
  - package.json
  - client-package.json
  - .env.example
  - config/

runtime_configuration:
  node_version: $(node --version 2>/dev/null || echo "unknown")
  npm_version: $(npm --version 2>/dev/null || echo "unknown") 
  ffmpeg_version: $(ffmpeg -version 2>/dev/null | head -n1 || echo "unknown")

environment_variables:
  required:
    - OPENAI_API_KEY
    - IMAGE_EXTRACTOR_API_KEY
    - PORT
  optional:
    - SLACK_WEBHOOK_GENERAL
    - TEAMS_WEBHOOK_GENERAL
    - OUTPUT_DIR
EOF
            ;;
        xml)
            cat > "$config_summary" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<configuration-summary>
    <configuration-files>
        <file>package.json</file>
        <file>client-package.json</file>
        <file>.env.example</file>
        <file>config/</file>
    </configuration-files>
    
    <runtime-configuration>
        <node-version>$(node --version 2>/dev/null || echo "unknown")</node-version>
        <npm-version>$(npm --version 2>/dev/null || echo "unknown")</npm-version>
        <ffmpeg-version>$(ffmpeg -version 2>/dev/null | head -n1 || echo "unknown")</ffmpeg-version>
    </runtime-configuration>
    
    <environment-variables>
        <required>
            <variable>OPENAI_API_KEY</variable>
            <variable>IMAGE_EXTRACTOR_API_KEY</variable>
            <variable>PORT</variable>
        </required>
        <optional>
            <variable>SLACK_WEBHOOK_GENERAL</variable>
            <variable>TEAMS_WEBHOOK_GENERAL</variable>
            <variable>OUTPUT_DIR</variable>
        </optional>
    </environment-variables>
</configuration-summary>
EOF
            ;;
    esac
    
    log "✓ Configuration exported: $config_dir"
}

# Export deployment scripts
export_scripts() {
    log "Exporting deployment scripts..."
    
    local scripts_dir="${OUTPUT_DIR}/scripts"
    mkdir -p "$scripts_dir"
    
    # Copy deployment scripts
    if [[ -d "${PROJECT_ROOT}/scripts/deploy" ]]; then
        cp -r "${PROJECT_ROOT}/scripts/deploy" "$scripts_dir/"
    fi
    
    # Copy other important scripts
    [[ -f "${PROJECT_ROOT}/scripts/generate_golden.js" ]] && cp "${PROJECT_ROOT}/scripts/generate_golden.js" "$scripts_dir/"
    [[ -f "${PROJECT_ROOT}/scripts/check_golden.js" ]] && cp "${PROJECT_ROOT}/scripts/check_golden.js" "$scripts_dir/"
    
    # Create scripts manifest
    local scripts_manifest="${scripts_dir}/manifest.${FORMAT}"
    
    local script_count
    script_count=$(find "$scripts_dir" -name "*.sh" -o -name "*.js" | wc -l)
    
    case "$FORMAT" in
        json)
            cat > "$scripts_manifest" << EOF
{
  "deployment_scripts": {
    "total_count": $script_count,
    "scripts": [
      {
        "name": "backup_dhash.sh",
        "purpose": "Create backups with SHA256 verification",
        "usage": "./backup_dhash.sh --env production --components all"
      },
      {
        "name": "deploy_dhash.sh", 
        "purpose": "Main deployment orchestration",
        "usage": "./deploy_dhash.sh --env production --mode production"
      },
      {
        "name": "rollback_dhash.sh",
        "purpose": "Emergency rollback to previous backup",
        "usage": "./rollback_dhash.sh --backup backup.zip --env production"
      },
      {
        "name": "monitor_dhash.sh",
        "purpose": "Post-deployment monitoring with auto-rollback",
        "usage": "./monitor_dhash.sh --env production --duration 3600 --auto-rollback"
      },
      {
        "name": "smoke_tests.sh",
        "purpose": "Comprehensive post-deployment validation",
        "usage": "./smoke_tests.sh --env production --base-url https://api.mobius.com"
      },
      {
        "name": "notify.js",
        "purpose": "Webhook-safe notification tool",
        "usage": "./notify.js template deploy-start production v1.2.3"
      },
      {
        "name": "premerge_orchestration.sh",
        "purpose": "Pre-merge validation and artifact collection",
        "usage": "./premerge_orchestration.sh --env staging"
      }
    ]
  }
}
EOF
            ;;
        yaml)
            cat > "$scripts_manifest" << EOF
deployment_scripts:
  total_count: $script_count
  scripts:
    - name: backup_dhash.sh
      purpose: Create backups with SHA256 verification
      usage: "./backup_dhash.sh --env production --components all"
    - name: deploy_dhash.sh
      purpose: Main deployment orchestration
      usage: "./deploy_dhash.sh --env production --mode production"
    - name: rollback_dhash.sh
      purpose: Emergency rollback to previous backup
      usage: "./rollback_dhash.sh --backup backup.zip --env production"
    - name: monitor_dhash.sh
      purpose: Post-deployment monitoring with auto-rollback
      usage: "./monitor_dhash.sh --env production --duration 3600 --auto-rollback"
    - name: smoke_tests.sh
      purpose: Comprehensive post-deployment validation
      usage: "./smoke_tests.sh --env production --base-url https://api.mobius.com"
    - name: notify.js
      purpose: Webhook-safe notification tool
      usage: "./notify.js template deploy-start production v1.2.3"
    - name: premerge_orchestration.sh
      purpose: Pre-merge validation and artifact collection
      usage: "./premerge_orchestration.sh --env staging"
EOF
            ;;
        xml)
            cat > "$scripts_manifest" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<deployment-scripts>
    <total-count>$script_count</total-count>
    <scripts>
        <script name="backup_dhash.sh" purpose="Create backups with SHA256 verification" usage="./backup_dhash.sh --env production --components all"/>
        <script name="deploy_dhash.sh" purpose="Main deployment orchestration" usage="./deploy_dhash.sh --env production --mode production"/>
        <script name="rollback_dhash.sh" purpose="Emergency rollback to previous backup" usage="./rollback_dhash.sh --backup backup.zip --env production"/>
        <script name="monitor_dhash.sh" purpose="Post-deployment monitoring with auto-rollback" usage="./monitor_dhash.sh --env production --duration 3600 --auto-rollback"/>
        <script name="smoke_tests.sh" purpose="Comprehensive post-deployment validation" usage="./smoke_tests.sh --env production --base-url https://api.mobius.com"/>
        <script name="notify.js" purpose="Webhook-safe notification tool" usage="./notify.js template deploy-start production v1.2.3"/>
        <script name="premerge_orchestration.sh" purpose="Pre-merge validation and artifact collection" usage="./premerge_orchestration.sh --env staging"/>
    </scripts>
</deployment-scripts>
EOF
            ;;
    esac
    
    log "✓ Scripts exported: $scripts_dir"
}

# Export documentation
export_documentation() {
    log "Exporting documentation..."
    
    local docs_dir="${OUTPUT_DIR}/documentation"
    mkdir -p "$docs_dir"
    
    # Copy documentation
    [[ -f "${PROJECT_ROOT}/README.md" ]] && cp "${PROJECT_ROOT}/README.md" "$docs_dir/"
    [[ -d "${PROJECT_ROOT}/docs" ]] && cp -r "${PROJECT_ROOT}/docs" "$docs_dir/"
    
    log "✓ Documentation exported: $docs_dir"
}

# Export workflows
export_workflows() {
    log "Exporting CI/CD workflows..."
    
    local workflows_dir="${OUTPUT_DIR}/workflows"
    mkdir -p "$workflows_dir"
    
    # Copy GitHub workflows
    if [[ -d "${PROJECT_ROOT}/.github/workflows" ]]; then
        cp -r "${PROJECT_ROOT}/.github/workflows" "$workflows_dir/"
    fi
    
    # Copy other GitHub configurations
    [[ -f "${PROJECT_ROOT}/.github/CODEOWNERS" ]] && cp "${PROJECT_ROOT}/.github/CODEOWNERS" "$workflows_dir/"
    
    log "✓ Workflows exported: $workflows_dir"
}

# Export templates
export_templates() {
    log "Exporting templates and configurations..."
    
    local templates_dir="${OUTPUT_DIR}/templates"
    mkdir -p "$templates_dir"
    
    # Copy deployment templates
    if [[ -d "${PROJECT_ROOT}/docs/deployment/templates" ]]; then
        cp -r "${PROJECT_ROOT}/docs/deployment/templates"/* "$templates_dir/"
    fi
    
    log "✓ Templates exported: $templates_dir"
}

# Validate export
validate_export() {
    if [[ "$VALIDATE" != "true" ]]; then
        return
    fi
    
    log "Validating export completeness..."
    
    local validation_report="${OUTPUT_DIR}/validation.${FORMAT}"
    local issues=()
    
    # Check required components
    [[ ! -f "${OUTPUT_DIR}/metadata.${FORMAT}" ]] && issues+=("Missing metadata file")
    [[ ! -d "${OUTPUT_DIR}/configuration" ]] && issues+=("Missing configuration directory")
    [[ ! -d "${OUTPUT_DIR}/scripts" ]] && issues+=("Missing scripts directory")
    [[ ! -d "${OUTPUT_DIR}/documentation" ]] && issues+=("Missing documentation directory")
    
    # Check critical scripts
    local critical_scripts=("backup_dhash.sh" "deploy_dhash.sh" "rollback_dhash.sh" "monitor_dhash.sh")
    for script in "${critical_scripts[@]}"; do
        [[ ! -f "${OUTPUT_DIR}/scripts/deploy/$script" ]] && issues+=("Missing critical script: $script")
    done
    
    case "$FORMAT" in
        json)
            cat > "$validation_report" << EOF
{
  "validation_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "export_valid": $(if [[ ${#issues[@]} -eq 0 ]]; then echo "true"; else echo "false"; fi),
  "issues_found": ${#issues[@]},
  "issues": [
$(printf '    "%s"' "${issues[@]}" | paste -sd',\n' -)
  ],
  "file_count": $(find "$OUTPUT_DIR" -type f | wc -l),
  "directory_count": $(find "$OUTPUT_DIR" -type d | wc -l),
  "total_size_bytes": $(du -sb "$OUTPUT_DIR" | cut -f1)
}
EOF
            ;;
        yaml)
            cat > "$validation_report" << EOF
validation_timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)
export_valid: $(if [[ ${#issues[@]} -eq 0 ]]; then echo "true"; else echo "false"; fi)
issues_found: ${#issues[@]}
issues:
$(printf '  - "%s"\n' "${issues[@]}")
file_count: $(find "$OUTPUT_DIR" -type f | wc -l)
directory_count: $(find "$OUTPUT_DIR" -type d | wc -l)
total_size_bytes: $(du -sb "$OUTPUT_DIR" | cut -f1)
EOF
            ;;
        xml)
            cat > "$validation_report" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<validation-report>
    <validation-timestamp>$(date -u +%Y-%m-%dT%H:%M:%SZ)</validation-timestamp>
    <export-valid>$(if [[ ${#issues[@]} -eq 0 ]]; then echo "true"; else echo "false"; fi)</export-valid>
    <issues-found>${#issues[@]}</issues-found>
    <issues>
$(printf '        <issue>%s</issue>\n' "${issues[@]}")
    </issues>
    <file-count>$(find "$OUTPUT_DIR" -type f | wc -l)</file-count>
    <directory-count>$(find "$OUTPUT_DIR" -type d | wc -l)</directory-count>
    <total-size-bytes>$(du -sb "$OUTPUT_DIR" | cut -f1)</total-size-bytes>
</validation-report>
EOF
            ;;
    esac
    
    if [[ ${#issues[@]} -eq 0 ]]; then
        log "✓ Export validation passed: $validation_report"
    else
        log "⚠ Export validation found ${#issues[@]} issues: $validation_report"
        for issue in "${issues[@]}"; do
            log "  - $issue"
        done
    fi
}

# Create compressed archive
create_archive() {
    if [[ "$COMPRESS" != "true" ]]; then
        return
    fi
    
    log "Creating compressed archive..."
    
    local archive_name="mobius_lcm_export_$(date +%Y%m%d_%H%M%S).tar.gz"
    local archive_path="${PROJECT_ROOT}/$archive_name"
    
    cd "$(dirname "$OUTPUT_DIR")"
    tar -czf "$archive_path" "$(basename "$OUTPUT_DIR")"
    
    # Generate checksum
    cd "$(dirname "$archive_path")"
    sha256sum "$archive_name" > "${archive_name}.sha256"
    
    local archive_size
    archive_size=$(du -h "$archive_path" | cut -f1)
    
    log "✓ Archive created: $archive_path ($archive_size)"
    log "✓ Checksum created: ${archive_path}.sha256"
}

# Process component selection
process_components() {
    local components
    if [[ -n "$INCLUDE" ]]; then
        IFS=',' read -ra components <<< "$INCLUDE"
    else
        components=("config" "scripts" "docs" "workflows" "templates")
    fi
    
    export_metadata  # Always export metadata
    
    for component in "${components[@]}"; do
        component=$(echo "$component" | tr -d ' ')  # Remove whitespace
        case "$component" in
            config|configuration)
                export_configuration
                ;;
            scripts)
                export_scripts
                ;;
            docs|documentation)
                export_documentation
                ;;
            workflows)
                export_workflows
                ;;
            templates)
                export_templates
                ;;
            *)
                log "Warning: Unknown component '$component', skipping"
                ;;
        esac
    done
}

# Generate summary
generate_summary() {
    local file_count
    local dir_count
    local total_size
    
    file_count=$(find "$OUTPUT_DIR" -type f | wc -l)
    dir_count=$(find "$OUTPUT_DIR" -type d | wc -l)
    total_size=$(du -sh "$OUTPUT_DIR" | cut -f1)
    
    log ""
    log "=== LCM EXPORT COMPLETE ==="
    log "Format: $FORMAT"
    log "Output directory: $OUTPUT_DIR"
    log "Files exported: $file_count"
    log "Directories: $dir_count"
    log "Total size: $total_size"
    log "Log file: $LOG_FILE"
    
    if [[ "$COMPRESS" == "true" ]]; then
        log "Compressed archive available with SHA256 checksum"
    fi
    
    if [[ "$VALIDATE" == "true" ]]; then
        log "Validation report generated"
    fi
}

# Main execution
main() {
    log "Starting LCM export process..."
    
    process_components
    validate_export
    create_archive
    generate_summary
    
    log "LCM export process completed successfully"
}

# Run main function
main