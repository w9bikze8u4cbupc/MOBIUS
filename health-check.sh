#!/bin/bash
# Health check utility for dhash
# Usage: ./health-check.sh [--endpoint URL] [--timeout SECONDS] [--verbose]

set -euo pipefail

# Default values
ENDPOINT="http://localhost:3000"
TIMEOUT=10
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --endpoint)
      ENDPOINT="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--endpoint URL] [--timeout SECONDS] [--verbose]"
      echo ""
      echo "Options:"
      echo "  --endpoint URL     Base endpoint URL (default: http://localhost:3000)"
      echo "  --timeout SECONDS  Request timeout (default: 10)"
      echo "  --verbose          Enable verbose output"
      echo "  --help             Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Logging functions
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

log_verbose() {
  if [[ "${VERBOSE}" == "true" ]]; then
    log "$@"
  fi
}

# Check health endpoint
check_health() {
  local url="${ENDPOINT}/health"
  log_verbose "Checking health endpoint: ${url}"
  
  local response
  if ! response=$(curl -s -w "%{http_code}" --max-time "${TIMEOUT}" "${url}" 2>/dev/null); then
    echo "❌ UNHEALTHY: Unable to reach health endpoint"
    return 1
  fi
  
  local http_code="${response: -3}"
  local body="${response%???}"
  
  if [[ "${http_code}" == "200" ]]; then
    echo "✅ HEALTHY: Health endpoint responding correctly"
    log_verbose "Response: ${body}"
    return 0
  else
    echo "❌ UNHEALTHY: Health endpoint returned HTTP ${http_code}"
    log_verbose "Response: ${body}"
    return 1
  fi
}

# Check metrics endpoint
check_metrics() {
  local url="${ENDPOINT}/metrics"
  log_verbose "Checking metrics endpoint: ${url}"
  
  local response
  if ! response=$(curl -s -w "%{http_code}" --max-time "${TIMEOUT}" "${url}" 2>/dev/null); then
    echo "⚠️  PARTIAL: Unable to reach metrics endpoint"
    return 2
  fi
  
  local http_code="${response: -3}"
  local body="${response%???}"
  
  if [[ "${http_code}" == "200" ]]; then
    echo "✅ METRICS: Metrics endpoint responding correctly"
    if [[ "${VERBOSE}" == "true" ]]; then
      echo "   Sample metrics:"
      echo "${body}" | head -c 200 | sed 's/^/   /'
      if [[ ${#body} -gt 200 ]]; then
        echo "   ..."
      fi
    fi
    return 0
  else
    echo "⚠️  PARTIAL: Metrics endpoint returned HTTP ${http_code}"
    log_verbose "Response: ${body}"
    return 2
  fi
}

# Check dhash API
check_api() {
  local url="${ENDPOINT}/api/dhash"
  log_verbose "Checking dhash API endpoint: ${url}"
  
  local test_payload='{"test": true}'
  local response
  if ! response=$(curl -s -w "%{http_code}" --max-time "${TIMEOUT}" -X POST \
    -H "Content-Type: application/json" -d "${test_payload}" "${url}" 2>/dev/null); then
    echo "⚠️  API: Unable to reach dhash API endpoint"
    return 2
  fi
  
  local http_code="${response: -3}"
  local body="${response%???}"
  
  if [[ "${http_code}" == "200" || "${http_code}" == "201" ]]; then
    echo "✅ API: dhash API endpoint responding correctly"
    log_verbose "Response: ${body}"
    return 0
  elif [[ "${http_code}" == "400" || "${http_code}" == "422" ]]; then
    echo "✅ API: dhash API endpoint responding (expected validation error)"
    log_verbose "Response: ${body}"
    return 0
  else
    echo "⚠️  API: dhash API returned HTTP ${http_code}"
    log_verbose "Response: ${body}"
    return 2
  fi
}

# Main health check
main() {
  log "Starting dhash health check..."
  log "Endpoint: ${ENDPOINT}"
  log "Timeout: ${TIMEOUT}s"
  
  local health_status=0
  local metrics_status=0
  local api_status=0
  local overall_status=0
  
  # Run checks
  check_health || health_status=$?
  check_metrics || metrics_status=$?
  check_api || api_status=$?
  
  echo ""
  echo "Health Check Summary:"
  echo "===================="
  
  # Determine overall status
  if [[ ${health_status} -eq 0 && ${metrics_status} -eq 0 && ${api_status} -eq 0 ]]; then
    echo "🎉 OVERALL STATUS: HEALTHY"
    overall_status=0
  elif [[ ${health_status} -eq 0 ]]; then
    echo "⚠️  OVERALL STATUS: PARTIALLY HEALTHY"
    echo "   Core health is good, but some endpoints have issues"
    overall_status=1
  else
    echo "❌ OVERALL STATUS: UNHEALTHY"
    echo "   Core health check failed"
    overall_status=2
  fi
  
  echo ""
  echo "Component Status:"
  echo "  Health endpoint: $([ ${health_status} -eq 0 ] && echo '✅ OK' || echo '❌ FAIL')"
  echo "  Metrics endpoint: $([ ${metrics_status} -eq 0 ] && echo '✅ OK' || echo '⚠️ ISSUES')"
  echo "  API endpoint: $([ ${api_status} -eq 0 ] && echo '✅ OK' || echo '⚠️ ISSUES')"
  
  return ${overall_status}
}

# Run main function
main "$@"