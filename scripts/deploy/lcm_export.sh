#!/bin/bash
set -euo pipefail

# MOBIUS Deployment - Lifecycle Management Export
# Exports deployment lifecycle data for compliance and auditing

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --env ENV          Environment (staging|production) [required]"
    echo "  --output DIR       Output directory [default: ./lcm_exports]"
    echo "  --format FORMAT    Export format (json|csv|xml) [default: json]"
    echo "  --days DAYS        Export data from last N days [default: 30]"
    echo "  --help             Show this help message"
    echo ""
    echo "Exported data includes:"
    echo "  - Deployment history"
    echo "  - Backup records"
    echo "  - Monitoring logs"
    echo "  - Test results"
    echo "  - System configurations"
    exit 1
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

# Parse arguments
ENV=""
OUTPUT_DIR="${PROJECT_ROOT}/lcm_exports"
FORMAT="json"
DAYS=30

while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            shift 2
            ;;
        --output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --format)
            FORMAT="$2"
            shift 2
            ;;
        --days)
            DAYS="$2"
            shift 2
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

if [[ -z "$ENV" ]]; then
    echo "Error: --env is required"
    usage
fi

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
    echo "Error: --env must be 'staging' or 'production'"
    exit 1
fi

if [[ "$FORMAT" != "json" && "$FORMAT" != "csv" && "$FORMAT" != "xml" ]]; then
    echo "Error: --format must be 'json', 'csv', or 'xml'"
    exit 1
fi

# Create output directory
EXPORT_TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
EXPORT_DIR="${OUTPUT_DIR}/${ENV}_${EXPORT_TIMESTAMP}"
mkdir -p "$EXPORT_DIR"

log "Starting LCM export for environment: $ENV"
log "Export directory: $EXPORT_DIR"
log "Format: $FORMAT"
log "Days: $DAYS"

# Function to export data in specified format
export_data() {
    local data_name="$1"
    local data_file="$2"
    
    case $FORMAT in
        json)
            cp "$data_file" "${EXPORT_DIR}/${data_name}.json"
            ;;
        csv)
            # Convert JSON to CSV if possible
            if command -v jq >/dev/null 2>&1; then
                jq -r '(.[0] | keys_unsorted) as $keys | $keys, map([.[ $keys[] ]])[] | @csv' "$data_file" > "${EXPORT_DIR}/${data_name}.csv" 2>/dev/null || {
                    # Fallback: just copy as JSON
                    cp "$data_file" "${EXPORT_DIR}/${data_name}.json"
                }
            else
                cp "$data_file" "${EXPORT_DIR}/${data_name}.json"
            fi
            ;;
        xml)
            # Basic JSON to XML conversion (simplified)
            cat > "${EXPORT_DIR}/${data_name}.xml" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<export>
  <data_name>$data_name</data_name>
  <timestamp>$(date --iso-8601)</timestamp>
  <content>
    <!-- JSON data converted to XML would go here -->
    <!-- For simplicity, including JSON content as CDATA -->
    <![CDATA[
$(cat "$data_file")
    ]]>
  </content>
</export>
EOF
            ;;
    esac
}

# Export deployment history
log "📊 Exporting deployment history"

export_deployment_history() {
    local deployment_history="${EXPORT_DIR}/temp_deployment_history.json"
    
    cat > "$deployment_history" << EOF
{
  "environment": "$ENV",
  "export_timestamp": "$(date --iso-8601)",
  "deployments": [
EOF
    
    # Look for deployment logs in various locations
    local deployment_logs=()
    
    # Check for orchestration logs
    if [[ -d "${PROJECT_ROOT}/premerge_artifacts" ]]; then
        mapfile -t deployment_logs < <(find "${PROJECT_ROOT}/premerge_artifacts" -name "orchestration.log" -mtime -"$DAYS" 2>/dev/null || true)
    fi
    
    # Check for backup logs (backups indicate deployments)
    if [[ -d "${PROJECT_ROOT}/backups" ]]; then
        local backup_files
        mapfile -t backup_files < <(find "${PROJECT_ROOT}/backups" -name "dhash_${ENV}_*.zip" -mtime -"$DAYS" 2>/dev/null || true)
        
        local first=true
        for backup_file in "${backup_files[@]}"; do
            if [[ -f "$backup_file" ]]; then
                local backup_name
                backup_name=$(basename "$backup_file" .zip)
                local backup_timestamp
                backup_timestamp=${backup_name##*_}
                
                if [[ "$first" == "true" ]]; then
                    first=false
                else
                    echo "," >> "$deployment_history"
                fi
                
                cat >> "$deployment_history" << EOF
    {
      "type": "backup_created",
      "timestamp": "$backup_timestamp",
      "backup_file": "$backup_file",
      "sha256_file": "${backup_file}.sha256",
      "verified": $(if [[ -f "${backup_file}.sha256" ]]; then echo "true"; else echo "false"; fi)
    }
EOF
            fi
        done
    fi
    
    cat >> "$deployment_history" << EOF
  ]
}
EOF
    
    export_data "deployment_history" "$deployment_history"
    rm -f "$deployment_history"
}

export_deployment_history

# Export backup records
log "💾 Exporting backup records"

export_backup_records() {
    local backup_records="${EXPORT_DIR}/temp_backup_records.json"
    
    cat > "$backup_records" << EOF
{
  "environment": "$ENV",
  "export_timestamp": "$(date --iso-8601)",
  "backup_retention_days": 30,
  "backups": [
EOF
    
    if [[ -d "${PROJECT_ROOT}/backups" ]]; then
        local backup_files
        mapfile -t backup_files < <(find "${PROJECT_ROOT}/backups" -name "dhash_${ENV}_*.zip" -mtime -"$DAYS" 2>/dev/null || true)
        
        local first=true
        for backup_file in "${backup_files[@]}"; do
            if [[ -f "$backup_file" ]]; then
                if [[ "$first" == "true" ]]; then
                    first=false
                else
                    echo "," >> "$backup_records"
                fi
                
                local file_size
                file_size=$(stat -c%s "$backup_file" 2>/dev/null || echo "0")
                local sha256_hash=""
                if [[ -f "${backup_file}.sha256" ]]; then
                    sha256_hash=$(cut -d' ' -f1 "${backup_file}.sha256" 2>/dev/null || echo "")
                fi
                
                cat >> "$backup_records" << EOF
    {
      "filename": "$(basename "$backup_file")",
      "full_path": "$backup_file",
      "size_bytes": $file_size,
      "created": "$(date -r "$backup_file" --iso-8601 2>/dev/null || echo 'unknown')",
      "sha256": "$sha256_hash",
      "verified": $(if [[ -n "$sha256_hash" ]]; then echo "true"; else echo "false"; fi)
    }
EOF
            fi
        done
    fi
    
    cat >> "$backup_records" << EOF
  ]
}
EOF
    
    export_data "backup_records" "$backup_records"
    rm -f "$backup_records"
}

export_backup_records

# Export monitoring data
log "📈 Exporting monitoring data"

export_monitoring_data() {
    local monitoring_data="${EXPORT_DIR}/temp_monitoring_data.json"
    
    cat > "$monitoring_data" << EOF
{
  "environment": "$ENV",
  "export_timestamp": "$(date --iso-8601)",
  "monitoring_logs": [
EOF
    
    if [[ -d "${PROJECT_ROOT}/monitor_logs" ]]; then
        local monitor_files
        mapfile -t monitor_files < <(find "${PROJECT_ROOT}/monitor_logs" -name "monitor_${ENV}_*.log" -mtime -"$DAYS" 2>/dev/null || true)
        
        local first=true
        for monitor_file in "${monitor_files[@]}"; do
            if [[ -f "$monitor_file" ]]; then
                if [[ "$first" == "true" ]]; then
                    first=false
                else
                    echo "," >> "$monitoring_data"
                fi
                
                local line_count
                line_count=$(wc -l < "$monitor_file" 2>/dev/null || echo "0")
                
                cat >> "$monitoring_data" << EOF
    {
      "filename": "$(basename "$monitor_file")",
      "full_path": "$monitor_file",
      "line_count": $line_count,
      "created": "$(date -r "$monitor_file" --iso-8601 2>/dev/null || echo 'unknown')"
    }
EOF
            fi
        done
    fi
    
    cat >> "$monitoring_data" << EOF
  ]
}
EOF
    
    export_data "monitoring_data" "$monitoring_data"
    rm -f "$monitoring_data"
}

export_monitoring_data

# Export test results
log "🧪 Exporting test results"

export_test_results() {
    local test_results="${EXPORT_DIR}/temp_test_results.json"
    
    cat > "$test_results" << EOF
{
  "environment": "$ENV",
  "export_timestamp": "$(date --iso-8601)",
  "test_executions": [
EOF
    
    # Look for test logs
    local test_files=()
    
    # Smoke test logs
    mapfile -t smoke_test_files < <(find "$PROJECT_ROOT" -name "postdeploy-smoketests*.log" -mtime -"$DAYS" 2>/dev/null || true)
    test_files+=("${smoke_test_files[@]}")
    
    # General test logs
    mapfile -t general_test_files < <(find "$PROJECT_ROOT" -name "test_logging*.log" -mtime -"$DAYS" 2>/dev/null || true)
    test_files+=("${general_test_files[@]}")
    
    local first=true
    for test_file in "${test_files[@]}"; do
        if [[ -f "$test_file" ]]; then
            if [[ "$first" == "true" ]]; then
                first=false
            else
                echo "," >> "$test_results"
            fi
            
            local test_type="unknown"
            if [[ "$(basename "$test_file")" == *"smoketests"* ]]; then
                test_type="smoke_tests"
            elif [[ "$(basename "$test_file")" == *"test_logging"* ]]; then
                test_type="integration_tests"
            fi
            
            cat >> "$test_results" << EOF
    {
      "filename": "$(basename "$test_file")",
      "full_path": "$test_file",
      "test_type": "$test_type",
      "executed": "$(date -r "$test_file" --iso-8601 2>/dev/null || echo 'unknown')"
    }
EOF
        fi
    done
    
    cat >> "$test_results" << EOF
  ]
}
EOF
    
    export_data "test_results" "$test_results"
    rm -f "$test_results"
}

export_test_results

# Export system configuration
log "⚙️  Exporting system configuration"

export_system_config() {
    local system_config="${EXPORT_DIR}/temp_system_config.json"
    
    cat > "$system_config" << EOF
{
  "environment": "$ENV",
  "export_timestamp": "$(date --iso-8601)",
  "git_information": {
    "current_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "current_branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')",
    "remote_url": "$(git remote get-url origin 2>/dev/null || echo 'unknown')",
    "uncommitted_changes": $(git status --porcelain | wc -l 2>/dev/null || echo 0)
  },
  "system_information": {
    "hostname": "$(hostname)",
    "operating_system": "$(uname -s)",
    "architecture": "$(uname -m)",
    "node_version": "$(node --version 2>/dev/null || echo 'unknown')",
    "npm_version": "$(npm --version 2>/dev/null || echo 'unknown')"
  },
  "deployment_scripts": {
    "backup": "$(ls -la "${SCRIPT_DIR}/backup.sh" 2>/dev/null || echo 'not found')",
    "rollback": "$(ls -la "${SCRIPT_DIR}/rollback_dhash.sh" 2>/dev/null || echo 'not found')",
    "monitor": "$(ls -la "${SCRIPT_DIR}/monitor.sh" 2>/dev/null || echo 'not found')",
    "smoke_tests": "$(ls -la "${SCRIPT_DIR}/smoke_tests.sh" 2>/dev/null || echo 'not found')"
  }
}
EOF
    
    export_data "system_config" "$system_config"
    rm -f "$system_config"
}

export_system_config

# Create export manifest
log "📋 Creating export manifest"

cat > "${EXPORT_DIR}/manifest.${FORMAT}" << EOF
{
  "lcm_export": {
    "environment": "$ENV",
    "export_timestamp": "$(date --iso-8601)",
    "export_format": "$FORMAT",
    "days_included": $DAYS,
    "export_directory": "$EXPORT_DIR",
    "exported_data_types": [
      "deployment_history",
      "backup_records",
      "monitoring_data", 
      "test_results",
      "system_config"
    ],
    "retention_policy": "Exports should be retained for compliance requirements",
    "export_version": "1.0"
  }
}
EOF

# Create compressed archive
log "📦 Creating compressed archive"

cd "$OUTPUT_DIR"
ARCHIVE_NAME="lcm_export_${ENV}_${EXPORT_TIMESTAMP}.tar.gz"
tar -czf "$ARCHIVE_NAME" "${ENV}_${EXPORT_TIMESTAMP}/"

log "✅ LCM export completed successfully"
log "📁 Export directory: $EXPORT_DIR"
log "📦 Compressed archive: ${OUTPUT_DIR}/${ARCHIVE_NAME}"
log "📊 Export includes data from the last $DAYS days"

# Generate summary
cat > "${EXPORT_DIR}/export_summary.txt" << EOF
MOBIUS LCM Export Summary
========================

Environment: $ENV
Export Date: $(date --iso-8601)
Export Format: $FORMAT
Days Included: $DAYS
Export Directory: $EXPORT_DIR
Compressed Archive: ${OUTPUT_DIR}/${ARCHIVE_NAME}

Data Types Exported:
- Deployment History
- Backup Records  
- Monitoring Data
- Test Results
- System Configuration

This export contains lifecycle management data for compliance,
auditing, and operational analysis purposes.

For questions about this export, contact the DevOps team.
EOF

echo "📄 Export summary: ${EXPORT_DIR}/export_summary.txt"

exit 0