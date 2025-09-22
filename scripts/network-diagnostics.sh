#!/usr/bin/env bash
# scripts/network-diagnostics.sh
# Comprehensive diagnostics: DNS checks (multiple resolvers), TLS cert validation,
# traceroute, routing, proxy env vars, and basic system network info.
# Writes a detailed timestamped report to /tmp/network-diagnostics-<timestamp>.txt

set -euo pipefail
IFS=$'\n\t'

TIMESTAMP=$(date +"%Y%m%dT%H%M%S")
OUT="/tmp/network-diagnostics-${TIMESTAMP}.txt"
HOSTS=(
  "api.openai.com"
  "api.elevenlabs.io"
)
if [ -n "${EXTRA_NETWORK_HOSTS:-}" ]; then
  read -r -a EXTRA <<< "$EXTRA_NETWORK_HOSTS"
  HOSTS+=("${EXTRA[@]}")
fi

echo "Network diagnostics report" > "$OUT"
echo "Generated: $(date)" >> "$OUT"
echo "Hostname: $(hostname -f 2>/dev/null || hostname)" >> "$OUT"
echo "Uptime: $(uptime)" >> "$OUT"
echo "" >> "$OUT"

echo "=== Environment variables related to proxy/network ===" >> "$OUT"
env | grep -iE 'proxy|http_proxy|https_proxy|no_proxy' || true >> "$OUT"
echo "" >> "$OUT"

echo "=== /etc/resolv.conf ===" >> "$OUT"
if [ -r /etc/resolv.conf ]; then
  cat /etc/resolv.conf >> "$OUT"
else
  echo "/etc/resolv.conf not readable" >> "$OUT"
fi
echo "" >> "$OUT"

echo "=== IP routing table ===" >> "$OUT"
if command -v ip >/dev/null 2>&1; then
  ip route >> "$OUT" || true
else
  netstat -rn >> "$OUT" || true
fi
echo "" >> "$OUT"

echo "=== Network interfaces ===" >> "$OUT"
if command -v ip >/dev/null 2>&1; then
  ip -brief addr show >> "$OUT" || true
else
  ifconfig -a >> "$OUT" || true
fi
echo "" >> "$OUT"

for H in "${HOSTS[@]}"; do
  echo "=== Host: ${H} ===" >> "$OUT"
  echo "-- Date/time --" >> "$OUT"
  date >> "$OUT"
  echo "" >> "$OUT"

  echo "-- DNS (system resolver) --" >> "$OUT"
  if command -v dig >/dev/null 2>&1; then
    dig +noall +answer "$H" >> "$OUT" || true
  else
    nslookup "$H" >> "$OUT" || true
  fi
  echo "" >> "$OUT"

  echo "-- DNS (public resolvers: 1.1.1.1, 8.8.8.8) --" >> "$OUT"
  if command -v dig >/dev/null 2>&1; then
    echo "Cloudflare (1.1.1.1):" >> "$OUT"
    dig @"1.1.1.1" +short "$H" >> "$OUT" || true
    echo "Google (8.8.8.8):" >> "$OUT"
    dig @"8.8.8.8" +short "$H" >> "$OUT" || true
  fi
  echo "" >> "$OUT"

  echo "-- TLS certificate (openssl s_client) --" >> "$OUT"
  if command -v openssl >/dev/null 2>&1; then
    echo "openssl s_client -servername $H -showcerts -connect $H:443 -brief" >> "$OUT"
    echo | openssl s_client -servername "$H" -connect "${H}:443" -showcerts 2>/dev/null | openssl x509 -noout -text 2>/dev/null || true
  else
    echo "openssl not available; skipping cert check" >> "$OUT"
  fi
  echo "" >> "$OUT"

  echo "-- HTTPS probe (curl verbose) --" >> "$OUT"
  if command -v curl >/dev/null 2>&1; then
    curl -v --max-time 15 "https://${H}/" -o /dev/null 2>>"$OUT" || true
  else
    echo "curl missing; cannot probe HTTPS" >> "$OUT"
  fi
  echo "" >> "$OUT"

  echo "-- traceroute (up to 30 hops) --" >> "$OUT"
  if command -v traceroute >/dev/null 2>&1; then
    traceroute -m 30 "$H" >> "$OUT" || true
  elif command -v tracepath >/dev/null 2>&1; then
    tracepath "$H" >> "$OUT" || true
  else
    echo "traceroute/tracepath not available" >> "$OUT"
  fi
  echo "" >> "$OUT"
done

echo "=== End of report ===" >> "$OUT"
echo "Diagnostics written to: $OUT"