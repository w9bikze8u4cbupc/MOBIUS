#!/bin/bash
# MOBIUS dhash production monitoring script with automatic rollback triggers
# Monitors health and metrics for 60 minutes after deployment
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
BASE_URL="http://localhost:5001"
MONITOR_DURATION_MINUTES=60
CHECK_INTERVAL_SECONDS=30
BACKUP_FILE=""
BASELINE_FILE=""
AUTO_ROLLBACK=false
VERBOSE=false

# Rollback trigger thresholds
MAX_FAILURE_RATE=0.10  # 10%
MAX_P95_TIME_MS=30000  # 30 seconds
MAX_LOW_CONFIDENCE_QUEUE=100
BASELINE_MULTIPLIER=3

usage() {
    echo "Usage: $0 [options]"
    echo "Options:"
    echo "  --backup FILE         Backup file for rollback (required for auto-rollback)"
    echo "  --baseline FILE       Baseline metrics file for comparison"
    echo "  --auto-rollback       Automatically rollback on trigger detection"
    echo "  --duration MINUTES    Monitoring duration in minutes [default: 60]"
    echo "  --interval SECONDS    Check interval in seconds [default: 30]"
    echo "  --base-url URL        Base URL for API calls [default: http://localhost:5001]"
    echo "  --verbose             Enable verbose output"
    echo "  --help                Show this help message"
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

verbose_log() {
    if [[ "$VERBOSE" == true ]]; then
        log "$*"
    fi
}

check_health() {
    local response
    local http_code
    
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/health" 2>/dev/null || echo -e "\n000")
    http_code=$(echo "$response" | tail -n1)
    
    if [[ "$http_code" == "200" ]]; then
        local status
        status=$(echo "$response" | head -n -1 | jq -r '.status' 2>/dev/null || echo "UNKNOWN")
        echo "$status"
        return 0
    else
        echo "HTTP_ERROR:$http_code"
        return 1
    fi
}

get_metrics() {
    local response
    local http_code
    
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/metrics/dhash" 2>/dev/null || echo -e "\n000")
    http_code=$(echo "$response" | tail -n1)
    
    if [[ "$http_code" == "200" ]]; then
        echo "$response" | head -n -1
        return 0
    else
        verbose_log "Failed to get metrics, HTTP code: $http_code"
        return 1
    fi
}

parse_metric() {
    local json="$1"
    local metric="$2"
    echo "$json" | jq -r ".metrics.${metric} // 0" 2>/dev/null || echo "0"
}

check_rollback_triggers() {
    local health_status="$1"
    local metrics_json="$2"
    local baseline_json="$3"
    
    local triggers=()
    
    # Health check trigger
    if [[ "$health_status" != "OK" ]]; then
        triggers+=("Health status: $health_status")
    fi
    
    # Parse current metrics
    local failure_rate
    local p95_time
    local low_conf_queue
    
    failure_rate=$(parse_metric "$metrics_json" "extraction_failures_rate")
    p95_time=$(parse_metric "$metrics_json" "p95_hash_time")
    low_conf_queue=$(parse_metric "$metrics_json" "low_confidence_queue_length")
    
    # Parse baseline if available
    local baseline_failure_rate=0
    local baseline_p95_time=1000  # Default baseline
    local baseline_low_conf_queue=10
    
    if [[ -n "$baseline_json" ]]; then
        baseline_failure_rate=$(parse_metric "$baseline_json" "extraction_failures_rate")
        baseline_p95_time=$(parse_metric "$baseline_json" "p95_hash_time")
        baseline_low_conf_queue=$(parse_metric "$baseline_json" "low_confidence_queue_length")
    fi
    
    # Check triggers
    if (( $(echo "$failure_rate > $MAX_FAILURE_RATE" | bc -l) )) || \
       (( $(echo "$failure_rate > $baseline_failure_rate * $BASELINE_MULTIPLIER" | bc -l) )); then
        triggers+=("High failure rate: ${failure_rate} (threshold: ${MAX_FAILURE_RATE}, baseline×3: $(echo "$baseline_failure_rate * $BASELINE_MULTIPLIER" | bc -l))")
    fi
    
    if (( $(echo "$p95_time > $MAX_P95_TIME_MS" | bc -l) )) || \
       (( $(echo "$p95_time > $baseline_p95_time * $BASELINE_MULTIPLIER" | bc -l) )); then
        triggers+=("High P95 time: ${p95_time}ms (threshold: ${MAX_P95_TIME_MS}ms, baseline×3: $(echo "$baseline_p95_time * $BASELINE_MULTIPLIER" | bc -l)ms)")
    fi
    
    if (( $(echo "$low_conf_queue > $MAX_LOW_CONFIDENCE_QUEUE" | bc -l) )) || \
       (( $(echo "$low_conf_queue > $baseline_low_conf_queue * $BASELINE_MULTIPLIER" | bc -l) )); then
        triggers+=("High low-confidence queue: ${low_conf_queue} (threshold: ${MAX_LOW_CONFIDENCE_QUEUE}, baseline×3: $(echo "$baseline_low_conf_queue * $BASELINE_MULTIPLIER" | bc -l))")
    fi
    
    # Return triggers
    if [[ ${#triggers[@]} -gt 0 ]]; then
        printf '%s\n' "${triggers[@]}"
        return 1
    else
        return 0
    fi
}

execute_rollback() {
    log "🚨 ROLLBACK TRIGGERED - Executing emergency rollback!"
    
    if [[ -z "$BACKUP_FILE" ]]; then
        log "❌ No backup file specified for rollback. Manual intervention required."
        return 1
    fi
    
    if [[ ! -f "$BACKUP_FILE" ]]; then
        log "❌ Backup file not found: $BACKUP_FILE"
        return 1
    fi
    
    log "Executing rollback with backup: $BACKUP_FILE"
    if "$SCRIPT_DIR/rollback_dhash.sh" --backup "$BACKUP_FILE" --force; then
        log "✅ Rollback completed successfully"
        return 0
    else
        log "❌ Rollback failed - manual intervention required"
        return 1
    fi
}

create_snapshot() {
    local timestamp="$1"
    local health_status="$2"
    local metrics_json="$3"
    
    local snapshot_file="${PROJECT_ROOT}/monitoring-snapshot-${timestamp}.json"
    
    cat > "$snapshot_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "health_status": "$health_status",
  "metrics": $metrics_json,
  "monitoring": {
    "check_interval_seconds": $CHECK_INTERVAL_SECONDS,
    "duration_minutes": $MONITOR_DURATION_MINUTES
  }
}
EOF
    
    verbose_log "Snapshot saved: $snapshot_file"
    echo "$snapshot_file"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --backup)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --baseline)
            BASELINE_FILE="$2"
            shift 2
            ;;
        --auto-rollback)
            AUTO_ROLLBACK=true
            shift
            ;;
        --duration)
            MONITOR_DURATION_MINUTES="$2"
            shift 2
            ;;
        --interval)
            CHECK_INTERVAL_SECONDS="$2"
            shift 2
            ;;
        --base-url)
            BASE_URL="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage
            exit 1
            ;;
    esac
done

# Load baseline if provided
BASELINE_JSON=""
if [[ -n "$BASELINE_FILE" && -f "$BASELINE_FILE" ]]; then
    BASELINE_JSON=$(cat "$BASELINE_FILE")
    log "Loaded baseline metrics from: $BASELINE_FILE"
fi

# Check dependencies
if ! command -v curl >/dev/null; then
    log "❌ curl is required but not installed"
    exit 1
fi

if ! command -v jq >/dev/null; then
    log "❌ jq is required but not installed"
    exit 1
fi

if ! command -v bc >/dev/null; then
    log "❌ bc is required but not installed"
    exit 1
fi

# Start monitoring
log "🔍 Starting MOBIUS dhash monitoring for $MONITOR_DURATION_MINUTES minutes"
log "Base URL: $BASE_URL"
log "Check interval: ${CHECK_INTERVAL_SECONDS}s"
log "Auto-rollback: $AUTO_ROLLBACK"
if [[ -n "$BACKUP_FILE" ]]; then
    log "Rollback backup: $BACKUP_FILE"
fi

START_TIME=$(date +%s)
END_TIME=$((START_TIME + MONITOR_DURATION_MINUTES * 60))
CHECK_COUNT=0
FAILURE_COUNT=0
CONSECUTIVE_HEALTH_FAILURES=0

# Create monitoring report file
REPORT_FILE="${PROJECT_ROOT}/monitoring-report-$(date -u +%Y%m%dT%H%M%SZ).log"
log "Monitoring report: $REPORT_FILE"

# Monitoring loop
while [[ $(date +%s) -lt $END_TIME ]]; do
    CHECK_COUNT=$((CHECK_COUNT + 1))
    CURRENT_TIME=$(date +%s)
    ELAPSED_MINUTES=$(( (CURRENT_TIME - START_TIME) / 60 ))
    REMAINING_MINUTES=$(( MONITOR_DURATION_MINUTES - ELAPSED_MINUTES ))
    
    verbose_log "Check $CHECK_COUNT - Elapsed: ${ELAPSED_MINUTES}m, Remaining: ${REMAINING_MINUTES}m"
    
    # Check health
    HEALTH_STATUS=$(check_health)
    HEALTH_OK=$?
    
    # Get metrics
    METRICS_JSON=""
    if get_metrics >/dev/null 2>&1; then
        METRICS_JSON=$(get_metrics)
    else
        verbose_log "Failed to retrieve metrics"
        FAILURE_COUNT=$((FAILURE_COUNT + 1))
    fi
    
    # Track consecutive health failures
    if [[ $HEALTH_OK -ne 0 ]] || [[ "$HEALTH_STATUS" != "OK" ]]; then
        CONSECUTIVE_HEALTH_FAILURES=$((CONSECUTIVE_HEALTH_FAILURES + 1))
        log "⚠️  Health check failed: $HEALTH_STATUS (consecutive failures: $CONSECUTIVE_HEALTH_FAILURES)"
    else
        CONSECUTIVE_HEALTH_FAILURES=0
        verbose_log "✅ Health check passed: $HEALTH_STATUS"
    fi
    
    # Check rollback triggers
    TRIGGER_MESSAGES=""
    if [[ -n "$METRICS_JSON" ]]; then
        if ! TRIGGER_MESSAGES=$(check_rollback_triggers "$HEALTH_STATUS" "$METRICS_JSON" "$BASELINE_JSON"); then
            log "🚨 ROLLBACK TRIGGERS DETECTED:"
            echo "$TRIGGER_MESSAGES" | while IFS= read -r trigger; do
                log "  - $trigger"
            done
            
            # Execute rollback if auto-rollback enabled
            if [[ "$AUTO_ROLLBACK" == true ]]; then
                if execute_rollback; then
                    log "Monitoring terminated due to successful rollback"
                    exit 0
                else
                    log "Rollback failed, continuing monitoring"
                fi
            else
                log "Auto-rollback disabled - manual intervention required"
                log "To rollback manually, run:"
                log "  $SCRIPT_DIR/rollback_dhash.sh --backup $BACKUP_FILE --force"
            fi
        fi
    fi
    
    # Check for critical consecutive health failures
    if [[ $CONSECUTIVE_HEALTH_FAILURES -ge 2 ]]; then
        log "🚨 CRITICAL: $CONSECUTIVE_HEALTH_FAILURES consecutive health failures detected"
        if [[ "$AUTO_ROLLBACK" == true ]]; then
            if execute_rollback; then
                log "Monitoring terminated due to successful rollback"
                exit 0
            fi
        fi
    fi
    
    # Create snapshots at key intervals
    if [[ $ELAPSED_MINUTES -eq 5 ]] || [[ $ELAPSED_MINUTES -eq 15 ]] || \
       [[ $ELAPSED_MINUTES -eq 30 ]] || [[ $ELAPSED_MINUTES -eq 60 ]]; then
        SNAPSHOT_FILE=$(create_snapshot "T+${ELAPSED_MINUTES}m" "$HEALTH_STATUS" "$METRICS_JSON")
        log "📊 T+${ELAPSED_MINUTES}m snapshot: $SNAPSHOT_FILE"
        
        if [[ -n "$METRICS_JSON" ]]; then
            local failure_rate p95_time low_conf_queue
            failure_rate=$(parse_metric "$METRICS_JSON" "extraction_failures_rate")
            p95_time=$(parse_metric "$METRICS_JSON" "p95_hash_time")
            low_conf_queue=$(parse_metric "$METRICS_JSON" "low_confidence_queue_length")
            
            log "  Metrics: failure_rate=${failure_rate}, p95_time=${p95_time}ms, low_conf_queue=${low_conf_queue}"
        fi
    fi
    
    # Write to report
    cat >> "$REPORT_FILE" << EOF
[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Check $CHECK_COUNT (T+${ELAPSED_MINUTES}m)
Health: $HEALTH_STATUS
Consecutive failures: $CONSECUTIVE_HEALTH_FAILURES
Metrics: $METRICS_JSON
Triggers: $TRIGGER_MESSAGES

EOF
    
    # Wait for next check (unless this is the last check)
    if [[ $(date +%s) -lt $((END_TIME - CHECK_INTERVAL_SECONDS)) ]]; then
        sleep "$CHECK_INTERVAL_SECONDS"
    else
        break
    fi
done

# Final report
FINAL_TIME=$(date +%s)
TOTAL_DURATION=$((FINAL_TIME - START_TIME))
TOTAL_MINUTES=$((TOTAL_DURATION / 60))

log "✅ Monitoring completed successfully!"
log "Duration: ${TOTAL_MINUTES} minutes (${CHECK_COUNT} checks)"
log "Failures: $FAILURE_COUNT"
log "Max consecutive health failures: $CONSECUTIVE_HEALTH_FAILURES"
log "Final report: $REPORT_FILE"

if [[ $FAILURE_COUNT -gt 0 ]] || [[ $CONSECUTIVE_HEALTH_FAILURES -gt 0 ]]; then
    log "⚠️  Issues detected during monitoring - review the report"
    exit 1
else
    log "🎉 No issues detected during monitoring window"
    exit 0
fi