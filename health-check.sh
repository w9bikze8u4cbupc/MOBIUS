#!/bin/bash
set -euo pipefail

# Simple dhash Health Check Script
# Usage: ./health-check.sh [--env production] [--verbose]

ENV="production"
VERBOSE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="$2"
      shift 2
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [[ "$VERBOSE" == "true" ]]; then
  echo "🏥 Running dhash health check for environment: $ENV"
fi

# Simulate health check (replace with actual checks)
SERVICE_STATUS="running"
CPU_USAGE=25
MEMORY_USAGE=40
DISK_USAGE=15
RESPONSE_TIME=150

# Check service status
if [[ "$SERVICE_STATUS" == "running" ]]; then
  if [[ "$VERBOSE" == "true" ]]; then
    echo "✅ Service Status: Running"
  fi
else
  echo "❌ Service Status: Not Running"
  exit 1
fi

# Check resource usage
if [[ $CPU_USAGE -lt 90 ]]; then
  if [[ "$VERBOSE" == "true" ]]; then
    echo "✅ CPU Usage: ${CPU_USAGE}% (OK)"
  fi
else
  echo "❌ CPU Usage: ${CPU_USAGE}% (HIGH)"
  exit 1
fi

if [[ $MEMORY_USAGE -lt 90 ]]; then
  if [[ "$VERBOSE" == "true" ]]; then
    echo "✅ Memory Usage: ${MEMORY_USAGE}% (OK)"
  fi
else
  echo "❌ Memory Usage: ${MEMORY_USAGE}% (HIGH)"
  exit 1
fi

if [[ $DISK_USAGE -lt 95 ]]; then
  if [[ "$VERBOSE" == "true" ]]; then
    echo "✅ Disk Usage: ${DISK_USAGE}% (OK)"
  fi
else
  echo "❌ Disk Usage: ${DISK_USAGE}% (HIGH)"
  exit 1
fi

# Check response time
if [[ $RESPONSE_TIME -lt 2000 ]]; then
  if [[ "$VERBOSE" == "true" ]]; then
    echo "✅ Response Time: ${RESPONSE_TIME}ms (OK)"
  fi
else
  echo "❌ Response Time: ${RESPONSE_TIME}ms (HIGH)"
  exit 1
fi

if [[ "$VERBOSE" == "true" ]]; then
  echo "🎉 All health checks passed!"
fi

exit 0