#!/bin/bash
# MOBIUS Post-Deploy Monitoring with Auto-Rollback
# T+60 monitoring window with health checks and auto-rollback triggers

set -euo pipefail

MONITOR_DURATION="${MONITOR_DURATION:-3600}" # 60 minutes in seconds
CHECK_INTERVAL="${CHECK_INTERVAL:-60}"       # Check every 60 seconds
API_URL="${API_URL:-http://localhost:5001}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
MONITOR_LOG="${MONITOR_LOG:-./logs/monitor_logs/monitor_$(date +%Y%m%d_%H%M%S).log}"
AUTO_ROLLBACK="${AUTO_ROLLBACK:-true}"
ROLLBACK_SCRIPT="${ROLLBACK_SCRIPT:-./scripts/deploy/rollback_dhash.sh}"

# Health check thresholds
CONSECUTIVE_FAILURES_THRESHOLD="${CONSECUTIVE_FAILURES_THRESHOLD:-3}"
P95_LATENCY_THRESHOLD="${P95_LATENCY_THRESHOLD:-5000}" # 5 seconds in ms
ERROR_RATE_THRESHOLD="${ERROR_RATE_THRESHOLD:-5}"      # 5%
LOW_CONFIDENCE_QUEUE_THRESHOLD="${LOW_CONFIDENCE_QUEUE_THRESHOLD:-100}"

# Ensure log directory exists
mkdir -p "$(dirname "$MONITOR_LOG")"

# Global counters
consecutive_failures=0
total_checks=0
successful_checks=0
start_time=$(date +%s)

# Function to log with timestamp
log() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$message" | tee -a "$MONITOR_LOG"
}

# Function to get latest backup
get_latest_backup() {
    local latest_backup
    latest_backup=$(find ./backups -name "dhash_*.zip" -type f | sort -r | head -n1)
    
    if [[ -n "$latest_backup" && -f "$latest_backup" && -f "${latest_backup}.sha256" ]]; then
        echo "$latest_backup"
    else
        log "ERROR: No valid backup found for rollback"
        return 1
    fi
}

# Function to perform HTTP health check with latency measurement
http_health_check() {
    local url="$1"
    local description="$2"
    local timeout="${3:-30}"
    
    if ! command -v curl >/dev/null 2>&1; then
        log "WARNING: curl not available for HTTP checks"
        return 1
    fi
    
    local start_time_ms
    start_time_ms=$(date +%s%3N)
    
    local response
    response=$(curl -s -w "%{http_code}|%{time_total}" --max-time "$timeout" "$url" 2>/dev/null || echo "000|0")
    
    local end_time_ms
    end_time_ms=$(date +%s%3N)
    
    local status_code
    status_code=$(echo "$response" | cut -d'|' -f1)
    
    local latency_ms
    latency_ms=$(echo "$(echo "$response" | cut -d'|' -f2) * 1000" | bc -l 2>/dev/null || echo "0")
    latency_ms=${latency_ms%.*} # Remove decimal places
    
    if [[ "$status_code" == "200" ]]; then
        log "✓ $description: HTTP $status_code, ${latency_ms}ms"
        
        # Check latency threshold
        if [[ $latency_ms -gt $P95_LATENCY_THRESHOLD ]]; then
            log "⚠ WARNING: High latency detected: ${latency_ms}ms > ${P95_LATENCY_THRESHOLD}ms"
            return 2 # Return 2 for latency warning
        fi
        
        return 0
    else
        log "✗ $description: HTTP $status_code, ${latency_ms}ms"
        return 1
    fi
}

# Function to check application processes
check_processes() {
    local node_processes
    node_processes=$(pgrep -f "node" | wc -l)
    
    if [[ $node_processes -gt 0 ]]; then
        log "✓ Process check: $node_processes Node.js processes running"
        return 0
    else
        log "✗ Process check: No Node.js processes found"
        return 1
    fi
}

# Function to check memory usage
check_memory_usage() {
    if ! command -v free >/dev/null 2>&1; then
        return 0 # Skip if not available
    fi
    
    local memory_info
    memory_info=$(free -m | awk 'NR==2{printf "Memory Usage: %s/%sMB (%.2f%%)", $3,$2,$3*100/$2}')
    log "ℹ $memory_info"
    
    # Extract memory usage percentage
    local memory_percent
    memory_percent=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    
    if [[ $memory_percent -gt 90 ]]; then
        log "⚠ WARNING: High memory usage: ${memory_percent}%"
        return 1
    fi
    
    return 0
}

# Function to check disk usage
check_disk_usage() {
    local disk_usage
    disk_usage=$(df -h . | tail -1 | awk '{print $5}' | sed 's/%//')
    
    log "ℹ Disk usage: ${disk_usage}%"
    
    if [[ $disk_usage -gt 85 ]]; then
        log "⚠ WARNING: High disk usage: ${disk_usage}%"
        return 1
    fi
    
    return 0
}

# Function to check application-specific metrics
check_app_metrics() {
    local failures=0
    
    # Check API health endpoint
    http_health_check "$API_URL/health" "API Health" 30 || ((failures++))
    
    # Check main API endpoint
    http_health_check "$API_URL/" "API Root" 30 || {
        local result=$?
        if [[ $result -eq 2 ]]; then
            # Latency warning, don't count as failure but log it
            log "⚠ API latency warning noted"
        else
            ((failures++))
        fi
    }
    
    # Check frontend
    http_health_check "$FRONTEND_URL/" "Frontend" 30 || ((failures++))
    
    # Check static file serving
    http_health_check "$API_URL/static/" "Static Files" 15 || ((failures++))
    
    return $failures
}

# Function to perform comprehensive health check
perform_health_check() {
    log "=== Health Check #$((total_checks + 1)) ==="
    local total_failures=0
    
    # Process checks
    check_processes || ((total_failures++))
    
    # Memory and disk checks
    check_memory_usage || ((total_failures++))
    check_disk_usage || ((total_failures++))
    
    # Application-specific checks
    check_app_metrics || ((total_failures += $?))
    
    ((total_checks++))
    
    if [[ $total_failures -eq 0 ]]; then
        log "✓ Health check PASSED (0 failures)"
        consecutive_failures=0
        ((successful_checks++))
        return 0
    else
        log "✗ Health check FAILED ($total_failures failures)"
        ((consecutive_failures++))
        return 1
    fi
}

# Function to check if auto-rollback should be triggered
should_trigger_rollback() {
    local current_time
    current_time=$(date +%s)
    local elapsed=$((current_time - start_time))
    local success_rate=0
    
    if [[ $total_checks -gt 0 ]]; then
        success_rate=$((successful_checks * 100 / total_checks))
    fi
    
    log "=== Rollback Decision Analysis ==="
    log "Elapsed time: $((elapsed / 60)) minutes"
    log "Total checks: $total_checks"
    log "Successful checks: $successful_checks"
    log "Success rate: ${success_rate}%"
    log "Consecutive failures: $consecutive_failures"
    
    # Check consecutive failures threshold
    if [[ $consecutive_failures -ge $CONSECUTIVE_FAILURES_THRESHOLD ]]; then
        log "🚨 ROLLBACK TRIGGER: $consecutive_failures consecutive failures (threshold: $CONSECUTIVE_FAILURES_THRESHOLD)"
        return 0
    fi
    
    # Check overall success rate (after reasonable sample size)
    if [[ $total_checks -ge 5 && $success_rate -lt 70 ]]; then
        log "🚨 ROLLBACK TRIGGER: Low success rate ${success_rate}% (threshold: 70%)"
        return 0
    fi
    
    return 1
}

# Function to execute auto-rollback
execute_rollback() {
    log "=== EXECUTING AUTO-ROLLBACK ==="
    
    local latest_backup
    latest_backup=$(get_latest_backup) || {
        log "CRITICAL ERROR: Cannot execute rollback - no valid backup found"
        log "Manual intervention required immediately"
        return 1
    }
    
    log "Using backup: $latest_backup"
    log "Verifying backup integrity..."
    
    # Verify backup before rollback
    if ! sha256sum -c "${latest_backup}.sha256" >/dev/null 2>&1; then
        log "CRITICAL ERROR: Backup integrity check failed"
        log "Manual intervention required immediately"
        return 1
    fi
    
    log "Backup integrity verified. Initiating rollback..."
    
    # Execute rollback
    if [[ -x "$ROLLBACK_SCRIPT" ]]; then
        log "Executing rollback script: $ROLLBACK_SCRIPT"
        
        if "$ROLLBACK_SCRIPT" --backup "$latest_backup" --env production --force; then
            log "✅ AUTO-ROLLBACK COMPLETED SUCCESSFULLY"
            log "System has been rolled back to previous stable state"
            return 0
        else
            log "CRITICAL ERROR: Rollback script failed"
            log "Manual intervention required immediately"
            return 1
        fi
    else
        log "CRITICAL ERROR: Rollback script not found or not executable: $ROLLBACK_SCRIPT"
        log "Manual intervention required immediately"
        return 1
    fi
}

# Function to show monitoring summary
show_summary() {
    local current_time
    current_time=$(date +%s)
    local elapsed=$((current_time - start_time))
    local success_rate=0
    
    if [[ $total_checks -gt 0 ]]; then
        success_rate=$((successful_checks * 100 / total_checks))
    fi
    
    log "=== MONITORING SUMMARY ==="
    log "Total monitoring time: $((elapsed / 60)) minutes"
    log "Total health checks: $total_checks"
    log "Successful checks: $successful_checks"
    log "Failed checks: $((total_checks - successful_checks))"
    log "Overall success rate: ${success_rate}%"
    log "Final consecutive failures: $consecutive_failures"
    
    if [[ $success_rate -ge 95 ]]; then
        log "✅ DEPLOYMENT MONITORING: EXCELLENT (${success_rate}%)"
    elif [[ $success_rate -ge 85 ]]; then
        log "✅ DEPLOYMENT MONITORING: GOOD (${success_rate}%)"
    elif [[ $success_rate -ge 70 ]]; then
        log "⚠ DEPLOYMENT MONITORING: ACCEPTABLE (${success_rate}%)"
    else
        log "❌ DEPLOYMENT MONITORING: POOR (${success_rate}%)"
    fi
}

# Main monitoring loop
main() {
    log "=== MOBIUS Post-Deploy Monitoring Started ==="
    log "Monitor duration: $((MONITOR_DURATION / 60)) minutes"
    log "Check interval: ${CHECK_INTERVAL}s"
    log "Auto-rollback enabled: $AUTO_ROLLBACK"
    log "API URL: $API_URL"
    log "Frontend URL: $FRONTEND_URL"
    log "Consecutive failures threshold: $CONSECUTIVE_FAILURES_THRESHOLD"
    log "P95 latency threshold: ${P95_LATENCY_THRESHOLD}ms"
    
    local end_time=$((start_time + MONITOR_DURATION))
    
    while [[ $(date +%s) -lt $end_time ]]; do
        # Perform health check
        perform_health_check
        
        # Check if rollback should be triggered
        if [[ "$AUTO_ROLLBACK" == "true" ]] && should_trigger_rollback; then
            if execute_rollback; then
                log "Auto-rollback completed. Monitoring will continue to verify rollback success."
                # Reset counters after successful rollback
                consecutive_failures=0
                successful_checks=0
                total_checks=0
                start_time=$(date +%s)
                end_time=$((start_time + 1800)) # Monitor for 30 more minutes after rollback
            else
                log "CRITICAL: Auto-rollback failed. Exiting monitoring."
                exit 2
            fi
        fi
        
        # Wait for next check
        local remaining_time=$((end_time - $(date +%s)))
        if [[ $remaining_time -gt $CHECK_INTERVAL ]]; then
            log "Next check in ${CHECK_INTERVAL}s (${remaining_time}s remaining)..."
            sleep $CHECK_INTERVAL
        else
            # Final check
            if [[ $remaining_time -gt 0 ]]; then
                sleep $remaining_time
            fi
            break
        fi
    done
    
    log "=== MONITORING PERIOD COMPLETED ==="
    show_summary
    
    # Final health check
    log "=== Final Health Check ==="
    if perform_health_check; then
        log "✅ FINAL STATUS: Application healthy at end of monitoring period"
        exit 0
    else
        log "⚠ FINAL STATUS: Health issues detected at end of monitoring period"
        log "Consider manual review of application status"
        exit 1
    fi
}

# Handle help argument
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    cat << EOF
Usage: $0 [options]

Monitors MOBIUS deployment for T+60 minutes with auto-rollback capability.

Environment Variables:
  MONITOR_DURATION                    Monitor duration in seconds (default: 3600 = 60min)
  CHECK_INTERVAL                      Check interval in seconds (default: 60)
  API_URL                            API base URL (default: http://localhost:5001)
  FRONTEND_URL                       Frontend URL (default: http://localhost:3000)
  AUTO_ROLLBACK                      Enable auto-rollback (default: true)
  CONSECUTIVE_FAILURES_THRESHOLD      Consecutive failures for rollback (default: 3)
  P95_LATENCY_THRESHOLD              P95 latency threshold in ms (default: 5000)

Exit Codes:
  0   Monitoring completed successfully
  1   Health issues detected at end
  2   Critical rollback failure

Examples:
  $0                                  # Standard 60-minute monitoring
  MONITOR_DURATION=1800 $0           # 30-minute monitoring
  AUTO_ROLLBACK=false $0             # Disable auto-rollback
EOF
    exit 0
fi

# Execute main function
main "$@"