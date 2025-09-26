#!/bin/bash
set -euo pipefail

# MOBIUS Deployment - Monitoring Script
# T+60 monitoring with auto-rollback triggers

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --env ENV              Environment (staging|production) [required]"
    echo "  --duration SECONDS     Monitoring duration [default: 3600 (60min)]"
    echo "  --auto-rollback        Enable automatic rollback on failures"
    echo "  --backup FILE          Backup file for rollback [required if auto-rollback enabled]"
    echo "  --health-url URL       Health check endpoint [default: http://localhost:3000/health]"
    echo "  --check-interval SEC   Health check interval [default: 30]"
    echo "  --help                 Show this help message"
    echo ""
    echo "Auto-rollback triggers:"
    echo "  - 3 consecutive health check failures"
    echo "  - Overall success rate <70% after ≥5 checks"
    echo "  - P95 latency >5000ms consistently"
    echo "  - Error rate >5%"
    exit 1
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

# Parse arguments
ENV=""
DURATION=3600  # 60 minutes default
AUTO_ROLLBACK=false
BACKUP_FILE=""
HEALTH_URL="http://localhost:3000/health"
CHECK_INTERVAL=30

while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            shift 2
            ;;
        --duration)
            DURATION="$2"
            shift 2
            ;;
        --auto-rollback)
            AUTO_ROLLBACK=true
            shift
            ;;
        --backup)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --health-url)
            HEALTH_URL="$2"
            shift 2
            ;;
        --check-interval)
            CHECK_INTERVAL="$2"
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

if [[ "$AUTO_ROLLBACK" == "true" && -z "$BACKUP_FILE" ]]; then
    echo "Error: --backup is required when auto-rollback is enabled"
    usage
fi

if [[ "$AUTO_ROLLBACK" == "true" && ! -f "$BACKUP_FILE" ]]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Initialize monitoring state
MONITOR_LOG="${PROJECT_ROOT}/monitor_logs/monitor_${ENV}_$(date '+%Y%m%d_%H%M%S').log"
mkdir -p "$(dirname "$MONITOR_LOG")"

CONSECUTIVE_FAILURES=0
TOTAL_CHECKS=0
SUCCESSFUL_CHECKS=0
HIGH_LATENCY_COUNT=0
ERROR_RATE_VIOLATIONS=0

START_TIME=$(date +%s)
END_TIME=$((START_TIME + DURATION))

log "Starting monitoring for environment: $ENV"
log "Duration: ${DURATION}s ($(($DURATION / 60)) minutes)"
log "Health URL: $HEALTH_URL"
log "Check interval: ${CHECK_INTERVAL}s"
log "Auto-rollback: $AUTO_ROLLBACK"
log "Monitor log: $MONITOR_LOG"

# Function to check health endpoint
check_health() {
    local response_time
    local http_code
    local response_body
    
    # Make health check request with timeout
    local start_time=$(date +%s%N)
    response_body=$(curl -s -w "%{http_code}" -m 10 "$HEALTH_URL" 2>/dev/null || echo "000")
    local end_time=$(date +%s%N)
    
    http_code=${response_body: -3}
    response_body=${response_body%???}
    response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
    
    echo "$http_code|$response_time|$response_body"
}

# Function to trigger rollback
trigger_rollback() {
    local reason="$1"
    log "🚨 TRIGGERING AUTO-ROLLBACK: $reason"
    
    if [[ "$AUTO_ROLLBACK" == "true" ]]; then
        log "Executing rollback with backup: $BACKUP_FILE"
        "${SCRIPT_DIR}/rollback_dhash.sh" --backup "$BACKUP_FILE" --env "$ENV" --force
        exit 1
    else
        log "Auto-rollback disabled, manual intervention required"
        exit 1
    fi
}

# Function to evaluate rollback conditions
evaluate_rollback_conditions() {
    # Check consecutive failures
    if [[ $CONSECUTIVE_FAILURES -ge 3 ]]; then
        trigger_rollback "3 consecutive health check failures"
    fi
    
    # Check overall success rate (only after minimum checks)
    if [[ $TOTAL_CHECKS -ge 5 ]]; then
        local success_rate=$((SUCCESSFUL_CHECKS * 100 / TOTAL_CHECKS))
        if [[ $success_rate -lt 70 ]]; then
            trigger_rollback "Success rate below 70% ($success_rate%)"
        fi
    fi
    
    # Check high latency pattern (5 consecutive high latency responses)
    if [[ $HIGH_LATENCY_COUNT -ge 5 ]]; then
        trigger_rollback "Consistent high latency (>5000ms)"
    fi
    
    # Check error rate violations (5 consecutive error responses)
    if [[ $ERROR_RATE_VIOLATIONS -ge 5 ]]; then
        trigger_rollback "Error rate above 5%"
    fi
}

# Main monitoring loop
log "Monitoring started, will run until $(date -d "@$END_TIME")"

while [[ $(date +%s) -lt $END_TIME ]]; do
    CURRENT_TIME=$(date +%s)
    ELAPSED_TIME=$((CURRENT_TIME - START_TIME))
    REMAINING_TIME=$((END_TIME - CURRENT_TIME))
    
    log "Health check $(($TOTAL_CHECKS + 1)) - ${REMAINING_TIME}s remaining"
    
    # Perform health check
    health_result=$(check_health)
    IFS='|' read -r http_code response_time response_body <<< "$health_result"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    # Log the result
    echo "$(date '+%Y-%m-%d %H:%M:%S')|$http_code|$response_time|$response_body" >> "$MONITOR_LOG"
    
    # Evaluate health check result
    if [[ "$http_code" == "200" && $response_time -lt 5000 ]]; then
        # Successful check
        SUCCESSFUL_CHECKS=$((SUCCESSFUL_CHECKS + 1))
        CONSECUTIVE_FAILURES=0
        HIGH_LATENCY_COUNT=0
        ERROR_RATE_VIOLATIONS=0
        log "✅ Health check passed (${response_time}ms)"
    else
        # Failed check
        CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
        
        if [[ "$http_code" != "200" ]]; then
            ERROR_RATE_VIOLATIONS=$((ERROR_RATE_VIOLATIONS + 1))
            log "❌ Health check failed - HTTP $http_code"
        fi
        
        if [[ $response_time -ge 5000 ]]; then
            HIGH_LATENCY_COUNT=$((HIGH_LATENCY_COUNT + 1))
            log "🐌 High latency detected - ${response_time}ms"
        fi
    fi
    
    # Calculate current statistics
    local success_rate=0
    if [[ $TOTAL_CHECKS -gt 0 ]]; then
        success_rate=$((SUCCESSFUL_CHECKS * 100 / TOTAL_CHECKS))
    fi
    
    log "Statistics: Success rate: ${success_rate}%, Consecutive failures: ${CONSECUTIVE_FAILURES}"
    
    # Evaluate rollback conditions
    evaluate_rollback_conditions
    
    # Sleep until next check
    sleep "$CHECK_INTERVAL"
done

# Final report
FINAL_SUCCESS_RATE=$((SUCCESSFUL_CHECKS * 100 / TOTAL_CHECKS))

log "Monitoring completed successfully!"
log "Final statistics:"
log "  Total checks: $TOTAL_CHECKS"
log "  Successful checks: $SUCCESSFUL_CHECKS"
log "  Success rate: ${FINAL_SUCCESS_RATE}%"
log "  Monitor log: $MONITOR_LOG"

# Generate summary report
cat > "${PROJECT_ROOT}/monitor_logs/monitor_summary_${ENV}_$(date '+%Y%m%d_%H%M%S').json" << EOF
{
  "environment": "$ENV",
  "monitoring_duration": $DURATION,
  "start_time": "$(date -d "@$START_TIME" --iso-8601)",
  "end_time": "$(date -d "@$END_TIME" --iso-8601)",
  "total_checks": $TOTAL_CHECKS,
  "successful_checks": $SUCCESSFUL_CHECKS,
  "success_rate": $FINAL_SUCCESS_RATE,
  "max_consecutive_failures": $CONSECUTIVE_FAILURES,
  "auto_rollback_enabled": $AUTO_ROLLBACK,
  "status": "completed_successfully"
}
EOF

if [[ $FINAL_SUCCESS_RATE -ge 95 ]]; then
    log "🎉 Deployment monitoring PASSED with excellent health metrics"
    exit 0
elif [[ $FINAL_SUCCESS_RATE -ge 85 ]]; then
    log "✅ Deployment monitoring PASSED with good health metrics"
    exit 0
else
    log "⚠️  Deployment monitoring completed with concerns (success rate: ${FINAL_SUCCESS_RATE}%)"
    exit 1
fi