#!/bin/bash
# Monitor Script
# Monitors application health with T+60 auto-rollback capability

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
MONITOR_DURATION="${MONITOR_DURATION:-300}"  # 5 minutes default
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"        # 30 seconds between checks
FAILURE_THRESHOLD="${FAILURE_THRESHOLD:-3}"   # 3 consecutive failures trigger rollback
AUTO_ROLLBACK="${AUTO_ROLLBACK:-true}"

log() {
  echo "[MONITOR] $(date '+%Y-%m-%d %H:%M:%S') - $*"
}

check_health() {
  local health_url="$BASE_URL/health"
  local response
  local http_code
  
  # Try health endpoint first
  if response=$(curl -s --max-time 10 -w "HTTP_CODE:%{http_code}" "$health_url" 2>/dev/null); then
    http_code=$(echo "$response" | grep -o 'HTTP_CODE:[0-9]*' | cut -d: -f2)
    response_body=$(echo "$response" | sed 's/HTTP_CODE:[0-9]*$//')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 400 ]; then
      if echo "$response_body" | grep -q "ok\\|healthy\\|up"; then
        return 0  # Healthy
      fi
    fi
  fi
  
  # Fallback: check main endpoint
  if http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/" 2>/dev/null); then
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 400 ]; then
      return 0  # Healthy
    fi
  fi
  
  return 1  # Unhealthy
}

trigger_rollback() {
  log "CRITICAL: Triggering automatic rollback due to consecutive health failures"
  
  if [ "$AUTO_ROLLBACK" = "true" ]; then
    if [ -f "scripts/deploy/rollback_dhash.sh" ]; then
      log "Executing rollback script"
      bash scripts/deploy/rollback_dhash.sh
      return $?
    else
      log "ERROR: Rollback script not found at scripts/deploy/rollback_dhash.sh"
      return 1
    fi
  else
    log "Auto-rollback disabled - manual intervention required"
    return 1
  fi
}

send_alert() {
  local message="$1"
  local severity="${2:-warning}"
  
  log "ALERT [$severity]: $message"
  
  # Send notification if notify script exists
  if [ -f "scripts/deploy/notify.js" ]; then
    node scripts/deploy/notify.js --message "$message" --severity "$severity" || true
  fi
  
  # Set GitHub output for CI
  echo "ALERT_MESSAGE=$message" >> $GITHUB_OUTPUT 2>/dev/null || true
  echo "ALERT_SEVERITY=$severity" >> $GITHUB_OUTPUT 2>/dev/null || true
}

main() {
  log "Starting health monitoring for $MONITOR_DURATION seconds"
  log "Check interval: $CHECK_INTERVAL seconds"
  log "Failure threshold: $FAILURE_THRESHOLD consecutive failures"
  log "Auto-rollback: $AUTO_ROLLBACK"
  
  local start_time=$(date +%s)
  local consecutive_failures=0
  local total_checks=0
  local failed_checks=0
  
  while true; do
    local current_time=$(date +%s)
    local elapsed=$((current_time - start_time))
    
    # Check if monitoring duration exceeded
    if [ $elapsed -ge $MONITOR_DURATION ]; then
      log "Monitoring duration completed"
      break
    fi
    
    ((total_checks++))
    
    if check_health; then
      if [ $consecutive_failures -gt 0 ]; then
        log "Health check passed - resetting failure count"
        send_alert "Application recovered after $consecutive_failures consecutive failures" "info"
      fi
      consecutive_failures=0
      log "✓ Health check passed ($total_checks checks, $failed_checks failures)"
    else
      ((consecutive_failures++))
      ((failed_checks++))
      log "✗ Health check failed (consecutive failures: $consecutive_failures/$FAILURE_THRESHOLD)"
      
      if [ $consecutive_failures -ge $FAILURE_THRESHOLD ]; then
        send_alert "CRITICAL: $consecutive_failures consecutive health check failures - triggering rollback" "critical"
        
        if trigger_rollback; then
          log "Rollback completed successfully"
          send_alert "Rollback completed successfully" "info"
          echo "ROLLBACK_TRIGGERED=true" >> $GITHUB_OUTPUT 2>/dev/null || true
          exit 0
        else
          log "Rollback failed - manual intervention required"
          send_alert "CRITICAL: Automatic rollback failed - manual intervention required" "critical"
          echo "ROLLBACK_FAILED=true" >> $GITHUB_OUTPUT 2>/dev/null || true
          exit 1
        fi
      else
        send_alert "Health check failure ($consecutive_failures/$FAILURE_THRESHOLD)" "warning"
      fi
    fi
    
    sleep $CHECK_INTERVAL
  done
  
  local success_rate=$(( (total_checks - failed_checks) * 100 / total_checks ))
  log "Monitoring completed: $success_rate% success rate ($total_checks total checks, $failed_checks failures)"
  
  echo "MONITORING_SUCCESS_RATE=$success_rate" >> $GITHUB_OUTPUT 2>/dev/null || true
  echo "TOTAL_HEALTH_CHECKS=$total_checks" >> $GITHUB_OUTPUT 2>/dev/null || true
  echo "FAILED_HEALTH_CHECKS=$failed_checks" >> $GITHUB_OUTPUT 2>/dev/null || true
  
  if [ $success_rate -lt 90 ]; then
    log "WARNING: Success rate below 90% - consider investigation"
    exit 1
  fi
}

main "$@"
