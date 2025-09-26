#!/bin/bash
# MOBIUS Deployment - Application Monitoring Script
# Monitors deployed applications with configurable thresholds and auto-rollback

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Configuration
DEFAULT_ENV="staging"
DEFAULT_DURATION="3600"  # 60 minutes in seconds
DEFAULT_INTERVAL="60"    # Check every 60 seconds
DEFAULT_FAILURE_THRESHOLD="3"
DEFAULT_RESPONSE_TIME_THRESHOLD="5000"  # 5 seconds in ms

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --env ENV                 Target environment (staging|production)"
    echo "  --duration SECONDS        Total monitoring duration (default: 3600)"
    echo "  --interval SECONDS        Check interval (default: 60)"
    echo "  --failure-threshold COUNT Max consecutive failures before rollback (default: 3)"
    echo "  --response-threshold MS   Max response time in ms (default: 5000)"
    echo "  --backup-file FILE        Backup file to rollback to on failure"
    echo "  --auto-rollback          Enable automatic rollback on threshold breach"
    echo "  --no-rollback            Disable rollback even on critical failures"
    echo "  --help                   Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --env production --duration 3600 --auto-rollback"
    echo "  $0 --env staging --interval 30 --backup-file backups/latest.zip"
    exit 1
}

# Parse arguments
ENV="${DEFAULT_ENV}"
DURATION="${DEFAULT_DURATION}"
INTERVAL="${DEFAULT_INTERVAL}"
FAILURE_THRESHOLD="${DEFAULT_FAILURE_THRESHOLD}"
RESPONSE_THRESHOLD="${DEFAULT_RESPONSE_TIME_THRESHOLD}"
BACKUP_FILE=""
AUTO_ROLLBACK=false
NO_ROLLBACK=false

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
        --interval)
            INTERVAL="$2"
            shift 2
            ;;
        --failure-threshold)
            FAILURE_THRESHOLD="$2"
            shift 2
            ;;
        --response-threshold)
            RESPONSE_THRESHOLD="$2"
            shift 2
            ;;
        --backup-file)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --auto-rollback)
            AUTO_ROLLBACK=true
            shift
            ;;
        --no-rollback)
            NO_ROLLBACK=true
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

# Validate arguments
if [[ ! "$ENV" =~ ^(staging|production)$ ]]; then
    echo "Error: Invalid environment '$ENV'. Must be staging or production."
    exit 1
fi

# Create monitor logs directory
MONITOR_LOG_DIR="${PROJECT_ROOT}/monitor_logs"
mkdir -p "$MONITOR_LOG_DIR"

LOG_FILE="${MONITOR_LOG_DIR}/monitor-${ENV}-$(date +%Y%m%d_%H%M%S).log"
METRICS_FILE="${MONITOR_LOG_DIR}/metrics-${ENV}-$(date +%Y%m%d_%H%M%S).json"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Metrics logging function
log_metrics() {
    local status="$1"
    local response_time="$2"
    local error_msg="${3:-}"
    
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    cat >> "$METRICS_FILE" << EOF
{
  "timestamp": "$timestamp",
  "status": "$status",
  "response_time_ms": $response_time,
  "environment": "$ENV",
  "error_message": "$error_msg"
},
EOF
}

log "=== MOBIUS MONITORING SCRIPT ==="
log "Environment: $ENV"
log "Duration: ${DURATION}s ($(($DURATION / 60)) minutes)"
log "Check interval: ${INTERVAL}s"
log "Failure threshold: $FAILURE_THRESHOLD"
log "Response time threshold: ${RESPONSE_THRESHOLD}ms"
log "Auto-rollback: $AUTO_ROLLBACK"
log "Backup file: ${BACKUP_FILE:-"None"}"
log "Log file: $LOG_FILE"
log "Metrics file: $METRICS_FILE"
log ""

# Initialize metrics file
echo "[" > "$METRICS_FILE"

# Monitoring variables
START_TIME=$(date +%s)
END_TIME=$((START_TIME + DURATION))
CONSECUTIVE_FAILURES=0
TOTAL_CHECKS=0
TOTAL_FAILURES=0
TOTAL_SLOW_RESPONSES=0

# Health check function
check_health() {
    local start_time
    start_time=$(date +%s%3N)  # milliseconds
    
    local status_code
    local response_time
    local error_msg=""
    
    # Perform health check
    if response=$(curl -s -w "HTTPSTATUS:%{http_code}" -m 10 http://localhost:5001/health 2>&1); then
        status_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
        
        local end_time
        end_time=$(date +%s%3N)
        response_time=$((end_time - start_time))
        
        if [[ "$status_code" == "200" ]]; then
            log_metrics "success" "$response_time"
            return 0
        else
            error_msg="HTTP $status_code"
            log_metrics "failure" "$response_time" "$error_msg"
            return 1
        fi
    else
        local end_time
        end_time=$(date +%s%3N)
        response_time=$((end_time - start_time))
        error_msg="Connection failed: $response"
        log_metrics "failure" "$response_time" "$error_msg"
        return 1
    fi
}

# Check response time
check_response_time() {
    local start_time
    start_time=$(date +%s%3N)
    
    if curl -f -s -m 10 http://localhost:5001/health >/dev/null 2>&1; then
        local end_time
        end_time=$(date +%s%3N)
        local response_time=$((end_time - start_time))
        
        if [[ $response_time -gt $RESPONSE_THRESHOLD ]]; then
            log "Warning: Slow response time: ${response_time}ms (threshold: ${RESPONSE_THRESHOLD}ms)"
            TOTAL_SLOW_RESPONSES=$((TOTAL_SLOW_RESPONSES + 1))
            return 1
        fi
        
        return 0
    else
        return 1
    fi
}

# Check system resources
check_system_resources() {
    local cpu_usage
    local memory_usage
    local disk_usage
    
    # Get CPU usage (5-second average)
    if command -v top >/dev/null 2>&1; then
        cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    else
        cpu_usage="unknown"
    fi
    
    # Get memory usage
    if command -v free >/dev/null 2>&1; then
        memory_usage=$(free | grep Mem | awk '{printf "%.1f", ($3/$2) * 100.0}')
    else
        memory_usage="unknown"
    fi
    
    # Get disk usage
    disk_usage=$(df / | tail -1 | awk '{print $5}' | cut -d'%' -f1)
    
    log "System resources - CPU: ${cpu_usage}%, Memory: ${memory_usage}%, Disk: ${disk_usage}%"
    
    # Check for critical resource usage
    if [[ "$cpu_usage" != "unknown" ]] && (( $(echo "$cpu_usage > 90" | bc -l) )); then
        log "Warning: High CPU usage: ${cpu_usage}%"
        return 1
    fi
    
    if [[ "$memory_usage" != "unknown" ]] && (( $(echo "$memory_usage > 90" | bc -l) )); then
        log "Warning: High memory usage: ${memory_usage}%"
        return 1
    fi
    
    if [[ $disk_usage -gt 90 ]]; then
        log "Warning: High disk usage: ${disk_usage}%"
        return 1
    fi
    
    return 0
}

# Trigger rollback
trigger_rollback() {
    if [[ "$NO_ROLLBACK" == "true" ]]; then
        log "Rollback disabled (--no-rollback flag), manual intervention required"
        return
    fi
    
    if [[ -z "$BACKUP_FILE" ]]; then
        log "No backup file specified, cannot perform automatic rollback"
        log "Manual rollback required"
        return
    fi
    
    log "TRIGGERING AUTOMATIC ROLLBACK"
    log "Reason: $CONSECUTIVE_FAILURES consecutive failures (threshold: $FAILURE_THRESHOLD)"
    log "Using backup: $BACKUP_FILE"
    
    local rollback_script="${SCRIPT_DIR}/rollback_dhash.sh"
    if [[ -f "$rollback_script" ]]; then
        log "Executing rollback script..."
        if "$rollback_script" --backup "$BACKUP_FILE" --env "$ENV" --skip-confirmation; then
            log "✓ Automatic rollback completed successfully"
            exit 0
        else
            log "✗ Automatic rollback failed"
            log "Manual intervention required immediately"
            exit 1
        fi
    else
        log "Rollback script not found: $rollback_script"
        log "Manual rollback required"
    fi
}

# Generate summary report
generate_summary() {
    local current_time
    current_time=$(date +%s)
    local elapsed_time=$((current_time - START_TIME))
    local uptime_percentage=0
    
    if [[ $TOTAL_CHECKS -gt 0 ]]; then
        uptime_percentage=$(( (TOTAL_CHECKS - TOTAL_FAILURES) * 100 / TOTAL_CHECKS ))
    fi
    
    log ""
    log "=== MONITORING SUMMARY ==="
    log "Environment: $ENV"
    log "Monitoring duration: ${elapsed_time}s / ${DURATION}s"
    log "Total checks: $TOTAL_CHECKS"
    log "Total failures: $TOTAL_FAILURES"
    log "Slow responses: $TOTAL_SLOW_RESPONSES"
    log "Uptime percentage: ${uptime_percentage}%"
    log "Final status: $(if [[ $CONSECUTIVE_FAILURES -lt $FAILURE_THRESHOLD ]]; then echo "HEALTHY"; else echo "DEGRADED"; fi)"
}

# Cleanup function
cleanup() {
    # Close metrics JSON array
    echo "{}]" >> "$METRICS_FILE"  # Add empty object and close array
    
    generate_summary
    
    log "Monitoring stopped"
    log "Log file: $LOG_FILE"
    log "Metrics file: $METRICS_FILE"
    
    exit 0
}

trap cleanup INT TERM

# Main monitoring loop
log "Starting monitoring loop..."

while [[ $(date +%s) -lt $END_TIME ]]; do
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    log "Check $TOTAL_CHECKS - $(date)"
    
    # Perform health check
    if check_health && check_response_time; then
        log "✓ Health check passed"
        CONSECUTIVE_FAILURES=0
    else
        log "✗ Health check failed"
        CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
        TOTAL_FAILURES=$((TOTAL_FAILURES + 1))
        
        log "Consecutive failures: $CONSECUTIVE_FAILURES"
        
        if [[ $CONSECUTIVE_FAILURES -ge $FAILURE_THRESHOLD ]]; then
            log "🚨 FAILURE THRESHOLD BREACHED"
            
            if [[ "$AUTO_ROLLBACK" == "true" ]]; then
                trigger_rollback
            else
                log "Auto-rollback disabled, continuing monitoring"
                log "Manual intervention may be required"
            fi
        fi
    fi
    
    # Check system resources
    check_system_resources
    
    log "---"
    
    # Wait for next check
    sleep "$INTERVAL"
done

# Normal completion
log "Monitoring duration completed"
cleanup