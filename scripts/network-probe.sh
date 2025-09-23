#!/usr/bin/env bash
set -uo pipefail

# Usage: ./scripts/network-probe.sh [output_dir]
# Example: ./scripts/network-probe.sh artifacts

OUTPUT_DIR="${1:-artifacts}"
mkdir -p "$OUTPUT_DIR"
LOG="$OUTPUT_DIR/network-probe.log"
JSON="$OUTPUT_DIR/network-diagnostics.json"
DIG_LOG="$OUTPUT_DIR/dig.log"
TR_LOG="$OUTPUT_DIR/traceroute.log"
OPENSSL_LOG="$OUTPUT_DIR/openssl.log"

TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"

# Endpoint list: host|port|label
ENDPOINTS=(
  "api.openai.com|443|OpenAI API"
  "api.elevenlabs.io|443|ElevenLabs API"
  "boardgamegeek.com|443|BoardGameGeek API"
  "media.boardgamegeek.com|443|BoardGameGeek Media"
  "extract.pics|443|Extract.pics API"
)

# Mock flags (per-service)
MOCK_OPENAI=${MOCK_OPENAI:-false}
MOCK_ELEVENLABS=${MOCK_ELEVENLABS:-false}
MOCK_BGG=${MOCK_BGG:-false}
MOCK_EXTRACT_PICS=${MOCK_EXTRACT_PICS:-false}
# Full mock mode
FULL_MOCK=${FULL_MOCK:-false}

# helpers
cmd_exists() { command -v "$1" >/dev/null 2>&1; }
log() { printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" | tee -a "$LOG"; }

results_json="[]"
passed=0
failed=0
warnings=0

log "Starting network probe — output dir: $OUTPUT_DIR"

for entry in "${ENDPOINTS[@]}"; do
  IFS='|' read -r host port label <<< "$entry"
  short_name="$host"
  log "=== Testing $label ($host:$port) ==="

  status_overall="passed"
  dns_status="skipped"
  tcp_status="skipped"
  http_status="skipped"
  tls_status="skipped"
  mock_mode=false

  # Check per-service mock
  if [ "$FULL_MOCK" = "true" ] \
    || { [ "$host" = "api.openai.com" ] && [ "$MOCK_OPENAI" = "true" ]; } \
    || { [ "$host" = "api.elevenlabs.io" ] && [ "$MOCK_ELEVENLABS" = "true" ]; } \
    || { [[ "$host" =~ boardgamegeek ]] && [ "$MOCK_BGG" = "true" ]; } \
    || { [ "$host" = "extract.pics" ] && [ "$MOCK_EXTRACT_PICS" = "true" ]; }; then
    mock_mode=true
    log "Mock mode enabled for $host — skipping network checks"
    dns_status="mocked"
    tcp_status="mocked"
    http_status="mocked"
    tls_status="mocked"
    status_overall="mocked"
  else
    # DNS: dig or nslookup
    if cmd_exists dig; then
      log "DNS: running dig +short $host"
      dig +short "$host" >>"$DIG_LOG" 2>&1 || true
      dns_out=$(dig +short "$host" 2>/dev/null || true)
      if [ -z "$dns_out" ]; then
        dns_status="failed"
        status_overall="failed"
        log "DNS: failed to resolve $host"
      else
        dns_status="passed"
        log "DNS: resolved $host -> $(echo "$dns_out" | head -n1)"
      fi
    elif cmd_exists nslookup; then
      log "DNS: running nslookup $host"
      nslookup "$host" >>"$DIG_LOG" 2>&1 || true
      if nslookup "$host" >/dev/null 2>&1; then
        dns_status="passed"
        log "DNS: nslookup succeeded for $host"
      else
        dns_status="failed"
        status_overall="failed"
        log "DNS: nslookup failed for $host"
      fi
    else
      dns_status="warning"
      status_overall="warning"
      warnings=$((warnings+1))
      log "DNS: neither dig nor nslookup available; skipping DNS test"
    fi

    # TCP check
    if [ "$dns_status" = "passed" ]; then
      if cmd_exists nc; then
        log "TCP: testing nc -vz -w 5 $host $port"
        if nc -vz -w 5 "$host" "$port" >>"$LOG" 2>&1; then
          tcp_status="passed"
          log "TCP: $host:$port reachable"
        else
          tcp_status="failed"
          status_overall="failed"
          log "TCP: $host:$port NOT reachable (nc)"
        fi
      else
        # bash /dev/tcp fallback
        if (exec 3<>/dev/tcp/"$host"/"$port") >/dev/null 2>&1; then
          tcp_status="passed"
          log "TCP: $host:$port reachable via /dev/tcp"
          exec 3>&-
        else
          tcp_status="failed"
          status_overall="failed"
          log "TCP: $host:$port NOT reachable (no nc, /dev/tcp failed)"
        fi
      fi
    else
      tcp_status="skipped"
      log "TCP: skipped due to DNS failure"
    fi

    # HTTP check (only if tcp passed)
    if [ "$tcp_status" = "passed" ]; then
      if cmd_exists curl; then
        log "HTTP: curl -I --max-time 10 https://$host/"
        if curl -I --max-time 10 -sS "https://$host/" >>"$LOG" 2>&1; then
          http_status="passed"
          log "HTTP: https://$host/ responded"
        else
          http_status="failed"
          status_overall="failed"
          log "HTTP: https://$host/ request failed"
        fi
      elif cmd_exists wget; then
        log "HTTP: wget --spider --timeout=10 https://$host/"
        if wget --spider --timeout=10 "https://$host/" >>"$LOG" 2>&1; then
          http_status="passed"
          log "HTTP: https://$host/ responded (wget)"
        else
          http_status="failed"
          status_overall="failed"
          log "HTTP: https://$host/ request failed (wget)"
        fi
      else
        http_status="warning"
        status_overall="warning"
        warnings=$((warnings+1))
        log "HTTP: neither curl nor wget available; skipping HTTP test"
      fi
    else
      http_status="skipped"
    fi

    # TLS handshake check
    if [ "$tcp_status" = "passed" ] && cmd_exists openssl; then
      log "TLS: openssl s_client -connect $host:$port -servername $host (timeout 8s)"
      if timeout 8 openssl s_client -connect "$host":"$port" -servername "$host" < /dev/null > "$OPENSSL_LOG" 2>&1; then
        # Check for certificate text in openssl log
        if grep -q "-----BEGIN CERTIFICATE-----" "$OPENSSL_LOG" 2>/dev/null; then
          tls_status="passed"
          log "TLS: handshake OK for $host"
        else
          tls_status="failed"
          status_overall="failed"
          log "TLS: handshake failed or no certificate presented for $host"
        fi
      else
        tls_status="failed"
        status_overall="failed"
        log "TLS: openssl handshake timed out/failed for $host"
      fi
    elif [ "$tcp_status" = "passed" ]; then
      tls_status="warning"
      status_overall="warning"
      warnings=$((warnings+1))
      log "TLS: openssl not available; could not test TLS handshake"
    else
      tls_status="skipped"
    fi

    # traceroute (only if failure)
    if [ "$status_overall" = "failed" ]; then
      if cmd_exists traceroute; then
        log "TRACEROUTE: traceroute -n $host"
        traceroute -n "$host" >>"$TR_LOG" 2>&1 || true
      elif cmd_exists tracepath; then
        log "TRACEROUTE: tracepath $host"
        tracepath "$host" >>"$TR_LOG" 2>&1 || true
      else
        log "TRACEROUTE: traceroute/tracepath not available; skipping"
      fi
    fi
  fi

  # Build JSON object for this endpoint (manual string assembly)
  obj=$(cat <<JSON
{
  "name": "$(echo "$label" | sed 's/"/\\"/g')",
  "endpoint": {"host":"$host","port":$port},
  "overall_status":"$status_overall",
  "tests": {
    "dns": {"status":"$dns_status"},
    "tcp": {"status":"$tcp_status"},
    "http": {"status":"$http_status"},
    "tls": {"status":"$tls_status"}
  }$( [ "$mock_mode" = true ] && echo ', "mock_mode": true' || echo '' )
}
JSON
)
  # Append to results_json array (without jq)
  if [ "$results_json" = "[]" ]; then
    results_json="[$obj]"
  else
    results_json="${results_json%]}, $obj]"
  fi

  if [ "$status_overall" = "passed" ] || [ "$status_overall" = "mocked" ]; then
    passed=$((passed+1))
  elif [ "$status_overall" = "failed" ]; then
    failed=$((failed+1))
  else
    warnings=$((warnings+1))
  fi
done

# Build final JSON (results_json is already a JSON array)
cat > "$JSON" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "platform": "$PLATFORM",
  "results": $results_json,
  "summary": {
    "passed": $passed,
    "failed": $failed,
    "warnings": $warnings
  }
}
EOF

log "Probe finished — summary: passed=$passed failed=$failed warnings=$warnings"
log "JSON written to $JSON"
log "Detailed logs: $DIG_LOG $TR_LOG $OPENSSL_LOG"

# exit with number of failed endpoints (0 = success)
if [ "$failed" -gt 0 ]; then
  exit $(( failed > 255 ? 255 : failed ))
else
  exit 0
fi