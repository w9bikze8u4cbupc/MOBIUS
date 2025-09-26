#!/bin/bash
# MOBIUS Deployment Framework - Monitor Script
# Monitors system health with auto-rollback capabilities after deployment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="${REPO_ROOT}/monitor_logs"
mkdir -p "$LOG_DIR"

# Default configuration
ENV="${ENV:-staging}"
MONITOR_DURATION="${MONITOR_DURATION:-3600}"  # 60 minutes default
API_BASE_URL="${API_BASE_URL:-http://localhost:5001}"
AUTO_ROLLBACK="${AUTO_ROLLBACK:-false}"
CHECK_INTERVAL=30  # Check every 30 seconds
HEALTH_CHECK_TIMEOUT=10

# Auto-rollback thresholds (conservative defaults)
CONSECUTIVE_FAILURE_THRESHOLD=3
SUCCESS_RATE_THRESHOLD=0.70
MIN_CHECKS_FOR_RATE=5
MAX_LATENCY_THRESHOLD=5000  # 5000ms
ERROR_RATE_THRESHOLD=0.05   # 5%

# State tracking
CONSECUTIVE_FAILURES=0
TOTAL_CHECKS=0
TOTAL_SUCCESSES=0
TOTAL_ERRORS=0
LATENCY_VIOLATIONS=0
START_TIME=$(date +%s)

# Help message
show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Monitor MOBIUS deployment with optional auto-rollback

OPTIONS:
    --env ENV           Target environment (staging|production) [default: staging]
    --api-url URL       API base URL [default: ${API_BASE_URL}]
    --duration SEC      Monitor duration in seconds [default: ${MONITOR_DURATION}]
    --auto-rollback     Enable automatic rollback on failures [default: false]
    --check-interval SEC Check interval in seconds [default: ${CHECK_INTERVAL}]
    --help             Show this help message

Auto-rollback thresholds:
    - 3 consecutive health check failures
    - Success rate < 70% after ≥5 checks  
    - p95 latency > 5000ms consistently
    - Error rate > 5%

EXAMPLES:
    $0 --env production --duration 7200 --auto-rollback
    $0 --env staging --api-url http://localhost:5001

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            shift 2
            ;;
        --api-url)
            API_BASE_URL="$2"
            shift 2
            ;;
        --duration)
            MONITOR_DURATION="$2"
            shift 2
            ;;
        --auto-rollback)
            AUTO_ROLLBACK="true"
            shift
            ;;
        --check-interval)
            CHECK_INTERVAL="$2"
            shift 2
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

LOG_FILE="$LOG_DIR/monitor_$(date -u +%Y%m%d_%H%M%S).log"
METRICS_FILE="$LOG_DIR/metrics_$(date -u +%Y%m%d_%H%M%S).json"

# Initialize logging
exec > >(tee -a "$LOG_FILE")
exec 2>&1

echo "========================================"
echo "MOBIUS Deployment Monitor"
echo "========================================"
echo "Start Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "Environment: $ENV"
echo "API Base URL: $API_BASE_URL"
echo "Monitor Duration: ${MONITOR_DURATION}s ($(($MONITOR_DURATION/60)) minutes)"
echo "Check Interval: ${CHECK_INTERVAL}s"
echo "Auto Rollback: $AUTO_ROLLBACK"
echo "Log File: $LOG_FILE"
echo "Metrics File: $METRICS_FILE"
echo ""
echo "Auto-rollback thresholds:"
echo "  - Consecutive failures: $CONSECUTIVE_FAILURE_THRESHOLD"
echo "  - Success rate threshold: $(awk "BEGIN {printf \"%.0f%%\", $SUCCESS_RATE_THRESHOLD*100}")"
echo "  - Max latency: ${MAX_LATENCY_THRESHOLD}ms"
echo "  - Max error rate: $(awk "BEGIN {printf \"%.0f%%\", $ERROR_RATE_THRESHOLD*100}")"
echo "========================================"

# Signal handlers for graceful shutdown
cleanup() {
    echo ""
    echo "Monitor interrupted. Generating final report..."
    generate_final_report
    exit 130
}
trap cleanup SIGINT SIGTERM

# Health check function
perform_health_check() {
    local start_time=$(date +%s%N)
    local status_code=""
    local response_body=""
    local latency_ms=0
    
    ((TOTAL_CHECKS++))
    
    # Perform HTTP health check
    local response
    if response=$(curl -s -w "%{http_code}" --connect-timeout "$HEALTH_CHECK_TIMEOUT" --max-time "$HEALTH_CHECK_TIMEOUT" "$API_BASE_URL/health" 2>/dev/null); then
        local end_time=$(date +%s%N)
        latency_ms=$(( (end_time - start_time) / 1000000 ))
        
        status_code="${response: -3}"
        response_body="${response%???}"
        
        if [[ "$status_code" == "200" ]]; then
            ((TOTAL_SUCCESSES++))
            CONSECUTIVE_FAILURES=0
            
            # Check latency threshold
            if [[ $latency_ms -gt $MAX_LATENCY_THRESHOLD ]]; then
                ((LATENCY_VIOLATIONS++))
                echo "⚠ High latency detected: ${latency_ms}ms (threshold: ${MAX_LATENCY_THRESHOLD}ms)"
            fi
            
            echo "✓ Health check passed (${latency_ms}ms)"
        else
            ((TOTAL_ERRORS++))
            ((CONSECUTIVE_FAILURES++))
            echo "✗ Health check failed: HTTP $status_code (${latency_ms}ms)"
        fi
    else
        ((TOTAL_ERRORS++))
        ((CONSECUTIVE_FAILURES++))
        echo "✗ Health check failed: Connection timeout/error"
    fi
    
    # Log metrics
    local current_time=$(date -u '+%Y-%m-%d %H:%M:%S UTC')
    local success_rate=0
    if [[ $TOTAL_CHECKS -gt 0 ]]; then
        success_rate=$(awk "BEGIN {printf \"%.3f\", $TOTAL_SUCCESSES/$TOTAL_CHECKS}")
    fi
    local error_rate=0
    if [[ $TOTAL_CHECKS -gt 0 ]]; then
        error_rate=$(awk "BEGIN {printf \"%.3f\", $TOTAL_ERRORS/$TOTAL_CHECKS}")
    fi
    
    # Append to metrics file
    echo "{\"timestamp\":\"$current_time\",\"status_code\":\"$status_code\",\"latency_ms\":$latency_ms,\"success_rate\":$success_rate,\"error_rate\":$error_rate,\"consecutive_failures\":$CONSECUTIVE_FAILURES}" >> "$METRICS_FILE"
    
    # Return check result
    if [[ "$status_code" == "200" ]]; then
        return 0
    else
        return 1
    fi
}

# Auto-rollback trigger function
check_auto_rollback_conditions() {
    if [[ "$AUTO_ROLLBACK" != "true" ]]; then
        return 1
    fi
    
    # Check consecutive failures
    if [[ $CONSECUTIVE_FAILURES -ge $CONSECUTIVE_FAILURE_THRESHOLD ]]; then
        echo "🚨 TRIGGER: $CONSECUTIVE_FAILURES consecutive failures (threshold: $CONSECUTIVE_FAILURE_THRESHOLD)"
        return 0
    fi
    
    # Check overall success rate (only after minimum checks)
    if [[ $TOTAL_CHECKS -ge $MIN_CHECKS_FOR_RATE ]]; then
        local success_rate=$(awk "BEGIN {printf \"%.3f\", $TOTAL_SUCCESSES/$TOTAL_CHECKS}")
        if (( $(echo "$success_rate < $SUCCESS_RATE_THRESHOLD" | bc -l) )); then
            echo "🚨 TRIGGER: Success rate ${success_rate} below threshold ${SUCCESS_RATE_THRESHOLD}"
            return 0
        fi
    fi
    
    # Check error rate
    if [[ $TOTAL_CHECKS -ge $MIN_CHECKS_FOR_RATE ]]; then
        local error_rate=$(awk "BEGIN {printf \"%.3f\", $TOTAL_ERRORS/$TOTAL_CHECKS}")
        if (( $(echo "$error_rate > $ERROR_RATE_THRESHOLD" | bc -l) )); then
            echo "🚨 TRIGGER: Error rate ${error_rate} above threshold ${ERROR_RATE_THRESHOLD}"
            return 0
        fi
    fi
    
    # Check persistent high latency (simplified check)
    if [[ $LATENCY_VIOLATIONS -gt 5 ]] && [[ $TOTAL_CHECKS -gt 10 ]]; then
        local latency_violation_rate=$(awk "BEGIN {printf \"%.3f\", $LATENCY_VIOLATIONS/$TOTAL_CHECKS}")
        if (( $(echo "$latency_violation_rate > 0.5" | bc -l) )); then
            echo "🚨 TRIGGER: Persistent high latency violations (${latency_violation_rate} rate)"
            return 0
        fi
    fi
    
    return 1
}

# Execute rollback
execute_auto_rollback() {
    echo ""
    echo "========================================"
    echo "🚨 AUTO-ROLLBACK TRIGGERED"
    echo "========================================"
    echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    echo "Reason: Auto-rollback conditions met"
    echo "Environment: $ENV"
    echo ""
    
    # Find latest backup
    local latest_backup=""
    if [[ -d "$REPO_ROOT/backups" ]]; then
        latest_backup=$(ls -1 "$REPO_ROOT/backups"/dhash_*.zip 2>/dev/null | sort -r | head -n1 || echo "")
    fi
    
    if [[ -n "$latest_backup" ]]; then
        echo "Latest backup found: $latest_backup"
        
        # Verify backup integrity
        if sha256sum -c "${latest_backup}.sha256" >/dev/null 2>&1; then
            echo "✓ Backup integrity verified"
            
            # Execute rollback script
            if [[ -x "$SCRIPT_DIR/rollback_dhash.sh" ]]; then
                echo "Executing rollback..."
                "$SCRIPT_DIR/rollback_dhash.sh" --backup "$latest_backup" --env "$ENV"
                echo "✓ Rollback executed"
            else
                echo "⚠ WARNING: Rollback script not found or not executable"
                echo "Manual rollback required using backup: $latest_backup"
            fi
        else
            echo "✗ ERROR: Backup integrity check failed"
            echo "Manual intervention required"
        fi
    else
        echo "✗ ERROR: No backup found for rollback"
        echo "Manual intervention required"
    fi
    
    echo ""
    echo "Generating incident report..."
    generate_final_report
    
    exit 1
}

# Generate final monitoring report
generate_final_report() {
    local end_time=$(date +%s)
    local duration=$((end_time - START_TIME))
    local success_rate=0
    local error_rate=0
    
    if [[ $TOTAL_CHECKS -gt 0 ]]; then
        success_rate=$(awk "BEGIN {printf \"%.1f\", ($TOTAL_SUCCESSES/$TOTAL_CHECKS)*100}")
        error_rate=$(awk "BEGIN {printf \"%.1f\", ($TOTAL_ERRORS/$TOTAL_CHECKS)*100}")
    fi
    
    echo ""
    echo "========================================"
    echo "MONITORING FINAL REPORT"
    echo "========================================"
    echo "End Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    echo "Duration: ${duration}s ($(($duration/60)) minutes)"
    echo "Environment: $ENV"
    echo ""
    echo "Health Check Statistics:"
    echo "  Total Checks: $TOTAL_CHECKS"
    echo "  Successful: $TOTAL_SUCCESSES"
    echo "  Failed: $TOTAL_ERRORS"
    echo "  Success Rate: ${success_rate}%"
    echo "  Error Rate: ${error_rate}%"
    echo "  Consecutive Failures: $CONSECUTIVE_FAILURES"
    echo "  Latency Violations: $LATENCY_VIOLATIONS"
    echo ""
    echo "Auto-rollback Status: $AUTO_ROLLBACK"
    if [[ "$AUTO_ROLLBACK" == "true" ]]; then
        echo "Rollback Thresholds:"
        echo "  Consecutive Failures: $CONSECUTIVE_FAILURE_THRESHOLD ($(if [[ $CONSECUTIVE_FAILURES -ge $CONSECUTIVE_FAILURE_THRESHOLD ]]; then echo "BREACHED"; else echo "OK"; fi))"
        echo "  Success Rate: $(awk "BEGIN {printf \"%.0f%%\", $SUCCESS_RATE_THRESHOLD*100}") ($(if [[ $TOTAL_CHECKS -ge $MIN_CHECKS_FOR_RATE ]] && (( $(echo "($TOTAL_SUCCESSES/$TOTAL_CHECKS) < $SUCCESS_RATE_THRESHOLD" | bc -l) )); then echo "BREACHED"; else echo "OK"; fi))"
        echo "  Error Rate: $(awk "BEGIN {printf \"%.0f%%\", $ERROR_RATE_THRESHOLD*100}") ($(if [[ $TOTAL_CHECKS -ge $MIN_CHECKS_FOR_RATE ]] && (( $(echo "($TOTAL_ERRORS/$TOTAL_CHECKS) > $ERROR_RATE_THRESHOLD" | bc -l) )); then echo "BREACHED"; else echo "OK"; fi))"
    fi
    echo ""
    echo "Logs: $LOG_FILE"
    echo "Metrics: $METRICS_FILE"
    echo "========================================"
}

# Main monitoring loop
echo "Starting health monitoring..."
echo "Press Ctrl+C to stop monitoring early"
echo ""

END_TIME=$((START_TIME + MONITOR_DURATION))

while [[ $(date +%s) -lt $END_TIME ]]; do
    local current_time=$(date +%s)
    local elapsed=$((current_time - START_TIME))
    local remaining=$((END_TIME - current_time))
    
    echo "[$(date -u '+%H:%M:%S')] Check #$((TOTAL_CHECKS + 1)) (${elapsed}s elapsed, ${remaining}s remaining)"
    
    # Perform health check
    perform_health_check
    
    # Check for auto-rollback conditions
    if check_auto_rollback_conditions; then
        execute_auto_rollback
        # If we reach here, rollback failed or was skipped
        break
    fi
    
    # Display current statistics every 10 checks
    if [[ $((TOTAL_CHECKS % 10)) -eq 0 ]] && [[ $TOTAL_CHECKS -gt 0 ]]; then
        local current_success_rate=$(awk "BEGIN {printf \"%.1f\", ($TOTAL_SUCCESSES/$TOTAL_CHECKS)*100}")
        echo "  Stats: ${TOTAL_SUCCESSES}/${TOTAL_CHECKS} successful (${current_success_rate}%), ${CONSECUTIVE_FAILURES} consecutive failures"
    fi
    
    # Sleep until next check
    if [[ $(date +%s) -lt $END_TIME ]]; then
        sleep "$CHECK_INTERVAL"
    fi
done

# Generate final report
echo ""
if [[ $(date +%s) -ge $END_TIME ]]; then
    echo "✅ Monitoring completed successfully"
else
    echo "⚠ Monitoring stopped early"
fi

generate_final_report

# Exit with success if no rollback was triggered
if [[ $CONSECUTIVE_FAILURES -lt $CONSECUTIVE_FAILURE_THRESHOLD ]]; then
    exit 0
else
    exit 1
fi