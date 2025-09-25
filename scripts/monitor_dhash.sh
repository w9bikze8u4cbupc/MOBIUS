#!/bin/bash

# monitor_dhash.sh - Post-deployment monitoring script for MOBIUS dhash
# Usage: ./scripts/monitor_dhash.sh --env production --duration 3600

set -euo pipefail

# Default configuration
ENVIRONMENT=""
DURATION=3600  # 1 hour default
CHECK_INTERVAL=30  # 30 seconds between checks
ALERT_THRESHOLD_ERROR_RATE=1.0  # 1% error rate threshold
ALERT_THRESHOLD_RESPONSE_TIME=500  # 500ms response time threshold
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR $(date +'%H:%M:%S')]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS $(date +'%H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN $(date +'%H:%M:%S')]${NC} $1"
}

alert() {
    echo -e "${RED}[ALERT $(date +'%H:%M:%S')]${NC} 🚨 $1" >&2
}

usage() {
    cat << EOF
Usage: $0 --env ENVIRONMENT [OPTIONS]

Monitor MOBIUS dhash deployment and system health.

Required arguments:
    --env ENVIRONMENT       Target environment (production, staging, etc.)

Optional arguments:
    --duration SECONDS      Monitoring duration in seconds (default: 3600)
    --interval SECONDS      Check interval in seconds (default: 30)
    --error-threshold PCT   Error rate alert threshold (default: 1.0%)
    --response-threshold MS Response time alert threshold (default: 500ms)
    --help                 Show this help message

Examples:
    $0 --env production --duration 3600
    $0 --env staging --duration 1800 --interval 60
    $0 --env production --duration 7200 --error-threshold 0.5

Environment variables:
    DEPLOY_LEAD           Deploy lead identifier for alerts
    SLACK_WEBHOOK_URL     Slack webhook for alert notifications
    PAGER_DUTY_KEY       PagerDuty integration key for critical alerts
EOF
}

# Parse command line arguments
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
        --interval)
            CHECK_INTERVAL="$2"
            shift 2
            ;;
        --error-threshold)
            ALERT_THRESHOLD_ERROR_RATE="$2"
            shift 2
            ;;
        --response-threshold)
            ALERT_THRESHOLD_RESPONSE_TIME="$2"
            shift 2
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "$ENVIRONMENT" ]]; then
    error "--env is required"
    usage
    exit 1
fi

# Set environment-specific configuration
case $ENVIRONMENT in
    production)
        SERVICE_NAME="mobius-dhash"
        HEALTH_URL="http://localhost:8080/health"
        METRICS_URL="http://localhost:8080/metrics"
        LOG_DIR="/var/log/mobius/dhash"
        ;;
    staging)
        SERVICE_NAME="mobius-dhash-staging"
        HEALTH_URL="http://localhost:8081/health"
        METRICS_URL="http://localhost:8081/metrics"
        LOG_DIR="/var/log/mobius/dhash-staging"
        ;;
    *)
        error "Unsupported environment: $ENVIRONMENT"
        exit 1
        ;;
esac

# Environment variables with defaults
DEPLOY_LEAD="${DEPLOY_LEAD:-@DEPLOY_LEAD}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
PAGER_DUTY_KEY="${PAGER_DUTY_KEY:-}"

# Create monitoring log directory
MONITOR_LOG_DIR="$LOG_DIR/monitoring"
mkdir -p "$MONITOR_LOG_DIR"

# Monitoring log file
MONITOR_LOG="$MONITOR_LOG_DIR/monitor_${TIMESTAMP}.log"

log "Starting MOBIUS dhash monitoring"
log "Environment: $ENVIRONMENT"
log "Duration: $DURATION seconds ($((DURATION/60)) minutes)"
log "Check interval: $CHECK_INTERVAL seconds"
log "Error rate threshold: ${ALERT_THRESHOLD_ERROR_RATE}%"
log "Response time threshold: ${ALERT_THRESHOLD_RESPONSE_TIME}ms"
log "Monitor log: $MONITOR_LOG"

# Initialize monitoring metrics
TOTAL_CHECKS=0
FAILED_CHECKS=0
CONSECUTIVE_FAILURES=0
MAX_RESPONSE_TIME=0
MIN_RESPONSE_TIME=999999
TOTAL_RESPONSE_TIME=0
START_TIME=$(date +%s)
END_TIME=$((START_TIME + DURATION))

# Function to send alerts
send_alert() {
    local severity="$1"
    local message="$2"
    local timestamp=$(date -u +'%Y-%m-%d %H:%M:%S UTC')
    
    alert "$message"
    
    # Log alert
    echo "[$timestamp] [$severity] $message" >> "$MONITOR_LOG"
    
    # Send Slack notification if configured
    if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
        local emoji="⚠️"
        [[ $severity == "CRITICAL" ]] && emoji="🚨"
        
        local payload=$(cat << EOF
{
    "text": "${emoji} MOBIUS dhash Alert - $ENVIRONMENT",
    "attachments": [
        {
            "color": "danger",
            "fields": [
                {"title": "Environment", "value": "$ENVIRONMENT", "short": true},
                {"title": "Severity", "value": "$severity", "short": true},
                {"title": "Deploy Lead", "value": "$DEPLOY_LEAD", "short": true},
                {"title": "Timestamp", "value": "$timestamp", "short": true},
                {"title": "Message", "value": "$message", "short": false}
            ]
        }
    ]
}
EOF
        )
        
        curl -s -X POST -H 'Content-type: application/json' \
            --data "$payload" "$SLACK_WEBHOOK_URL" >/dev/null || true
    fi
    
    # PagerDuty integration for critical alerts
    if [[ $severity == "CRITICAL" && -n "$PAGER_DUTY_KEY" ]]; then
        local pd_payload=$(cat << EOF
{
    "routing_key": "$PAGER_DUTY_KEY",
    "event_action": "trigger",
    "payload": {
        "summary": "MOBIUS dhash Critical Alert - $ENVIRONMENT",
        "source": "mobius-dhash-monitor",
        "severity": "critical",
        "component": "dhash",
        "custom_details": {
            "environment": "$ENVIRONMENT",
            "message": "$message",
            "deploy_lead": "$DEPLOY_LEAD"
        }
    }
}
EOF
        )
        
        curl -s -X POST -H 'Content-Type: application/json' \
            --data "$pd_payload" https://events.pagerduty.com/v2/enqueue >/dev/null || true
    fi
}

# Function to check service health
check_service_health() {
    local status="UNKNOWN"
    local response_time=0
    local error_details=""
    
    # Check if service is running
    if ! systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        status="SERVICE_DOWN"
        error_details="Service $SERVICE_NAME is not running"
        return 1
    fi
    
    # Check health endpoint if curl is available
    if command -v curl >/dev/null 2>&1; then
        local start_time=$(date +%s%3N)
        local http_code
        local curl_output
        
        if curl_output=$(curl -s -w "%{http_code}" --connect-timeout 10 --max-time 30 "$HEALTH_URL" 2>/dev/null); then
            local end_time=$(date +%s%3N)
            response_time=$((end_time - start_time))
            http_code="${curl_output: -3}"
            
            if [[ $http_code -eq 200 ]]; then
                status="HEALTHY"
            else
                status="HTTP_ERROR"
                error_details="HTTP $http_code from $HEALTH_URL"
            fi
        else
            status="CONNECTION_ERROR"
            error_details="Cannot connect to $HEALTH_URL"
            response_time=0
        fi
    else
        status="NO_CURL"
        warn "curl not available for health checks"
    fi
    
    # Update statistics
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    if [[ $status == "HEALTHY" ]]; then
        CONSECUTIVE_FAILURES=0
        TOTAL_RESPONSE_TIME=$((TOTAL_RESPONSE_TIME + response_time))
        
        # Track min/max response times
        if [[ $response_time -gt $MAX_RESPONSE_TIME ]]; then
            MAX_RESPONSE_TIME=$response_time
        fi
        if [[ $response_time -lt $MIN_RESPONSE_TIME ]]; then
            MIN_RESPONSE_TIME=$response_time
        fi
        
        return 0
    else
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
        
        # Log detailed error
        echo "[$timestamp] [ERROR] Health check failed: $status - $error_details (Response time: ${response_time}ms)" >> "$MONITOR_LOG"
        
        return 1
    fi
}

# Function to check system resources
check_system_resources() {
    local cpu_usage memory_usage disk_usage
    
    # CPU usage (if available)
    if command -v top >/dev/null 2>&1; then
        cpu_usage=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}' 2>/dev/null || echo "0")
    else
        cpu_usage="unknown"
    fi
    
    # Memory usage
    if [[ -f /proc/meminfo ]]; then
        local mem_total mem_available
        mem_total=$(grep MemTotal /proc/meminfo | awk '{print $2}')
        mem_available=$(grep MemAvailable /proc/meminfo | awk '{print $2}' 2>/dev/null || echo "$mem_total")
        memory_usage=$(awk "BEGIN {printf \"%.1f\", (($mem_total - $mem_available) / $mem_total) * 100}")
    else
        memory_usage="unknown"
    fi
    
    # Disk usage for log directory
    if command -v df >/dev/null 2>&1; then
        disk_usage=$(df "$LOG_DIR" 2>/dev/null | tail -1 | awk '{print $5}' | sed 's/%//' || echo "unknown")
    else
        disk_usage="unknown"
    fi
    
    echo "CPU: ${cpu_usage}%, Memory: ${memory_usage}%, Disk: ${disk_usage}%"
    
    # Check for resource alerts
    if [[ $cpu_usage != "unknown" ]] && (( $(echo "$cpu_usage > 90" | bc -l 2>/dev/null || echo 0) )); then
        send_alert "CRITICAL" "High CPU usage: ${cpu_usage}%"
    fi
    
    if [[ $memory_usage != "unknown" ]] && (( $(echo "$memory_usage > 95" | bc -l 2>/dev/null || echo 0) )); then
        send_alert "CRITICAL" "High memory usage: ${memory_usage}%"
    fi
    
    if [[ $disk_usage != "unknown" && $disk_usage != +([0-9]) ]] || [[ $disk_usage -gt 90 ]]; then
        send_alert "WARNING" "High disk usage: ${disk_usage}%"
    fi
}

# Function to check quality gates (if applicable)
check_quality_gates() {
    if [[ -f "$SCRIPT_DIR/check_golden.js" ]]; then
        local temp_log=$(mktemp)
        if node "$SCRIPT_DIR/check_golden.js" --env "$ENVIRONMENT" --quick 2>"$temp_log" >/dev/null; then
            return 0
        else
            local error_details
            error_details=$(tail -5 "$temp_log" | tr '\n' ' ')
            send_alert "WARNING" "Quality gates validation failed: $error_details"
            rm -f "$temp_log"
            return 1
        fi
        rm -f "$temp_log"
    fi
    return 0
}

# Initialize monitoring log
{
    echo "MOBIUS dhash Monitoring Session"
    echo "==============================="
    echo ""
    echo "Started: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
    echo "Environment: $ENVIRONMENT"
    echo "Duration: $DURATION seconds"
    echo "Check Interval: $CHECK_INTERVAL seconds"
    echo "Deploy Lead: $DEPLOY_LEAD"
    echo ""
    echo "Monitoring Configuration:"
    echo "- Service: $SERVICE_NAME"
    echo "- Health URL: $HEALTH_URL"
    echo "- Error Rate Threshold: ${ALERT_THRESHOLD_ERROR_RATE}%"
    echo "- Response Time Threshold: ${ALERT_THRESHOLD_RESPONSE_TIME}ms"
    echo ""
} > "$MONITOR_LOG"

# Main monitoring loop
log "Starting monitoring loop..."
success "Monitoring active for $((DURATION/60)) minutes"

while [[ $(date +%s) -lt $END_TIME ]]; do
    local check_time=$(date +'%H:%M:%S')
    local timestamp=$(date -u +'%Y-%m-%d %H:%M:%S UTC')
    
    # Perform health check
    local health_status="UNKNOWN"
    local response_time=0
    
    if check_service_health; then
        health_status="HEALTHY"
        response_time=$((TOTAL_RESPONSE_TIME / (TOTAL_CHECKS - FAILED_CHECKS)))
    else
        health_status="UNHEALTHY"
    fi
    
    # Get system resources
    local resources
    resources=$(check_system_resources)
    
    # Check quality gates periodically (every 5th check)
    local quality_status="SKIPPED"
    if [[ $((TOTAL_CHECKS % 5)) -eq 0 ]]; then
        if check_quality_gates; then
            quality_status="PASS"
        else
            quality_status="FAIL"
        fi
    fi
    
    # Calculate current error rate
    local error_rate=0
    if [[ $TOTAL_CHECKS -gt 0 ]]; then
        error_rate=$(awk "BEGIN {printf \"%.2f\", ($FAILED_CHECKS / $TOTAL_CHECKS) * 100}")
    fi
    
    # Log check results
    echo "[$timestamp] Check #$TOTAL_CHECKS: Health=$health_status, Response=${response_time}ms, Error Rate=${error_rate}%, $resources, Quality=$quality_status" >> "$MONITOR_LOG"
    
    # Console output
    if [[ $health_status == "HEALTHY" ]]; then
        log "✓ [$check_time] Check #$TOTAL_CHECKS: ${health_status}, ${response_time}ms, Error: ${error_rate}%, $resources"
    else
        warn "✗ [$check_time] Check #$TOTAL_CHECKS: ${health_status}, Error: ${error_rate}%, $resources"
    fi
    
    # Check alert thresholds
    if (( $(echo "$error_rate > $ALERT_THRESHOLD_ERROR_RATE" | bc -l 2>/dev/null || echo 0) )); then
        send_alert "CRITICAL" "Error rate ${error_rate}% exceeds threshold ${ALERT_THRESHOLD_ERROR_RATE}%"
    fi
    
    if [[ $response_time -gt $ALERT_THRESHOLD_RESPONSE_TIME ]]; then
        send_alert "WARNING" "Response time ${response_time}ms exceeds threshold ${ALERT_THRESHOLD_RESPONSE_TIME}ms"
    fi
    
    if [[ $CONSECUTIVE_FAILURES -ge 3 ]]; then
        send_alert "CRITICAL" "$CONSECUTIVE_FAILURES consecutive health check failures"
    fi
    
    # Sleep until next check
    local remaining=$((END_TIME - $(date +%s)))
    if [[ $remaining -gt 0 ]]; then
        local sleep_time=$CHECK_INTERVAL
        [[ $remaining -lt $CHECK_INTERVAL ]] && sleep_time=$remaining
        sleep "$sleep_time"
    fi
done

# Calculate final statistics
local avg_response_time=0
local success_rate=0
local uptime_percentage=0

if [[ $((TOTAL_CHECKS - FAILED_CHECKS)) -gt 0 ]]; then
    avg_response_time=$((TOTAL_RESPONSE_TIME / (TOTAL_CHECKS - FAILED_CHECKS)))
fi

if [[ $TOTAL_CHECKS -gt 0 ]]; then
    success_rate=$(awk "BEGIN {printf \"%.2f\", (($TOTAL_CHECKS - $FAILED_CHECKS) / $TOTAL_CHECKS) * 100}")
    uptime_percentage=$success_rate
fi

# Generate final monitoring report
{
    echo ""
    echo "Monitoring Session Summary"
    echo "========================="
    echo ""
    echo "Completed: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
    echo "Duration: $(($(date +%s) - START_TIME)) seconds"
    echo ""
    echo "Statistics:"
    echo "- Total Checks: $TOTAL_CHECKS"
    echo "- Successful Checks: $((TOTAL_CHECKS - FAILED_CHECKS))"
    echo "- Failed Checks: $FAILED_CHECKS"
    echo "- Success Rate: ${success_rate}%"
    echo "- Average Response Time: ${avg_response_time}ms"
    echo "- Min Response Time: ${MIN_RESPONSE_TIME}ms"
    echo "- Max Response Time: ${MAX_RESPONSE_TIME}ms"
    echo ""
    echo "Final Assessment:"
    if [[ $success_rate == "100.00" ]]; then
        echo "✅ EXCELLENT - No issues detected during monitoring"
    elif (( $(echo "$success_rate >= 99.0" | bc -l) )); then
        echo "✅ GOOD - Minimal issues detected (${success_rate}% uptime)"
    elif (( $(echo "$success_rate >= 95.0" | bc -l) )); then
        echo "⚠️ ACCEPTABLE - Some issues detected (${success_rate}% uptime)"
    else
        echo "🚨 CONCERNING - Significant issues detected (${success_rate}% uptime)"
    fi
    echo ""
    echo "Monitoring completed successfully."
} >> "$MONITOR_LOG"

# Final summary
echo ""
echo "====================================================================="
success "Monitoring completed successfully!"
echo "====================================================================="
echo ""
log "Monitoring Summary:"
echo "  📊 Total Checks: $TOTAL_CHECKS"
echo "  ✅ Success Rate: ${success_rate}%"
echo "  ⏱️  Avg Response: ${avg_response_time}ms"
echo "  🚨 Failed Checks: $FAILED_CHECKS"
echo ""
log "Monitoring Report: $MONITOR_LOG"
echo ""
if [[ $success_rate == "100.00" ]]; then
    success "🎉 Deployment monitoring shows excellent system health!"
    log "No issues detected during the monitoring window."
elif (( $(echo "$success_rate >= 99.0" | bc -l) )); then
    success "✅ Deployment monitoring shows good system health."
    log "Minimal issues detected (${success_rate}% uptime)."
else
    warn "⚠️ Monitoring detected some issues during the window."
    log "Success rate: ${success_rate}% - review logs for details."
    log "Consider extended monitoring or investigation."
fi
echo ""
echo "====================================================================="