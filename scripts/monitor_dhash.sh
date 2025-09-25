#!/bin/bash

# Monitor DHASH - Health monitoring with configurable thresholds
# Provides continuous monitoring with automatic rollback on failures

set -euo pipefail

# Configuration with defaults (can be overridden by environment variables)
HEALTH_URL="${HEALTH_URL:-http://localhost:5000/health}"
METRICS_URL="${METRICS_URL:-http://localhost:5000/metrics/dhash}"
ROLLBACK_SCRIPT="${ROLLBACK_SCRIPT:-./scripts/rollback_dhash.sh}"
BACKUP_DIR="${BACKUP_DIR:-backups/}"
MONITOR_DURATION="${MONITOR_DURATION:-3600}"
FAST_INTERVAL="${FAST_INTERVAL:-30}"
SLOW_INTERVAL="${SLOW_INTERVAL:-120}"
FAST_PERIOD="${FAST_PERIOD:-300}"
EXTRACTION_FAILURE_RATE_ABS="${EXTRACTION_FAILURE_RATE_ABS:-10.0}"
EXTRACTION_FAILURE_RATE_MULT="${EXTRACTION_FAILURE_RATE_MULT:-3}"
P95_MS_ABS="${P95_MS_ABS:-30000}"
P95_MS_MULT="${P95_MS_MULT:-3}"
LOW_CONF_QUEUE_ABS="${LOW_CONF_QUEUE_ABS:-100}"
LOW_CONF_QUEUE_MULT="${LOW_CONF_QUEUE_MULT:-5}"
LOG_DIR="${LOG_DIR:-monitor_logs}"
ENVIRONMENT="${ENVIRONMENT:-staging}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log() {
    local message="$1"
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $message" | tee -a "$LOG_FILE"
}

log_success() {
    local message="$1"
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $message${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    local message="$1"
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $message${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    local message="$1"
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $message${NC}" | tee -a "$LOG_FILE"
}

log_metric() {
    local message="$1"
    echo -e "${CYAN}[$(date +'%Y-%m-%d %H:%M:%S')] 📊 $message${NC}" | tee -a "$LOG_FILE"
}

# Help function
show_help() {
    cat << EOF
Monitor DHASH - Health monitoring with configurable thresholds

Usage: $0 [OPTIONS]

Options:
    --env <environment>     Target environment (staging|production) [default: staging]
    --health-url <url>      Health check endpoint [default: http://localhost:5000/health]
    --metrics-url <url>     Metrics endpoint [default: http://localhost:5000/metrics/dhash]
    --duration <seconds>    Total monitoring duration [default: 3600]
    --fast-interval <sec>   Fast polling interval [default: 30]
    --slow-interval <sec>   Slow polling interval [default: 120]
    --fast-period <sec>     Duration of fast polling [default: 300]
    --rollback-script <path> Path to rollback script [default: ./scripts/rollback_dhash.sh]
    --backup-dir <path>     Backup directory [default: backups/]
    --log-dir <path>        Log directory [default: monitor_logs]
    --no-rollback           Disable automatic rollback on failure
    --help, -h             Show this help message

Threshold Environment Variables:
    EXTRACTION_FAILURE_RATE_ABS    Absolute threshold for extraction failure rate (%)
    EXTRACTION_FAILURE_RATE_MULT   Multiplier over baseline for failure rate
    P95_MS_ABS                     Absolute threshold for p95 hash time (ms)
    P95_MS_MULT                    Multiplier over baseline for p95
    LOW_CONF_QUEUE_ABS             Absolute threshold for low-confidence queue
    LOW_CONF_QUEUE_MULT            Multiplier over baseline for queue

Examples:
    # Standard monitoring for 1 hour
    $0

    # Conservative production monitoring
    EXTRACTION_FAILURE_RATE_ABS=5.0 P95_MS_ABS=20000 $0 --env production

    # Short-term monitoring with custom thresholds
    $0 --duration 600 --fast-interval 10

Current Configuration:
    Health URL: $HEALTH_URL
    Metrics URL: $METRICS_URL
    Monitor Duration: ${MONITOR_DURATION}s ($(($MONITOR_DURATION / 60)) minutes)
    Fast Polling: ${FAST_INTERVAL}s for ${FAST_PERIOD}s
    Slow Polling: ${SLOW_INTERVAL}s afterwards
EOF
}

# Parse command line arguments
parse_args() {
    local no_rollback=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --health-url)
                HEALTH_URL="$2"
                shift 2
                ;;
            --metrics-url)
                METRICS_URL="$2"
                shift 2
                ;;
            --duration)
                MONITOR_DURATION="$2"
                shift 2
                ;;
            --fast-interval)
                FAST_INTERVAL="$2"
                shift 2
                ;;
            --slow-interval)
                SLOW_INTERVAL="$2"
                shift 2
                ;;
            --fast-period)
                FAST_PERIOD="$2"
                shift 2
                ;;
            --rollback-script)
                ROLLBACK_SCRIPT="$2"
                shift 2
                ;;
            --backup-dir)
                BACKUP_DIR="$2"
                shift 2
                ;;
            --log-dir)
                LOG_DIR="$2"
                shift 2
                ;;
            --no-rollback)
                no_rollback=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    export NO_ROLLBACK="$no_rollback"
}

# Initialize monitoring
initialize_monitoring() {
    # Create log directory
    mkdir -p "$LOG_DIR"
    
    # Set up log file
    local timestamp=$(date +%Y%m%d_%H%M%S)
    export LOG_FILE="$LOG_DIR/monitor_${ENVIRONMENT}_${timestamp}.log"
    
    log "🔍 Initializing DHASH monitoring"
    log "Environment: $ENVIRONMENT"
    log "Health URL: $HEALTH_URL"
    log "Metrics URL: $METRICS_URL"
    log "Monitor duration: ${MONITOR_DURATION}s"
    log "Log file: $LOG_FILE"
    
    # Validate required tools
    local required_tools=("curl" "jq")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            log_warning "$tool not found, some features may be limited"
        fi
    done
    
    log_success "Monitoring initialization complete"
}

# Fetch health status
fetch_health() {
    local url="$1"
    local timeout="${2:-10}"
    
    if command -v curl >/dev/null 2>&1; then
        curl -sf --max-time "$timeout" "$url" 2>/dev/null
    else
        log_warning "curl not available, cannot fetch health status"
        echo '{"status": "unknown", "error": "curl not available"}'
    fi
}

# Fetch metrics
fetch_metrics() {
    local url="$1"
    local timeout="${2:-15}"
    
    if command -v curl >/dev/null 2>&1; then
        curl -sf --max-time "$timeout" "$url" 2>/dev/null
    else
        log_warning "curl not available, cannot fetch metrics"
        echo '{"error": "curl not available"}'
    fi
}

# Parse metrics and extract key values
parse_metrics() {
    local metrics_json="$1"
    local baseline_file="$2"
    
    # Extract key metrics (this would be customized based on actual API)
    local extraction_failure_rate=0
    local p95_hash_time=0
    local low_conf_queue_length=0
    
    if command -v jq >/dev/null 2>&1; then
        extraction_failure_rate=$(echo "$metrics_json" | jq -r '.extraction_failure_rate // 0' 2>/dev/null || echo 0)
        p95_hash_time=$(echo "$metrics_json" | jq -r '.p95_hash_time_ms // 0' 2>/dev/null || echo 0)
        low_conf_queue_length=$(echo "$metrics_json" | jq -r '.low_confidence_queue_length // 0' 2>/dev/null || echo 0)
    else
        # Fallback parsing without jq (simplified)
        extraction_failure_rate=$(echo "$metrics_json" | grep -o '"extraction_failure_rate":[0-9.]*' | cut -d':' -f2 || echo 0)
        p95_hash_time=$(echo "$metrics_json" | grep -o '"p95_hash_time_ms":[0-9.]*' | cut -d':' -f2 || echo 0)
        low_conf_queue_length=$(echo "$metrics_json" | grep -o '"low_confidence_queue_length":[0-9.]*' | cut -d':' -f2 || echo 0)
    fi
    
    # Store baseline on first run
    if [[ ! -f "$baseline_file" ]]; then
        cat > "$baseline_file" << EOF
{
  "extraction_failure_rate": $extraction_failure_rate,
  "p95_hash_time_ms": $p95_hash_time,
  "low_confidence_queue_length": $low_conf_queue_length,
  "established_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
        log "Baseline metrics established: failure_rate=$extraction_failure_rate, p95=${p95_hash_time}ms, queue=$low_conf_queue_length"
    fi
    
    echo "$extraction_failure_rate,$p95_hash_time,$low_conf_queue_length"
}

# Check thresholds against baseline
check_thresholds() {
    local current_values="$1"
    local baseline_file="$2"
    
    IFS=',' read -r current_failure_rate current_p95 current_queue <<< "$current_values"
    
    local baseline_failure_rate=0
    local baseline_p95=0
    local baseline_queue=0
    
    if [[ -f "$baseline_file" ]] && command -v jq >/dev/null 2>&1; then
        baseline_failure_rate=$(jq -r '.extraction_failure_rate // 0' "$baseline_file" 2>/dev/null || echo 0)
        baseline_p95=$(jq -r '.p95_hash_time_ms // 0' "$baseline_file" 2>/dev/null || echo 0)
        baseline_queue=$(jq -r '.low_confidence_queue_length // 0' "$baseline_file" 2>/dev/null || echo 0)
    fi
    
    local violations=()
    
    # Check extraction failure rate
    local failure_rate_threshold_abs="$EXTRACTION_FAILURE_RATE_ABS"
    local failure_rate_threshold_mult=$(echo "$baseline_failure_rate * $EXTRACTION_FAILURE_RATE_MULT" | bc -l 2>/dev/null || echo "$baseline_failure_rate")
    
    if (( $(echo "$current_failure_rate > $failure_rate_threshold_abs" | bc -l) )) || \
       (( $(echo "$current_failure_rate > $failure_rate_threshold_mult" | bc -l) )); then
        violations+=("Extraction failure rate: ${current_failure_rate}% (threshold: ${failure_rate_threshold_abs}%, ${failure_rate_threshold_mult}%)")
    fi
    
    # Check p95 hash time
    local p95_threshold_abs="$P95_MS_ABS"
    local p95_threshold_mult=$(echo "$baseline_p95 * $P95_MS_MULT" | bc -l 2>/dev/null || echo "$baseline_p95")
    
    if (( $(echo "$current_p95 > $p95_threshold_abs" | bc -l) )) || \
       (( $(echo "$current_p95 > $p95_threshold_mult" | bc -l) )); then
        violations+=("P95 hash time: ${current_p95}ms (threshold: ${p95_threshold_abs}ms, ${p95_threshold_mult}ms)")
    fi
    
    # Check low confidence queue
    local queue_threshold_abs="$LOW_CONF_QUEUE_ABS"
    local queue_threshold_mult=$(echo "$baseline_queue * $LOW_CONF_QUEUE_MULT" | bc -l 2>/dev/null || echo "$baseline_queue")
    
    if (( $(echo "$current_queue > $queue_threshold_abs" | bc -l) )) || \
       (( $(echo "$current_queue > $queue_threshold_mult" | bc -l) )); then
        violations+=("Low confidence queue: ${current_queue} (threshold: ${queue_threshold_abs}, ${queue_threshold_mult})")
    fi
    
    if [[ ${#violations[@]} -gt 0 ]]; then
        return 1
    else
        return 0
    fi
}

# Trigger rollback
trigger_rollback() {
    local reason="$1"
    
    log_error "Triggering rollback due to: $reason"
    
    if [[ "$NO_ROLLBACK" == "true" ]]; then
        log_warning "Rollback disabled by --no-rollback flag"
        return 0
    fi
    
    if [[ ! -f "$ROLLBACK_SCRIPT" ]]; then
        log_error "Rollback script not found: $ROLLBACK_SCRIPT"
        return 1
    fi
    
    log "Executing rollback script: $ROLLBACK_SCRIPT"
    
    if bash "$ROLLBACK_SCRIPT" --env "$ENVIRONMENT" --no-dry-run --force; then
        log_success "Rollback completed successfully"
        return 0
    else
        log_error "Rollback failed"
        return 1
    fi
}

# Main monitoring loop
run_monitoring_loop() {
    local start_time=$(date +%s)
    local end_time=$((start_time + MONITOR_DURATION))
    local baseline_file="$LOG_DIR/baseline_${ENVIRONMENT}.json"
    local consecutive_failures=0
    local max_consecutive_failures=3
    
    log "Starting monitoring loop for ${MONITOR_DURATION}s"
    log "Fast polling (${FAST_INTERVAL}s) for first ${FAST_PERIOD}s, then slow polling (${SLOW_INTERVAL}s)"
    
    while [[ $(date +%s) -lt $end_time ]]; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        # Determine polling interval
        local interval="$SLOW_INTERVAL"
        if [[ $elapsed -lt $FAST_PERIOD ]]; then
            interval="$FAST_INTERVAL"
        fi
        
        log "Polling health and metrics (elapsed: ${elapsed}s, remaining: $((end_time - current_time))s)"
        
        # Check health endpoint
        local health_response
        health_response=$(fetch_health "$HEALTH_URL")
        
        if [[ -n "$health_response" ]]; then
            local health_status="unknown"
            if command -v jq >/dev/null 2>&1; then
                health_status=$(echo "$health_response" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
            fi
            
            if [[ "$health_status" == "healthy" || "$health_status" == "ok" ]]; then
                log_success "Health check passed: $health_status"
                consecutive_failures=0
            else
                consecutive_failures=$((consecutive_failures + 1))
                log_warning "Health check failed: $health_status (failure $consecutive_failures/$max_consecutive_failures)"
                
                if [[ $consecutive_failures -ge $max_consecutive_failures ]]; then
                    trigger_rollback "Health check failures: $consecutive_failures consecutive failures"
                    return 1
                fi
            fi
        else
            consecutive_failures=$((consecutive_failures + 1))
            log_warning "Health endpoint unreachable (failure $consecutive_failures/$max_consecutive_failures)"
            
            if [[ $consecutive_failures -ge $max_consecutive_failures ]]; then
                trigger_rollback "Health endpoint unreachable: $consecutive_failures consecutive failures"
                return 1
            fi
        fi
        
        # Check metrics endpoint
        local metrics_response
        metrics_response=$(fetch_metrics "$METRICS_URL")
        
        if [[ -n "$metrics_response" && "$metrics_response" != *"error"* ]]; then
            local current_metrics
            current_metrics=$(parse_metrics "$metrics_response" "$baseline_file")
            
            IFS=',' read -r failure_rate p95_time queue_length <<< "$current_metrics"
            log_metric "Current metrics: failure_rate=${failure_rate}%, p95=${p95_time}ms, queue=${queue_length}"
            
            # Check thresholds
            if ! check_thresholds "$current_metrics" "$baseline_file"; then
                log_error "Metrics threshold violations detected"
                trigger_rollback "Metrics threshold violations"
                return 1
            else
                log_success "All metrics within thresholds"
            fi
        else
            log_warning "Could not retrieve metrics"
        fi
        
        # Sleep until next check
        if [[ $((current_time + interval)) -lt $end_time ]]; then
            sleep "$interval"
        else
            # Last iteration, sleep for remaining time
            local remaining=$((end_time - current_time))
            if [[ $remaining -gt 0 ]]; then
                sleep "$remaining"
            fi
        fi
    done
    
    log_success "Monitoring loop completed successfully"
}

# Generate monitoring report
generate_monitoring_report() {
    local start_time="$1"
    local end_time="$2"
    local success="$3"
    
    local duration=$((end_time - start_time))
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local report_file="artifacts/monitor_${ENVIRONMENT}_$(date +%Y%m%d_%H%M%S).json"
    
    mkdir -p artifacts
    
    local report_data="{
  \"monitoring\": {
    \"environment\": \"$ENVIRONMENT\",
    \"timestamp\": \"$timestamp\",
    \"duration_seconds\": $duration,
    \"success\": $success
  },
  \"configuration\": {
    \"health_url\": \"$HEALTH_URL\",
    \"metrics_url\": \"$METRICS_URL\",
    \"monitor_duration\": $MONITOR_DURATION,
    \"fast_interval\": $FAST_INTERVAL,
    \"slow_interval\": $SLOW_INTERVAL,
    \"fast_period\": $FAST_PERIOD
  },
  \"thresholds\": {
    \"extraction_failure_rate_abs\": $EXTRACTION_FAILURE_RATE_ABS,
    \"extraction_failure_rate_mult\": $EXTRACTION_FAILURE_RATE_MULT,
    \"p95_ms_abs\": $P95_MS_ABS,
    \"p95_ms_mult\": $P95_MS_MULT,
    \"low_conf_queue_abs\": $LOW_CONF_QUEUE_ABS,
    \"low_conf_queue_mult\": $LOW_CONF_QUEUE_MULT
  },
  \"log_file\": \"$LOG_FILE\"
}"
    
    echo "$report_data" > "$report_file"
    log_success "Monitoring report created: $report_file"
}

# Main execution function
main() {
    local start_time=$(date +%s)
    
    # Parse arguments
    parse_args "$@"
    
    # Initialize monitoring
    initialize_monitoring
    
    # Run monitoring loop
    local success=true
    if ! run_monitoring_loop; then
        success=false
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Generate report
    generate_monitoring_report "$start_time" "$end_time" "$success"
    
    if [[ "$success" == "true" ]]; then
        log_success "🎉 Monitoring completed successfully"
        log_success "Total execution time: ${duration}s"
    else
        log_error "❌ Monitoring failed or triggered rollback"
        log_error "Total execution time: ${duration}s"
        exit 1
    fi
}

# Handle script errors
trap 'log_error "Monitoring script failed at line $LINENO"' ERR

# Execute main function
main "$@"