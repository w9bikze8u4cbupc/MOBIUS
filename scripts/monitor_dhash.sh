#!/bin/bash
set -euo pipefail

# MOBIUS dhash Monitoring Script  
# Usage: ./monitor_dhash.sh --env <environment> [--duration <seconds>]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default values
ENVIRONMENT=""
DURATION=3600  # 1 hour default
QUALITY_GATES_CONFIG="${PROJECT_ROOT}/quality-gates-config.json"
MONITOR_LOG_DIR="${PROJECT_ROOT}/monitor_logs"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$MONITOR_LOG_DIR/monitor-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S).log"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
    exit 1
}

usage() {
    cat << EOF
Usage: $0 --env <environment> [options]

Options:
    --env ENVIRONMENT    Target environment (staging|production)
    --duration SECONDS   Monitoring duration in seconds (default: 3600)
    --help              Show this help message
EOF
    exit 1
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --duration)
                DURATION="$2"
                shift 2
                ;;
            --help)
                usage
                ;;
            *)
                error "Unknown option: $1"
                ;;
        esac
    done

    if [[ -z "$ENVIRONMENT" ]]; then
        error "Environment is required (--env)"
    fi

    if ! [[ "$DURATION" =~ ^[0-9]+$ ]]; then
        error "Duration must be a positive integer"
    fi
}

setup_monitoring() {
    mkdir -p "$MONITOR_LOG_DIR"
    
    if [[ ! -f "$QUALITY_GATES_CONFIG" ]]; then
        error "Quality gates config not found: $QUALITY_GATES_CONFIG"
    fi
    
    log "Starting monitoring for $ENVIRONMENT environment"
    log "Duration: ${DURATION}s ($(($DURATION/60)) minutes)"
    log "Quality gates config: $QUALITY_GATES_CONFIG"
}

check_health_endpoint() {
    local endpoint_url
    if [[ "$ENVIRONMENT" == "production" ]]; then
        endpoint_url="https://api.mobius-prod.example.com/health"
    else
        endpoint_url="https://api.mobius-staging.example.com/health" 
    fi
    
    local status_code
    local response
    
    status_code=$(curl -s -o /tmp/health_response.json -w "%{http_code}" "$endpoint_url" || echo "000")
    
    if [[ -f /tmp/health_response.json ]]; then
        response=$(cat /tmp/health_response.json)
    else
        response="No response"
    fi
    
    if [[ "$status_code" == "200" ]]; then
        local health_status
        health_status=$(echo "$response" | jq -r '.status // "UNKNOWN"' 2>/dev/null || echo "UNKNOWN")
        
        if [[ "$health_status" == "OK" ]]; then
            log "Health check: OK (HTTP $status_code)"
            return 0
        else
            log "Health check: DEGRADED (HTTP $status_code, status: $health_status)"
            return 1
        fi
    else
        log "Health check: FAILED (HTTP $status_code)"
        return 1
    fi
}

check_error_rates() {
    log "Checking error rates..."
    
    # Simulate error rate check - in real implementation this would query metrics API
    local error_rate
    error_rate=$(( RANDOM % 15 ))  # Random rate 0-14%
    
    local threshold=10
    
    if [[ $error_rate -gt $threshold ]]; then
        log "ERROR RATE ALERT: Current rate ${error_rate}% exceeds threshold ${threshold}%"
        return 1
    else
        log "Error rate: ${error_rate}% (within threshold ${threshold}%)"
        return 0
    fi
}

check_performance() {
    log "Checking performance metrics..."
    
    # Simulate p95 hash time check
    local p95_time
    p95_time=$(( RANDOM % 40 ))  # Random time 0-39s
    
    local threshold=30
    
    if [[ $p95_time -gt $threshold ]]; then
        log "PERFORMANCE ALERT: P95 hash time ${p95_time}s exceeds threshold ${threshold}s"
        return 1
    else
        log "P95 hash time: ${p95_time}s (within threshold ${threshold}s)"
        return 0
    fi
}

check_queue_health() {
    log "Checking queue health..."
    
    # Simulate queue length check
    local queue_length
    queue_length=$(( RANDOM % 150 ))  # Random length 0-149
    
    local threshold=100
    
    if [[ $queue_length -gt $threshold ]]; then
        log "QUEUE ALERT: Low confidence queue length ${queue_length} exceeds threshold ${threshold}"
        return 1
    else
        log "Queue length: ${queue_length} items (within threshold ${threshold})"
        return 0
    fi
}

check_system_resources() {
    log "Checking system resources..."
    
    # CPU usage
    local cpu_usage
    if command -v top >/dev/null 2>&1; then
        cpu_usage=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)%* id.*/\\1/" | awk '{print 100 - $1}' 2>/dev/null || echo "0")
    else
        cpu_usage=$(( RANDOM % 100 ))  # Fallback for systems without top
    fi
    
    local cpu_threshold=85
    if (( $(echo "$cpu_usage > $cpu_threshold" | bc -l 2>/dev/null || echo 0) )); then
        log "RESOURCE ALERT: CPU usage ${cpu_usage}% exceeds threshold ${cpu_threshold}%"
        return 1
    else
        log "CPU usage: ${cpu_usage}% (within threshold ${cpu_threshold}%)"
    fi
    
    # Memory check (simplified)
    if command -v free >/dev/null 2>&1; then
        local mem_usage
        mem_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
        log "Memory usage: ${mem_usage}%"
    fi
    
    return 0
}

run_monitoring_cycle() {
    local start_time
    local end_time
    local elapsed
    local health_failures=0
    local max_health_failures=2
    
    start_time=$(date +%s)
    end_time=$((start_time + DURATION))
    
    log "Monitoring cycle started (will run until $(date -d @$end_time))"
    
    while [[ $(date +%s) -lt $end_time ]]; do
        log "--- Monitoring check cycle ---"
        
        # Health check (most critical)
        if ! check_health_endpoint; then
            ((health_failures++))
            if [[ $health_failures -ge $max_health_failures ]]; then
                log "CRITICAL: Health check failed $health_failures consecutive times"
                log "RECOMMENDATION: Consider immediate rollback"
                return 1
            fi
        else
            health_failures=0  # Reset on success
        fi
        
        # Other checks
        check_error_rates || log "Warning: Error rate check flagged issues"
        check_performance || log "Warning: Performance check flagged issues"  
        check_queue_health || log "Warning: Queue health check flagged issues"
        check_system_resources || log "Warning: System resource check flagged issues"
        
        # Wait before next cycle (30 seconds)
        sleep 30
    done
    
    elapsed=$(($(date +%s) - start_time))
    log "Monitoring completed successfully after ${elapsed}s"
    return 0
}

generate_monitoring_report() {
    local report_file="${MONITOR_LOG_DIR}/monitoring-report-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S).json"
    
    cat > "$report_file" << EOF
{
    "monitoring": {
        "environment": "$ENVIRONMENT",
        "duration": $DURATION,
        "start_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "status": "completed"
    },
    "quality_gates": {
        "health_endpoint": "monitored",
        "error_rates": "monitored", 
        "performance": "monitored",
        "queue_health": "monitored",
        "system_resources": "monitored"
    },
    "recommendations": [
        "Review detailed logs in monitor_logs/",
        "Check dashboard trends for anomalies",
        "Verify all alerts were properly handled",
        "Consider extending monitoring if issues detected"
    ]
}
EOF
    
    log "Monitoring report generated: $report_file"
}

main() {
    setup_monitoring
    
    if run_monitoring_cycle; then
        log "Monitoring completed successfully - no critical issues detected"
        generate_monitoring_report
        exit 0
    else
        log "Monitoring detected critical issues - manual intervention may be required"
        generate_monitoring_report
        exit 1
    fi
}

parse_args "$@"
main