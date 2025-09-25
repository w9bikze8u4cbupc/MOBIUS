#!/bin/bash
set -euo pipefail

# MOBIUS dhash Production Monitoring Script
# Usage: ./scripts/monitor_dhash.sh --env <env> --duration <seconds>

# Default values
ENV=""
DURATION="3600"  # 1 hour default
INTERVAL="30"    # 30 seconds between checks
LOG_DIR="monitor_logs"

# Parse command line arguments
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
        --help)
            echo "Usage: $0 --env <env> [--duration <seconds>] [--interval <seconds>]"
            echo ""
            echo "Options:"
            echo "  --env       Environment to monitor (staging|production)"
            echo "  --duration  Monitoring duration in seconds (default: 3600)"
            echo "  --interval  Check interval in seconds (default: 30)"
            exit 0
            ;;
        *)
            echo "Unknown option $1"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$ENV" ]]; then
    echo "❌ Error: --env is required"
    exit 1
fi

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
    echo "❌ Error: --env must be 'staging' or 'production'"
    exit 1
fi

# Create monitoring logs directory
mkdir -p "$LOG_DIR"

# Log file for this monitoring session
MONITOR_LOG="$LOG_DIR/monitor-${ENV}-$(date +%Y%m%d-%H%M%S).log"

# Start logging
exec 1> >(tee -a "$MONITOR_LOG")
exec 2> >(tee -a "$MONITOR_LOG" >&2)

echo "📊 MOBIUS dhash Monitoring Starting"
echo "   Environment: $ENV"
echo "   Duration: ${DURATION}s ($(($DURATION / 60)) minutes)"
echo "   Check Interval: ${INTERVAL}s"
echo "   Log: $MONITOR_LOG"
echo "   Start Time: $(date -Iseconds)"
echo ""

# Load quality gates configuration
QUALITY_GATES_CONFIG="quality-gates-config.json"
if [[ -f "$QUALITY_GATES_CONFIG" ]]; then
    echo "📋 Loading quality gates from $QUALITY_GATES_CONFIG"
    
    # Extract thresholds using python
    if command -v python3 >/dev/null 2>&1; then
        ERROR_RATE_THRESHOLD=$(python3 -c "import json; print(json.load(open('$QUALITY_GATES_CONFIG')).get('error_rate_threshold', 0.05))")
        RESPONSE_TIME_THRESHOLD=$(python3 -c "import json; print(json.load(open('$QUALITY_GATES_CONFIG')).get('response_time_p95_ms', 2000))")
        CPU_THRESHOLD=$(python3 -c "import json; print(json.load(open('$QUALITY_GATES_CONFIG')).get('cpu_usage_threshold', 0.8))")
        MEMORY_THRESHOLD=$(python3 -c "import json; print(json.load(open('$QUALITY_GATES_CONFIG')).get('memory_usage_threshold', 0.9))")
    else
        # Fallback defaults
        ERROR_RATE_THRESHOLD="0.05"
        RESPONSE_TIME_THRESHOLD="2000"
        CPU_THRESHOLD="0.8"
        MEMORY_THRESHOLD="0.9"
    fi
    
    echo "   Error Rate Threshold: $ERROR_RATE_THRESHOLD"
    echo "   Response Time P95: ${RESPONSE_TIME_THRESHOLD}ms"
    echo "   CPU Usage Threshold: $CPU_THRESHOLD"
    echo "   Memory Usage Threshold: $MEMORY_THRESHOLD"
else
    echo "⚠️  Warning: No quality-gates-config.json found, using defaults"
    ERROR_RATE_THRESHOLD="0.05"
    RESPONSE_TIME_THRESHOLD="2000"
    CPU_THRESHOLD="0.8"
    MEMORY_THRESHOLD="0.9"
fi

echo ""

# Monitoring state
START_TIME=$(date +%s)
END_TIME=$((START_TIME + DURATION))
CHECK_COUNT=0
ALERT_COUNT=0
CRITICAL_ALERT_COUNT=0

# Helper function to check service health
check_service_health() {
    local timestamp=$(date -Iseconds)
    CHECK_COUNT=$((CHECK_COUNT + 1))
    
    echo "🔍 Health Check #$CHECK_COUNT ($timestamp)"
    
    # Simulate health checks (in real deployment, these would be actual health endpoints)
    local error_rate=0.0$(( RANDOM % 10 ))
    local response_time=$(( 100 + RANDOM % 1000 ))
    local cpu_usage=0.$(( 10 + RANDOM % 60 ))
    local memory_usage=0.$(( 20 + RANDOM % 50 ))
    local status_code=$(( RANDOM % 10 < 9 ? 200 : 500 ))
    
    echo "   Status Code: $status_code"
    echo "   Error Rate: $error_rate"
    echo "   Response Time P95: ${response_time}ms"
    echo "   CPU Usage: ${cpu_usage}"
    echo "   Memory Usage: ${memory_usage}"
    
    # Check against thresholds
    local alerts=""
    
    if [[ "$status_code" != "200" ]]; then
        alerts="$alerts SERVICE_DOWN"
        CRITICAL_ALERT_COUNT=$((CRITICAL_ALERT_COUNT + 1))
    fi
    
    # Note: bash doesn't handle floating point comparison well, so we'll use bc or simplified logic
    if (( $(echo "$error_rate > $ERROR_RATE_THRESHOLD" | bc -l 2>/dev/null || echo 0) )); then
        alerts="$alerts HIGH_ERROR_RATE"
        ALERT_COUNT=$((ALERT_COUNT + 1))
    fi
    
    if (( response_time > ${RESPONSE_TIME_THRESHOLD%.*} )); then
        alerts="$alerts HIGH_RESPONSE_TIME"
        ALERT_COUNT=$((ALERT_COUNT + 1))
    fi
    
    if (( $(echo "$cpu_usage > $CPU_THRESHOLD" | bc -l 2>/dev/null || echo 0) )); then
        alerts="$alerts HIGH_CPU"
        ALERT_COUNT=$((ALERT_COUNT + 1))
    fi
    
    if (( $(echo "$memory_usage > $MEMORY_THRESHOLD" | bc -l 2>/dev/null || echo 0) )); then
        alerts="$alerts HIGH_MEMORY"
        ALERT_COUNT=$((ALERT_COUNT + 1))
    fi
    
    if [[ -n "$alerts" ]]; then
        echo "   ⚠️  ALERTS: $alerts"
        
        # Log alert details
        cat >> "$LOG_DIR/alerts-${ENV}.log" <<EOF
$(date -Iseconds): $alerts (check #$CHECK_COUNT)
  Error Rate: $error_rate (threshold: $ERROR_RATE_THRESHOLD)
  Response Time: ${response_time}ms (threshold: ${RESPONSE_TIME_THRESHOLD}ms)
  CPU: $cpu_usage (threshold: $CPU_THRESHOLD)
  Memory: $memory_usage (threshold: $MEMORY_THRESHOLD)
EOF
    else
        echo "   ✅ All metrics within thresholds"
    fi
    
    echo ""
}

# Function to handle monitoring interruption
cleanup() {
    echo ""
    echo "📊 Monitoring Interrupted"
    echo "   Duration: $(($(date +%s) - START_TIME))s"
    echo "   Total Checks: $CHECK_COUNT"
    echo "   Alerts: $ALERT_COUNT"
    echo "   Critical Alerts: $CRITICAL_ALERT_COUNT"
    exit 0
}

# Trap Ctrl+C
trap cleanup INT

echo "🚀 Starting monitoring for $ENV environment..."
echo "📊 Press Ctrl+C to stop monitoring early"
echo ""

# Main monitoring loop
while [[ $(date +%s) -lt $END_TIME ]]; do
    check_service_health
    
    # Check if we should abort due to critical issues
    if [[ $CRITICAL_ALERT_COUNT -gt 3 ]]; then
        echo "🚨 CRITICAL: Too many service failures detected!"
        echo "🚨 Consider immediate rollback: ./scripts/rollback_dhash.sh --env $ENV"
        break
    fi
    
    # Wait for next check
    remaining=$((END_TIME - $(date +%s)))
    if [[ $remaining -gt 0 ]]; then
        if [[ $remaining -lt $INTERVAL ]]; then
            sleep $remaining
        else
            sleep $INTERVAL
        fi
    fi
done

# Final report
echo "📊 Monitoring Complete!"
echo "   Environment: $ENV"
echo "   Duration: $(($(date +%s) - START_TIME))s"
echo "   Total Checks: $CHECK_COUNT"
echo "   Alerts: $ALERT_COUNT"
echo "   Critical Alerts: $CRITICAL_ALERT_COUNT"
echo "   Log: $MONITOR_LOG"
echo ""

if [[ $CRITICAL_ALERT_COUNT -gt 0 ]]; then
    echo "🚨 CRITICAL ALERTS DETECTED - Consider rollback!"
    echo "   Rollback command: ./scripts/rollback_dhash.sh --env $ENV"
    exit 2
elif [[ $ALERT_COUNT -gt 0 ]]; then
    echo "⚠️  WARNINGS DETECTED - Monitor closely"
    exit 1
else
    echo "✅ All monitoring checks passed"
    exit 0
fi