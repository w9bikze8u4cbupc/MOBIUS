#!/usr/bin/env bash
set -euo pipefail

# monitor_dhash.sh
# Usage: MONITOR_DURATION=3600 HEALTH_URL=http://localhost:5000 METRICS_URL=http://localhost:5000/metrics/dhash ./scripts/monitor_dhash.sh
# Default behavior: 60-minute monitoring window, first checks every 30s for 5 minutes, then every 120s.

# Configurable env vars (defaults safe)
HEALTH_URL="${HEALTH_URL:-http://localhost:5000/health}"
METRICS_URL="${METRICS_URL:-http://localhost:5000/metrics/dhash}"
ROLLBACK_SCRIPT="${ROLLBACK_SCRIPT:-./scripts/rollback_dhash.sh}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
MONITOR_DURATION="${MONITOR_DURATION:-3600}"   # seconds (default 60 minutes)
FAST_INTERVAL="${FAST_INTERVAL:-30}"           # first-phase interval
SLOW_INTERVAL="${SLOW_INTERVAL:-120}"          # regular interval
FAST_PERIOD="${FAST_PERIOD:-300}"              # first-phase duration in seconds (5 min)

# Thresholds (tunable)
EXTRACTION_FAILURE_RATE_ABS="${EXTRACTION_FAILURE_RATE_ABS:-10.0}"  # percent
EXTRACTION_FAILURE_RATE_MULT="${EXTRACTION_FAILURE_RATE_MULT:-3}"   # x baseline
P95_MS_ABS="${P95_MS_ABS:-30000}"     # 30s
P95_MS_MULT="${P95_MS_MULT:-3}"
LOW_CONF_QUEUE_ABS="${LOW_CONF_QUEUE_ABS:-100}"
LOW_CONF_QUEUE_MULT="${LOW_CONF_QUEUE_MULT:-5}"

LOG_DIR="${LOG_DIR:-monitor_logs}"
mkdir -p "$LOG_DIR"

start_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "monitor_dhash starting at $start_ts" | tee "$LOG_DIR/monitor_start.log"

end_time=$(( $(date +%s) + MONITOR_DURATION ))
consecutive_health_failures=0
sampling=0

baseline_p95_ms=0
baseline_extraction_rate=0
baseline_low_conf=0

# Helper: get latest verified backup
get_latest_backup() {
  ls -1 "${BACKUP_DIR}"/dhash_*.zip 2>/dev/null | sort -r | head -n1 || true
}

# Helper: fetch JSON with timeout; returns empty on failure
fetch_json() {
  local url="$1"
  curl -fsS --max-time 10 "$url" || echo ""
}

should_trigger_rollback() {
  local p95_ms="$1"
  local extraction_rate="$2"
  local low_conf="$3"

  # Check absolute thresholds
  if (( p95_ms > P95_MS_ABS )); then
    echo "p95_ms $p95_ms > abs threshold $P95_MS_ABS" | tee -a "$LOG_DIR/monitor_events.log"
    return 0
  fi
  if (( $(echo "$extraction_rate > $EXTRACTION_FAILURE_RATE_ABS" | bc -l) )); then
    echo "extraction_rate $extraction_rate > abs threshold $EXTRACTION_FAILURE_RATE_ABS" | tee -a "$LOG_DIR/monitor_events.log"
    return 0
  fi
  if (( low_conf > LOW_CONF_QUEUE_ABS )); then
    echo "low_conf_queue $low_conf > abs threshold $LOW_CONF_QUEUE_ABS" | tee -a "$LOG_DIR/monitor_events.log"
    return 0
  fi

  # Check multiplicative thresholds if baseline set
  if (( $(echo "$baseline_p95_ms > 0" | bc -l) )); then
    if (( $(echo "$p95_ms > ($baseline_p95_ms * $P95_MS_MULT)" | bc -l) )); then
      echo "p95_ms $p95_ms > baseline*mult ($baseline_p95_ms * $P95_MS_MULT)" | tee -a "$LOG_DIR/monitor_events.log"
      return 0
    fi
  fi
  if (( $(echo "$baseline_extraction_rate > 0" | bc -l) )); then
    if (( $(echo "$extraction_rate > ($baseline_extraction_rate * $EXTRACTION_FAILURE_RATE_MULT)" | bc -l) )); then
      echo "extraction_rate $extraction_rate > baseline*mult ($baseline_extraction_rate * $EXTRACTION_FAILURE_RATE_MULT)" | tee -a "$LOG_DIR/monitor_events.log"
      return 0
    fi
  fi
  if (( baseline_low_conf > 0 )); then
    if (( low_conf > (baseline_low_conf * LOW_CONF_QUEUE_MULT) )); then
      echo "low_conf_queue $low_conf > baseline*mult ($baseline_low_conf * $LOW_CONF_QUEUE_MULT)" | tee -a "$LOG_DIR/monitor_events.log"
      return 0
    fi
  fi

  return 1
}

# Main loop
while [ "$(date +%s)" -le "$end_time" ]; do
  sampling=$((sampling + 1))
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "[$now] monitor sample #$sampling" | tee -a "$LOG_DIR/monitor_samples.log"

  # Fetch health
  health_json=$(fetch_json "$HEALTH_URL")
  if [ -z "$health_json" ]; then
    consecutive_health_failures=$((consecutive_health_failures + 1))
    echo "[$now] health fetch failed (attempt #$consecutive_health_failures)" | tee -a "$LOG_DIR/monitor_events.log"
  else
    consecutive_health_failures=0
    echo "$health_json" | jq '.' >> "$LOG_DIR/monitor_health_samples.json" 2>/dev/null || true
  fi

  # Fetch metrics
  metrics_json=$(fetch_json "$METRICS_URL")
  if [ -n "$metrics_json" ]; then
    echo "$metrics_json" | jq '.' >> "$LOG_DIR/monitor_metrics_samples.json" 2>/dev/null || true
    # Extract fields (fallback to zero)
    p95_ms=$(echo "$metrics_json" | jq -r '.p95_hash_time // 0' 2>/dev/null || echo 0)
    extraction_rate=$(echo "$metrics_json" | jq -r '.extraction_failures_rate // 0' 2>/dev/null || echo 0)
    low_conf=$(echo "$metrics_json" | jq -r '.low_confidence_queue_length // 0' 2>/dev/null || echo 0)

    # Convert p95 to integer if decimal present
    p95_ms_int=${p95_ms%.*}
    extraction_rate_float="$extraction_rate"
    low_conf_int=${low_conf%.*}
  else
    p95_ms_int=0
    extraction_rate_float=0
    low_conf_int=0
  fi

  # Establish baseline on first sampling
  if [ "$sampling" -eq 1 ]; then
    baseline_p95_ms=$p95_ms_int
    baseline_extraction_rate=$extraction_rate_float
    baseline_low_conf=$low_conf_int
    echo "Baseline established: p95=$baseline_p95_ms ms, extraction_rate=$baseline_extraction_rate, low_conf=$baseline_low_conf" | tee -a "$LOG_DIR/monitor_events.log"
  fi

  # Health check consecutive failures
  if [ "$consecutive_health_failures" -ge 3 ]; then
    echo "Health endpoint failed $consecutive_health_failures times, initiating rollback" | tee -a "$LOG_DIR/monitor_events.log"
    trigger_reason="health_endpoint_failures"
    break
  fi

  # Decision to rollback
  if should_trigger_rollback "$p95_ms_int" "$extraction_rate_float" "$low_conf_int"; then
    echo "Rollback condition met at sample #$sampling" | tee -a "$LOG_DIR/monitor_events.log"
    trigger_reason="metrics_threshold_exceeded"
    break
  fi

  # Determine interval
  elapsed=$(( $(date +%s) - $(date -d "$start_ts" +%s 2>/dev/null || echo 0) ))
  if [ "$elapsed" -lt "$FAST_PERIOD" ]; then
    sleep "$FAST_INTERVAL"
  else
    sleep "$SLOW_INTERVAL"
  fi
done

# If trigger_reason set -> perform rollback
if [ -n "${trigger_reason:-}" ]; then
  echo "Trigger reason: $trigger_reason" | tee -a "$LOG_DIR/monitor_events.log"
  # pick latest verified backup
  latest_backup=$(get_latest_backup)
  if [ -z "$latest_backup" ]; then
    echo "No backup found in ${BACKUP_DIR}. Aborting auto-rollback; notify ops manually." | tee -a "$LOG_DIR/monitor_events.log"
    exit 2
  fi

  # Verify sha
  sha_file="${latest_backup}.sha256"
  if [ ! -f "$sha_file" ]; then
    echo "Checksum file $sha_file missing. Aborting auto-rollback; notify ops." | tee -a "$LOG_DIR/monitor_events.log"
    exit 3
  fi

  echo "Verifying backup $latest_backup" | tee -a "$LOG_DIR/monitor_events.log"
  if ! sha256sum -c "$sha_file" >> "$LOG_DIR/monitor_events.log" 2>&1; then
    echo "Backup verification failed for $latest_backup. Aborting auto-rollback; notify ops." | tee -a "$LOG_DIR/monitor_events.log"
    exit 4
  fi

  echo "Running rollback script: $ROLLBACK_SCRIPT --backup $latest_backup" | tee -a "$LOG_DIR/monitor_events.log"
  if "$ROLLBACK_SCRIPT" --backup "$latest_backup" >> "$LOG_DIR/monitor_events.log" 2>&1; then
    echo "Rollback completed successfully." | tee -a "$LOG_DIR/monitor_events.log"
    # post-rollback health
    sleep 5
    curl -fsS "$HEALTH_URL" | jq '.' >> "$LOG_DIR/monitor_events.log" 2>&1 || true
    exit 0
  else
    echo "Rollback script failed. Check $LOG_DIR/monitor_events.log and notify ops." | tee -a "$LOG_DIR/monitor_events.log"
    exit 5
  fi
else
  echo "Monitoring completed with no rollback triggers." | tee -a "$LOG_DIR/monitor_events.log"
  exit 0
fi