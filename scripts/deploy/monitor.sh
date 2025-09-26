#!/usr/bin/env bash
set -euo pipefail
# monitor.sh - runs a T+60 monitoring window and triggers auto-rollback on thresholds
ENV="production"
DURATION=3600
AUTO_ROLLBACK=false
POLL_FAST_SEC=30
POLL_SLOW_SEC=120
END_TIME=$(( $(date +%s) + DURATION ))
CONSECUTIVE_HEALTH_FAILURES=0
MAX_CONSECUTIVE=3
CHECKS=0

print_help(){ echo "Usage: monitor.sh --env <env> --duration <seconds> [--auto-rollback]"; }

while [[ ${#} -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2;;
    --duration) DURATION="$2"; END_TIME=$(( $(date +%s) + DURATION )); shift 2;;
    --auto-rollback) AUTO_ROLLBACK=true; shift;;
    --help) print_help; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

echo "Starting monitor for env=${ENV} duration=${DURATION}s auto-rollback=${AUTO_ROLLBACK}"
while [[ $(date +%s) -lt ${END_TIME} ]]; do
  CHECKS=$((CHECKS+1))
  # Placeholder health check - replace with real endpoint
  if curl -fsS --max-time 5 "https://127.0.0.1/health" >/dev/null 2>&1; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) HEALTH=OK"
    CONSECUTIVE_HEALTH_FAILURES=0
  else
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) HEALTH=FAIL"
    CONSECUTIVE_HEALTH_FAILURES=$((CONSECUTIVE_HEALTH_FAILURES+1))
  fi

  if [[ ${CONSECUTIVE_HEALTH_FAILURES} -ge ${MAX_CONSECUTIVE} ]]; then
    echo "Detected ${CONSECUTIVE_HEALTH_FAILURES} consecutive failures"
    if [[ "${AUTO_ROLLBACK}" == "true" ]]; then
      echo "Auto-rollback enabled: initiating rollback"
      # attempt to find latest backup
      LATEST_BACKUP=$(ls -1 backups/dhash_${ENV}_*.zip 2>/dev/null | sort -r | head -n1 || true)
      if [[ -n "${LATEST_BACKUP}" ]]; then
        sha256sum -c "${LATEST_BACKUP}.sha256" && ./scripts/deploy/rollback_dhash.sh --backup "${LATEST_BACKUP}" --env "${ENV}" --reason "auto-monitor"
        exit 0
      else
        echo "No backup found; alert operators"
        exit 2
      fi
    else
      echo "Auto-rollback disabled; alert operators"
    fi
  fi

  # adaptive polling cadence
  if [[ $CHECKS -le 10 ]]; then
    sleep ${POLL_FAST_SEC}
  else
    sleep ${POLL_SLOW_SEC}
  fi
done

echo "Monitoring window complete"
