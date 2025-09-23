#!/bin/bash
# Network probe script to test connectivity to external APIs
# Usage: ./network-probe.sh [artifacts_dir]

set -euo pipefail

ARTIFACTS_DIR="${1:-artifacts}"
LOG_FILE="${ARTIFACTS_DIR}/network-probe.log"
DIAGNOSTICS_FILE="${ARTIFACTS_DIR}/network-diagnostics.json"

# Create artifacts directory if it doesn't exist
mkdir -p "${ARTIFACTS_DIR}"

# Initialize log file
echo "Network probe started at $(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "${LOG_FILE}"

# Test endpoints - based on the API calls I see in the codebase
declare -a ENDPOINTS=(
    "api.openai.com:443"
    "api.elevenlabs.io:443" 
    "boardgamegeek.com:443"
    "extract.pics:443"
)

# Initialize diagnostics JSON
cat > "${DIAGNOSTICS_FILE}" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "results": [],
  "summary": {
    "passed": 0,
    "failed": 0,
    "warnings": 0
  }
}
EOF

OVERALL_EXIT_CODE=0
PASSED_COUNT=0
FAILED_COUNT=0

# Function to log both to console and file
log() {
    echo "$1" | tee -a "${LOG_FILE}"
}

# Function to test DNS resolution
test_dns() {
    local host=$1
    local result=""
    
    if command -v dig >/dev/null 2>&1; then
        result=$(dig +short +timeout=5 "${host}" 2>&1 || echo "FAILED")
        echo "${result}" > "${ARTIFACTS_DIR}/dig_${host//[^a-zA-Z0-9]/_}.log"
    elif command -v nslookup >/dev/null 2>&1; then
        result=$(nslookup "${host}" 2>&1 | grep -E "Address|answer" || echo "FAILED")
        echo "${result}" > "${ARTIFACTS_DIR}/nslookup_${host//[^a-zA-Z0-9]/_}.log"
    else
        result="No DNS tools available"
    fi
    
    if [[ "${result}" == "FAILED" ]] || [[ "${result}" == *"NXDOMAIN"* ]] || [[ "${result}" == *"No DNS tools available"* ]]; then
        return 1
    fi
    return 0
}

# Function to test TCP connectivity
test_tcp() {
    local host=$1
    local port=$2
    local timeout=10
    
    if command -v nc >/dev/null 2>&1; then
        if nc -z -w "${timeout}" "${host}" "${port}" 2>/dev/null; then
            return 0
        fi
    elif command -v telnet >/dev/null 2>&1; then
        if timeout "${timeout}" telnet "${host}" "${port}" </dev/null >/dev/null 2>&1; then
            return 0
        fi
    else
        # Fallback: try to connect with bash
        if timeout "${timeout}" bash -c "</dev/tcp/${host}/${port}" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

# Function to test HTTP(S) connectivity
test_http() {
    local host=$1
    local url="https://${host}/"
    
    if command -v curl >/dev/null 2>&1; then
        if curl -v --max-time 10 --connect-timeout 5 --fail -o /dev/null "${url}" >/dev/null 2>"${ARTIFACTS_DIR}/curl_${host//[^a-zA-Z0-9]/_}.log"; then
            return 0
        fi
    elif command -v wget >/dev/null 2>&1; then
        if wget --timeout=10 --connect-timeout=5 -q -O /dev/null "${url}" 2>"${ARTIFACTS_DIR}/wget_${host//[^a-zA-Z0-9]/_}.log"; then
            return 0
        fi
    fi
    return 1
}

# Function to test TLS handshake
test_tls() {
    local host=$1
    local port=$2
    
    if command -v openssl >/dev/null 2>&1; then
        if echo | timeout 10 openssl s_client -connect "${host}:${port}" -servername "${host}" >/dev/null 2>"${ARTIFACTS_DIR}/openssl_${host//[^a-zA-Z0-9]/_}.log"; then
            return 0
        fi
    fi
    return 1
}

# Function to run traceroute
run_traceroute() {
    local host=$1
    
    if command -v traceroute >/dev/null 2>&1; then
        timeout 30 traceroute -n -m 10 "${host}" > "${ARTIFACTS_DIR}/traceroute_${host//[^a-zA-Z0-9]/_}.log" 2>&1 || true
    elif command -v tracert >/dev/null 2>&1; then
        timeout 30 tracert -h 10 "${host}" > "${ARTIFACTS_DIR}/tracert_${host//[^a-zA-Z0-9]/_}.log" 2>&1 || true
    fi
}

# Function to add result to JSON
add_result() {
    local name=$1
    local host=$2
    local port=$3
    local overall_status=$4
    local dns_status=$5
    local tcp_status=$6
    local http_status=$7
    local tls_status=$8
    
    # Create temporary file for JSON manipulation
    local temp_file=$(mktemp)
    
    # Use python/node to update JSON if available, otherwise use basic sed
    if command -v python3 >/dev/null 2>&1; then
        python3 -c "
import json
import sys

with open('${DIAGNOSTICS_FILE}', 'r') as f:
    data = json.load(f)

data['results'].append({
    'name': '${name}',
    'endpoint': {'host': '${host}', 'port': ${port}},
    'overall_status': '${overall_status}',
    'tests': {
        'dns': {'status': '${dns_status}'},
        'tcp': {'status': '${tcp_status}'},
        'http': {'status': '${http_status}'},
        'tls': {'status': '${tls_status}'}
    }
})

if '${overall_status}' == 'passed':
    data['summary']['passed'] += 1
else:
    data['summary']['failed'] += 1

with open('${DIAGNOSTICS_FILE}', 'w') as f:
    json.dump(data, f, indent=2)
"
    else
        # Basic fallback without JSON manipulation
        echo "Result: ${name} -> ${overall_status}" >> "${LOG_FILE}"
    fi
}

log "Starting network connectivity tests..."

# Test each endpoint
for endpoint in "${ENDPOINTS[@]}"; do
    IFS=':' read -r host port <<< "${endpoint}"
    log "Testing ${host}:${port}..."
    
    # Initialize test results
    dns_status="unknown"
    tcp_status="unknown"
    http_status="unknown"
    tls_status="unknown"
    overall_status="failed"
    
    # Test DNS
    if test_dns "${host}"; then
        dns_status="passed"
        log "  DNS: PASS"
    else
        dns_status="failed"
        log "  DNS: FAIL"
    fi
    
    # Test TCP (only if DNS passed)
    if [[ "${dns_status}" == "passed" ]]; then
        if test_tcp "${host}" "${port}"; then
            tcp_status="passed"
            log "  TCP: PASS"
        else
            tcp_status="failed"
            log "  TCP: FAIL"
        fi
    else
        tcp_status="skipped"
        log "  TCP: SKIPPED (DNS failed)"
    fi
    
    # Test HTTP (only if TCP passed)
    if [[ "${tcp_status}" == "passed" ]]; then
        if test_http "${host}"; then
            http_status="passed"
            log "  HTTP: PASS"
        else
            http_status="failed"
            log "  HTTP: FAIL"
        fi
    else
        http_status="skipped"
        log "  HTTP: SKIPPED (TCP failed or skipped)"
    fi
    
    # Test TLS (only if TCP passed)
    if [[ "${tcp_status}" == "passed" ]]; then
        if test_tls "${host}" "${port}"; then
            tls_status="passed"
            log "  TLS: PASS"
        else
            tls_status="failed"
            log "  TLS: FAIL"
        fi
    else
        tls_status="skipped"
        log "  TLS: SKIPPED (TCP failed or skipped)"
    fi
    
    # Determine overall status
    if [[ "${dns_status}" == "passed" ]] && [[ "${tcp_status}" == "passed" ]] && [[ "${http_status}" == "passed" ]] && [[ "${tls_status}" == "passed" ]]; then
        overall_status="passed"
        PASSED_COUNT=$((PASSED_COUNT + 1))
        log "  Overall: PASS"
    else
        overall_status="failed"
        FAILED_COUNT=$((FAILED_COUNT + 1))
        OVERALL_EXIT_CODE=1
        log "  Overall: FAIL"
        
        # Run traceroute for failed endpoints
        log "  Running traceroute for diagnostic info..."
        run_traceroute "${host}"
    fi
    
    # Add result to JSON
    add_result "${host}" "${host}" "${port}" "${overall_status}" "${dns_status}" "${tcp_status}" "${http_status}" "${tls_status}"
    
    log ""
done

# Final summary
log "Network probe completed at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
log "Summary: ${PASSED_COUNT} passed, ${FAILED_COUNT} failed"

if [[ ${FAILED_COUNT} -gt 0 ]]; then
    log "FAILURE: Some network connectivity tests failed."
    log "Check individual log files in ${ARTIFACTS_DIR}/ for detailed diagnostics."
else
    log "SUCCESS: All network connectivity tests passed."
fi

# List generated artifact files
log ""
log "Generated diagnostic files:"
find "${ARTIFACTS_DIR}" -type f -name "*.log" -o -name "*.json" | sort | while read -r file; do
    log "  ${file}"
done

exit ${OVERALL_EXIT_CODE}