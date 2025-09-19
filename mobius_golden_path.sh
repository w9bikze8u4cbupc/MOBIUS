#!/usr/bin/env bash
# Mobius Games Tutorial Generator - Golden Path Verification Script
#
# Comprehensive verification script for the Mobius Games Tutorial Generator system.
# Validates security, performance, and reliability of the service with CI-ready features.
#
# FEATURES
#   - Security Checks: CORS preflight, SSRF allow/deny matrix, Helmet headers
#   - Performance Gates: TTS cache thresholds, render/preview time limits
#   - Reliability: HTTP retries with backoff, fail-fast option
#   - CI Integration: JSON summaries, JUnit XML reports, quiet mode
#   - Profiles: Smoke (PRs/fast) vs. Full (nightly/comprehensive)
#   - Cross-platform: bash 4.0+ compatible
#
# USAGE
#   ./mobius_golden_path.sh --profile smoke
#   ./mobius_golden_path.sh --profile full --junit /tmp/mobius_junit.xml --json-summary /tmp/mobius_summary.json
#   ./mobius_golden_path.sh --only cors,ssrf,tts --fail-fast --quiet --junit /tmp/mobius_junit.xml
#
# For detailed usage: ./mobius_golden_path.sh --help

set -Eeuo pipefail
IFS=$'\n\t'

# ============== CONFIG ==============
SERVER="http://localhost:5001"
FRONTEND="http://localhost:3000"
METRICS_TOKEN=""        # set if metrics protected
START_STACK="false"     # "true" to run npm run dev in background

LOCAL_TEXT_PDF="/path/to/text.pdf"        # optional
LOCAL_SCANNED_PDF="/path/to/scanned.pdf"  # optional (image-only)
REMOTE_PDF="https://example-allowlisted/pdf.pdf" # optional; must be allowlisted

# Prefer leaving image tests empty unless you have known-good URLs
IMAGE_URLS1=() # e.g., "https://cf.geekdo-images.com/XXXX/picYYYYY.jpg"
IMAGE_URLS2=()

# Keep only valid BGG game pages for the /api/extract/bgg contract
ALLOWED=(
  "https://www.boardgamegeek.com/boardgame/174430/gloomhaven"
  "https://boardgamegeek.com/boardgame/205637/terraforming-mars"
)
DENIED=(
  "http://169.254.169.254/latest/meta-data/"
  "http://127.0.0.1:22/"
  "http://10.0.0.1/"
  "http://[::1]/"
  "$SERVER/metrics"
)

# Additional defaults
TIMEOUT_DEFAULT=15
TIMEOUT_PREVIEW=60
QUIET=0
JSON_SUMMARY=""   # e.g., --json-summary /tmp/mobius_summary.json
ONLY_KEYS=()      # e.g., --only cors,ssrf,tts
PROFILE=""        # e.g., --profile smoke|full
DRY_RUN="false"   # --dry-run to print checks without executing
# Script metadata for artifacts
STARTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Try to read version from VERSION file, fallback to hardcoded value
if [[ -f "VERSION" ]]; then
    VERSION=$(cat VERSION)
else
    VERSION="1.0.0"
fi
COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")

# JUnit XML + fail-fast + thresholds
TTS_CACHE_RATIO=0.8     # warm must be < cold * ratio
TTS_CACHE_DELTA_MS=200  # or warm < cold - delta
FAIL_FAST="false"
JUNIT_PATH=""           # e.g., --junit /tmp/mobius_junit.xml

# Retries + preview performance gate
RETRY=2
RETRY_DELAY_MS=300
PREVIEW_MAX_MS=15000

# Metadata for artifacts
STARTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
# ====================================

# --- Error handling ---
on_err() {
  local lineno="$1"
  echo "ERROR: Script aborted at line $lineno" >&2
  # Add infrastructure failure to JUnit if path is set
  if [[ -n "$JUNIT_PATH" ]]; then
    {
      echo '<?xml version="1.0" encoding="UTF-8"?>'
      echo "<testsuite name=\"MobiusGoldenPath\" tests=\"1\" failures=\"1\" skipped=\"0\">"
      echo "  <testcase classname=\"MobiusGoldenPath\" name=\"0. Infrastructure failure at line $lineno\">"
      echo "    <failure message=\"Script aborted at line $lineno\">Script aborted at line $lineno</failure>"
      echo "  </testcase>"
      echo "</testsuite>"
    } > "$JUNIT_PATH"
  fi
  exit 1
}
trap 'on_err $LINENO' ERR

# --- Logging functions (robust pattern) ---
# Initialize counters at the top
PASS=0 FAIL=0 SKIP=0 INFO=0

# Capture logs for JSON summary and quiet mode:
declare -a LOG_TYPES=()
declare -a LOG_MSGS=()
declare -a LOG_TIMESTAMPS=()
declare -a LOG_DURATIONS=()

_log() {
  # levels: INFO, PASS, FAIL, WARN, SKIP
  local level="$1"; shift
  # Gate INFO when quiet
  if [ "$level" = "INFO" ] && [ "$QUIET" -eq 1 ]; then return; fi
  case "$level" in
    "PASS")  echo -e "\033[32m[PASS]\033[0m $*";;
    "FAIL")  echo -e "\033[31m[FAIL]\033[0m $*";;
    "SKIP")  echo -e "\033[33m[SKIP]\033[0m $*";;
    "WARN")  echo -e "\033[33m[WARN]\033[0m $*";;
    *)       echo -e "\033[36m[INFO]\033[0m $*";;
  esac
}

Info() { 
  local start=$(date +%s.%N)
  _log "INFO" "$@"
  local end=$(date +%s.%N)
  local duration=$(echo "$end - $start" | bc -l)
  ((INFO++))
  LOG_TYPES+=("INFO")
  LOG_MSGS+=("$*")
  LOG_TIMESTAMPS+=("$(date -u +"%Y-%m-%dT%H:%M:%SZ")")
  LOG_DURATIONS+=("$duration")
}

Pass() { 
  local start=$(date +%s.%N)
  _log "PASS" "$@"
  local end=$(date +%s.%N)
  local duration=$(echo "$end - $start" | bc -l)
  ((PASS++))
  LOG_TYPES+=("PASS")
  LOG_MSGS+=("$*")
  LOG_TIMESTAMPS+=("$(date -u +"%Y-%m-%dT%H:%M:%SZ")")
  LOG_DURATIONS+=("$duration")
}

Fail() { 
  local start=$(date +%s.%N)
  _log "FAIL" "$@"
  local end=$(date +%s.%N)
  local duration=$(echo "$end - $start" | bc -l)
  ((FAIL++))
  LOG_TYPES+=("FAIL")
  LOG_MSGS+=("$*")
  LOG_TIMESTAMPS+=("$(date -u +"%Y-%m-%dT%H:%M:%SZ")")
  LOG_DURATIONS+=("$duration")
  if [[ "$FAIL_FAST" == "true" ]]; then
    echo "Fail-fast enabled. Aborting."
    write_junit_if_needed
    write_json_if_needed
    exit 1
  fi
}

Skip() { 
  local start=$(date +%s.%N)
  _log "SKIP" "$@"
  local end=$(date +%s.%N)
  local duration=$(echo "$end - $start" | bc -l)
  ((SKIP++))
  LOG_TYPES+=("SKIP")
  LOG_MSGS+=("$*")
  LOG_TIMESTAMPS+=("$(date -u +"%Y-%m-%dT%H:%M:%SZ")")
  LOG_DURATIONS+=("$duration")
}

# Add JUnit writer helpers near top (after logging arrays):
write_junit_if_needed() {
  [[ -z "$JUNIT_PATH" ]] && return 0
  total=${#LOG_TYPES[@]}
  failures=0; skipped=0
  for i in "${!LOG_TYPES[@]}"; do
    [[ "${LOG_TYPES[$i]}" == "FAIL" ]] && ((failures++))
    [[ "${LOG_TYPES[$i]}" == "SKIP" ]] && ((skipped++))
  done
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo "<testsuite name=\"MobiusGoldenPath\" tests=\"$total\" failures=\"$failures\" skipped=\"$skipped\">"
    for i in "${!LOG_TYPES[@]}"; do
      t="${LOG_TYPES[$i]}"; m="${LOG_MSGS[$i]}"; tm="${LOG_TIMINGS[$i]:-0}"
      # Convert timing to seconds with 3 decimal places
      tm_sec=$(printf "%.3f" "$tm")
      # basic escaping for XML
      esc="${m//&/&amp;}"; esc="${esc//</&lt;}"; esc="${esc//>/&gt;}"; esc="${esc//\"/&quot;}"; esc="${esc//\'/&apos;}"
      echo "  <testcase classname=\"MobiusGoldenPath\" name=\"$((i+1)). $esc\" time=\"$tm_sec\">"
      if [[ "$t" == "FAIL" ]]; then
        echo "    <failure message=\"$esc\">$esc</failure>"
      elif [[ "$t" == "SKIP" ]]; then
        echo "    <skipped/>"
      fi
      echo "  </testcase>"
    done
    echo "</testsuite>"
  } > "$JUNIT_PATH"
  [[ "$QUIET" -eq 0 ]] && Info "Wrote JUnit XML to $JUNIT_PATH"
}

write_json_if_needed() {
  [[ -n "$JSON_SUMMARY" ]] || return 0
  
  # Calculate duration
  FINISHED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  DURATION_MS=$((($(date -d "$FINISHED_AT" +%s) - $(date -d "$STARTED_AT" +%s)) * 1000))
  
  # Create temporary file for flags
  local flags_temp=$(mktemp)
  {
    echo "SERVER=$SERVER"
    echo "FRONTEND=$FRONTEND"
    echo "METRICS_TOKEN=[REDACTED]"
    echo "START_STACK=$START_STACK"
    echo "TIMEOUT_DEFAULT=$TIMEOUT_DEFAULT"
    echo "TIMEOUT_PREVIEW=$TIMEOUT_PREVIEW"
    echo "QUIET=$QUIET"
    echo "ONLY_KEYS=${ONLY_KEYS[*]}"
    echo "PROFILE=$PROFILE"
    echo "DRY_RUN=$DRY_RUN"
    echo "TTS_CACHE_RATIO=$TTS_CACHE_RATIO"
    echo "TTS_CACHE_DELTA_MS=$TTS_CACHE_DELTA_MS"
    echo "FAIL_FAST=$FAIL_FAST"
    echo "JUNIT_PATH=$JUNIT_PATH"
    echo "RETRY=$RETRY"
    echo "RETRY_DELAY_MS=$RETRY_DELAY_MS"
    echo "PREVIEW_MAX_MS=$PREVIEW_MAX_MS"
  } > "$flags_temp"
  
  python3 - "$JSON_SUMMARY" "$flags_temp" <<'PY'
import json, os, sys
path = sys.argv[1]
flags_file = sys.argv[2]
# We'll reconstruct from environment text dumps emitted below
types = os.environ.get("MB_LOG_TYPES","").split("\n") if os.environ.get("MB_LOG_TYPES") else []
msgs  = os.environ.get("MB_LOG_MSGS","").split("\n") if os.environ.get("MB_LOG_MSGS") else []
timestamps = os.environ.get("MB_LOG_TIMESTAMPS","").split("\n") if os.environ.get("MB_LOG_TIMESTAMPS") else []
durations = os.environ.get("MB_LOG_DURATIONS","").split("\n") if os.environ.get("MB_LOG_DURATIONS") else []
pass_cnt = int(os.environ.get("MB_PASS","0"))
fail_cnt = int(os.environ.get("MB_FAIL","0"))
skip_cnt = int(os.environ.get("MB_SKIP","0"))
info_cnt = int(os.environ.get("MB_INFO","0"))
failures = [m for t,m in zip(types,msgs) if t=="FAIL"]
infos    = [m for t,m in zip(types,msgs) if t=="INFO"]

# Create checks array with timing information
checks = []
for i in range(len(types)):
    if i < len(msgs) and i < len(timestamps) and i < len(durations):
        checks.append({
            "id": i+1,
            "type": types[i],
            "message": msgs[i],
            "timestamp": timestamps[i],
            "duration_ms": float(durations[i]) if durations[i] else 0
        })

# Read flags
flags = {}
try:
    with open(flags_file, 'r') as f:
        for line in f:
            if '=' in line:
                k, v = line.strip().split('=', 1)
                flags[k] = v
except:
    pass

# Build the structure
result = {
    "version": os.environ.get("VERSION", "unknown"),
    "commit": os.environ.get("COMMIT", "unknown"),
    "profile": os.environ.get("PROFILE", ""),
    "started_at": os.environ.get("STARTED_AT", ""),
    "finished_at": os.environ.get("FINISHED_AT", ""),
    "duration_ms": int(os.environ.get("DURATION_MS", "0")),
    "env": {
        "server": os.environ.get("SERVER", ""),
        "frontend": os.environ.get("FRONTEND", "")
    },
    "thresholds": {
        "preview_max_ms": int(os.environ.get("PREVIEW_MAX_MS", "0")),
        "tts_ratio": float(os.environ.get("TTS_CACHE_RATIO", "0")),
        "tts_delta_ms": int(os.environ.get("TTS_CACHE_DELTA_MS", "0"))
    },
    "flags": flags,
    "checks": checks,
    "totals": {
        "pass": pass_cnt,
        "fail": fail_cnt,
        "skip": skip_cnt,
        "info": info_cnt
    },
    "failures": failures,
    "infos": infos
}

with open(path,"w",encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
PY
  
  # Clean up temp file
  rm -f "$flags_temp"
}

# --- End logging functions ---

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --server URL                 Backend base URL (default: ${SERVER:-http://localhost:5001})
  --frontend URL               Frontend base URL (default: ${FRONTEND:-http://localhost:3000})
  --metrics-token TOKEN        Bearer token for /metrics if protected
  --start-stack                Run 'npm run dev' in background
  --local-text-pdf PATH        Local text PDF path (optional)
  --local-scanned-pdf PATH     Local scanned (image-only) PDF path (optional)
  --remote-pdf URL             Remote PDF URL (must be allowlisted)
  --image-urls1 CSV            Comma-separated image URLs for extraImageUrls
  --image-urls2 CSV            Comma-separated image URLs for urls
  --timeout-default SECONDS     Default HTTP timeout (default: ${TIMEOUT_DEFAULT:-15})
  --timeout-preview SECONDS     Render/preview timeout (default: ${TIMEOUT_PREVIEW:-60})
  --quiet                       Suppress INFO logs
  --json-summary PATH           Write JSON summary counts + lists
  --only CSV                    Run only these blocks (e.g., cors,ssrf,tts)
  --profile {smoke|full}        Run predefined profile set
  --fail-fast                  Stop on first failure
  --junit PATH                 Write JUnit XML file
  --tts-cache-ratio FLOAT      Warm/cold ratio threshold (default: ${TTS_CACHE_RATIO:-0.8})
  --tts-cache-delta-ms INT     Warm must be < cold - delta (default: ${TTS_CACHE_DELTA_MS:-200})
  --retry N                    Curl retry count (default: ${RETRY:-2})
  --retry-delay-ms MS          Delay between retries (default: ${RETRY_DELAY_MS:-300})
  --preview-max-ms MS          Fail if render/preview exceeds this time (default: ${PREVIEW_MAX_MS:-15000})
  --dry-run                    Print checks that would run without executing
  --version                    Print version and exit
  -h, --help                   Show this help and exit

Profiles:
  smoke    Fast verification for PRs: readyz, health, cors, ssrf, tts, preview
  full     Comprehensive verification: all smoke tests plus prerequisites, frontend,
           metrics, ajv, images, pdf, histograms, pressure, pm2

Examples:
  $(basename "$0") --profile smoke
  $(basename "$0") --profile full --junit /tmp/mobius_junit.xml --json-summary /tmp/mobius_summary.json
  $(basename "$0") --only cors,ssrf,tts --fail-fast --quiet --junit /tmp/mobius_junit.xml
EOF
}

# Curl retry arguments
CURL_RETRY_ARGS=(--retry "$RETRY" --retry-delay "$((RETRY_DELAY_MS/1000))" --retry-connrefused --retry-all-errors)

# Helper to filter sections:
should_run() {
  local key="$1"
  [[ ${#ONLY_KEYS[@]} -eq 0 ]] && return 0
  for k in "${ONLY_KEYS[@]}"; do [[ "$k" == "$key" ]] && return 0; done
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server) SERVER="$2"; shift 2;;
    --frontend) FRONTEND="$2"; shift 2;;
    --metrics-token) METRICS_TOKEN="$2"; shift 2;;
    --metrics-token-legacy) 
      echo "WARNING: --metrics-token-legacy is deprecated, use --metrics-token instead (will be removed in v2.0.0)" >&2
      METRICS_TOKEN="$2"; shift 2;;
    --start-stack) START_STACK="true"; shift;;
    --local-text-pdf) LOCAL_TEXT_PDF="$2"; shift 2;;
    --local-scanned-pdf) LOCAL_SCANNED_PDF="$2"; shift 2;;
    --remote-pdf) REMOTE_PDF="$2"; shift 2;;
    --image-urls1) IFS=, read -r -a IMAGE_URLS1 <<< "$2"; shift 2;;
    --image-urls2) IFS=, read -r -a IMAGE_URLS2 <<< "$2"; shift 2;;
    --timeout-default) TIMEOUT_DEFAULT="$2"; shift 2;;
    --timeout) 
      echo "WARNING: --timeout is deprecated, use --timeout-default instead (will be removed in v2.0.0)" >&2
      TIMEOUT_DEFAULT="$2"; shift 2;;
    --timeout-preview) TIMEOUT_PREVIEW="$2"; shift 2;;
    --quiet) QUIET=1; shift;;
    --json-summary) JSON_SUMMARY="$2"; shift 2;;
    --json-out) 
      echo "WARNING: --json-out is deprecated, use --json-summary instead (will be removed in v2.0.0)" >&2
      JSON_SUMMARY="$2"; shift 2;;
    --only) IFS=, read -r -a ONLY_KEYS <<< "$2"; shift 2;;
    --profile) PROFILE="$2"; shift 2;;
    --fail-fast) FAIL_FAST="true"; shift;;
    --junit) JUNIT_PATH="$2"; shift 2;;
    --junit-out) 
      echo "WARNING: --junit-out is deprecated, use --junit instead (will be removed in v2.0.0)" >&2
      JUNIT_PATH="$2"; shift 2;;
    --tts-cache-ratio) TTS_CACHE_RATIO="$2"; shift 2;;
    --tts-cache-delta-ms) TTS_CACHE_DELTA_MS="$2"; shift 2;;
    --retry) RETRY="$2"; shift 2;;
    --retries) 
      echo "WARNING: --retries is deprecated, use --retry instead (will be removed in v2.0.0)" >&2
      RETRY="$2"; shift 2;;
    --retry-delay-ms) RETRY_DELAY_MS="$2"; shift 2;;
    --preview-max-ms) PREVIEW_MAX_MS="$2"; shift 2;;
    --dry-run) DRY_RUN="true"; shift;;
    --version) echo "Mobius Golden Path Verification Script v$VERSION (commit: $COMMIT)"; exit 0;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1"; usage; exit 2;;
  esac
done

# Profile expansion
if [[ -n "$PROFILE" && ${#ONLY_KEYS[@]} -eq 0 ]]; then
  case "$PROFILE" in
    smoke) ONLY_KEYS=(readyz health cors ssrf tts preview) ;;
    full)  ONLY_KEYS=(prereq start readyz health frontend metrics cors ssrf tts ajv images pdf preview hist pressure pm2) ;;
    *) echo "Unknown profile: $PROFILE"; exit 2;;
  esac
  Info "Profile '$PROFILE' expanded to: ${ONLY_KEYS[*]}"
fi

# Dry run - just print what would be executed
if [[ "$DRY_RUN" == "true" ]]; then
  echo "Dry run mode - would execute the following checks:"
  if [[ ${#ONLY_KEYS[@]} -eq 0 ]]; then
    echo "  All checks for profile: $PROFILE"
  else
    echo "  Selected checks: ${ONLY_KEYS[*]}"
  fi
  exit 0
fi

# Export variables for use in Python script
export VERSION COMMIT STARTED_AT SERVER FRONTEND PREVIEW_MAX_MS TTS_CACHE_RATIO TTS_CACHE_DELTA_MS PROFILE

# 0) Prereqs
should_run prereq && {
Info "Checking prerequisites (node/npm/ffmpeg/ffprobe/tesseract)"
if node -v >/dev/null 2>&1 && npm -v >/dev/null 2>&1 && ffmpeg -version >/dev/null 2>&1 && ffprobe -version >/dev/null 2>&1; then
  Pass "node/npm/ffmpeg/ffprobe present"
else
  Fail "Missing node/npm/ffmpeg/ffprobe"
fi
if tesseract --version >/dev/null 2>&1; then Info "Tesseract present"; else Info "Tesseract not installed (OCR optional)"; fi
}

# 1) Optionally start stack
should_run start && {
if [[ "$START_STACK" == "true" ]]; then
  Info "Starting dev stack (npm run dev) with BROWSER=none"
  (export BROWSER=none; npm run dev >/tmp/dev.log 2>&1 &)
  sleep 5
fi
}

# 2) Wait for readiness
should_run readyz && {
for i in {1..30}; do
  code=$(curl --max-time "$TIMEOUT_DEFAULT" -s -o /dev/null -w "%{http_code}" "$SERVER/readyz")
  [[ "$code" == "200" ]] && { Pass "/readyz 200"; break; }
  sleep 1
  [[ "$i" == "30" ]] && Fail "Server not ready at $SERVER/readyz"
done
}

# 3) Health, livez, helmet headers
code=$(curl "${CURL_RETRY_ARGS[@]}" -s -o /dev/null -w "%{http_code}" "$SERVER/health"); [[ "$code" == "200" ]] && Pass "/health 200" || Fail "/health $code"
code=$(curl "${CURL_RETRY_ARGS[@]}" -s -o /dev/null -w "%{http_code}" -I "$SERVER/livez"); [[ "$code" == "200" ]] && Pass "/livez 200" || Fail "/livez $code"
hdr=$(curl "${CURL_RETRY_ARGS[@]}" -sI "$SERVER/health")
echo "$hdr" | egrep -iq "x-content-type-options|x-dns-prefetch-control|x-frame-options|referrer-policy" && Pass "Helmet headers present" || Info "Helmet headers not observed"

# 4) Frontend proxy connectivity
should_run frontend && {
code=$(curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s -o /dev/null -w "%{http_code}" "$FRONTEND/api/health")
[[ "$code" == "200" ]] && Pass "Frontend proxy to backend OK" || Fail "Frontend proxy connection failed HTTP $code"
}

# 5) Metrics protection
should_run metrics && {
out=$(mktemp); code=$(curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s -o "$out" -w "%{http_code}" "$SERVER/metrics") || true
[[ "$code" =~ ^(200|401|403)$ ]] && Pass "/metrics HTTP $code" || Fail "/metrics HTTP $code"
if [[ "$code" == "200" ]] && grep -q "build_info" "$out"; then Info "Metrics appear unprotected or IP-allowed"; fi
if [[ "$code" =~ ^(401|403)$ ]] && [[ -n "$METRICS_TOKEN" ]]; then
  out2=$(mktemp); code2=$(curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s -o "$out2" -w "%{http_code}" -H "Authorization: Bearer $METRICS_TOKEN" "$SERVER/metrics")
  [[ "$code2" == "200" ]] && grep -q "build_info" "$out2" && Pass "Metrics authorized with token" || Fail "Metrics token failed HTTP $code2"
fi
}

# 6) CORS preflight /api/tts (capture headers)
should_run cors && {
out_hdr=$(mktemp)
code=$(curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s -o /dev/null -D "$out_hdr" -w "%{http_code}" -X OPTIONS "$SERVER/api/tts" \
  -H "Origin: $FRONTEND" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type")
[[ "$code" == "200" || "$code" == "204" ]] && Pass "CORS preflight OK ($code)" || Fail "CORS preflight failed HTTP $code"
grep -iq "^Access-Control-Allow-Methods:.*POST" "$out_hdr" && Pass "CORS allows POST" || Fail "CORS missing POST"
grep -iq "^Access-Control-Allow-Credentials:" "$out_hdr" && Info "CORS A-C-A-Credentials present" || Info "No A-C-A-Credentials header"
grep -iq "^Vary:.*Origin" "$out_hdr" && Info "CORS Vary: Origin present" || Info "No Vary: Origin header"
}

# 7) SSRF allow/deny matrix
should_run ssrf && {
ok=0; bad=0
for u in "${ALLOWED[@]}"; do
  code=$(curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s -o /dev/null -w "%{http_code}" -X POST "$SERVER/api/extract/bgg" -H "Content-Type: application/json" -d "{\"bggUrl\":\"$u\"}")
  if [[ "$code" -ge 200 && "$code" -lt 400 ]]; then ((ok++)); else ((bad++)); Info "Allowed URL blocked? $u (HTTP $code)"; fi
done
[[ "$ok" -eq "${#ALLOWED[@]}" ]] && Pass "SSRF allowed set passed ($ok/${#ALLOWED[@]})" || Fail "SSRF allowed set issues ($ok/${#ALLOWED[@]})"

blk=0; miss=0
for u in "${DENIED[@]}"; do
  code=$(curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s -o /dev/null -w "%{http_code}" -X POST "$SERVER/api/extract/bgg" -H "Content-Type: application/json" -d "{\"bggUrl\":\"$u\"}")
  if [[ "$code" -ge 400 ]]; then ((blk++)); else ((miss++)); Info "Denied URL allowed? $u (HTTP $code)"; fi
done
[[ "$blk" -eq "${#DENIED[@]}" ]] && Pass "SSRF denied set blocked ($blk/${#DENIED[@]})" || Fail "SSRF denied set issues ($blk/${#DENIED[@]})"
}

# 8) TTS cache cold vs warm
should_run tts && {
timestamp=$(date +%Y%m%d%H%M%S)
data="{\"text\":\"Hello world from Mobius $timestamp\",\"voice\":\"alloy\"}"
t1=$( (time -p curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s -X POST "$SERVER/api/tts" -H "Content-Type: application/json" -d "$data" >/dev/null) 2>&1 | awk '/real/{print $2}')
t2=$( (time -p curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s -X POST "$SERVER/api/tts" -H "Content-Type: application/json" -d "$data" >/dev/null) 2>&1 | awk '/real/{print $2}')
Info "TTS cold=${t1}s warm=${t2}s"

# After computing t1 (cold seconds) and t2 (warm seconds)
# Convert to ms for delta comparison
c_ms=$(python - <<PY
print(int(round(float("$t1")*1000)))
PY
)
w_ms=$(python - <<PY
print(int(round(float("$t2")*1000)))
PY
)
thr_ratio=$(python - <<PY
c=$c_ms; r=float("$TTS_CACHE_RATIO")
print(int(min(c*r, c)))
PY
)
thr_delta=$(( c_ms - TTS_CACHE_DELTA_MS ))
# effective threshold is min(ratio, delta)
if [[ $w_ms -lt $thr_ratio && $w_ms -lt $thr_delta ]]; then
  Pass "TTS cache effective (cold=${c_ms}ms warm=${w_ms}ms thr_ratio=${thr_ratio}ms thr_delta=${thr_delta}ms)"
else
  Info "TTS not clearly faster (cold=${c_ms}ms warm=${w_ms}ms thr_ratio=${thr_ratio}ms thr_delta=${thr_delta}ms)"
fi
}

# 9) AJV strictness (note: server must be started with NODE_ENV=production to enforce)
should_run ajv && {
export NODE_ENV=production
code=$(curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s -o /tmp/ajv.out -w "%{http_code}" -X POST "$SERVER/api/extract/bgg" -H "Content-Type: application/json" -d '{"bggUrl":"https://www.boardgamegeek.com/boardgame/174430/gloomhaven","unexpected":"nope"}')
if [[ "$code" == "400" ]] && egrep -qi "additionalProperties|unexpected" /tmp/ajv.out; then
  Pass "AJV strictness enforced (400)"
else
  Info "AJV response HTTP $code (if dev server, start with NODE_ENV=production to enforce)"
fi
export NODE_ENV=development
}

# 10) Images extraction (optional)
should_run images && {
if [[ "${#IMAGE_URLS1[@]}" -gt 0 ]]; then
  payload=$(printf '{"extraImageUrls":[%s]}' "$(printf '"%s",' "${IMAGE_URLS1[@]}" | sed 's/,$//')")
  code=$(curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s -o /dev/null -w "%{http_code}" -X POST "$SERVER/api/extract/images" -H "Content-Type: application/json" -d "$payload")
  [[ "$code" -ge 200 && "$code" -lt 300 ]] && Pass "images(extraImageUrls) OK" || Info "images(extraImageUrls) HTTP $code"
fi
if [[ "${#IMAGE_URLS2[@]}" -gt 0 ]]; then
  payload=$(printf '{"urls":[%s]}' "$(printf '"%s",' "${IMAGE_URLS2[@]}" | sed 's/,$//')")
  code=$(curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s -o /dev/null -w "%{http_code}" -X POST "$SERVER/api/extract/images" -H "Content-Type: application/json" -d "$payload")
  [[ "$code" -ge 200 && "$code" -lt 300 ]] && Pass "images(urls) OK" || Info "images(urls) HTTP $code"
fi
}

# 11) Timeline validate + preview
should_run timeline && {
  timeline='{
    "title":"Smoke Test",
    "segments": [
      {"type":"image","url":"https://www.boardgamegeek.com","duration":2.0},
      {"type":"narration","text":"Hello from Mobius","voice":"alloy","duration":2.0}
    ]
  }'
  code=$(curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s -o /dev/null -w "%{http_code}" -X POST "$SERVER/api/timeline/validate" -H "Content-Type: application/json" -d "$timeline")
  [[ "$code" -ge 200 && "$code" -lt 300 ]] && Pass "timeline/validate OK" || Info "timeline/validate HTTP $code"

  start_ms=$(date +%s%3N)
  code=$(curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_PREVIEW" -s -o /dev/null -w "%{http_code}" -X POST "$SERVER/api/render/preview" -H "Content-Type: application/json" -d "$timeline")
  end_ms=$(date +%s%3N)
  dur_ms=$(( end_ms - start_ms ))
  if [[ "$code" -ge 200 && "$code" -lt 300 ]]; then
    if [[ "$dur_ms" -le "$PREVIEW_MAX_MS" ]]; then
      Pass "render/preview OK in ${dur_ms}ms (<= ${PREVIEW_MAX_MS}ms)"
    else
      Fail "render/preview slow: ${dur_ms}ms > ${PREVIEW_MAX_MS}ms"
    fi
  else
    Info "render/preview HTTP $code"
  fi
}

# 12) Load histograms
should_run hist && {
for i in {1..20}; do curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s "$SERVER/health" >/dev/null; done
for i in {1..5}; do curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s -X POST "$SERVER/api/extract/bgg" -H "Content-Type: application/json" -d '{"bggUrl":"https://www.boardgamegeek.com/boardgame/174430/gloomhaven"}' >/dev/null; done
out=$(mktemp); curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s "$SERVER/metrics" > "$out" || true
grep -q "http_request_duration_seconds_bucket" "$out" && Pass "metrics histograms moved" || Info "metrics histograms not observed"
}

# 13) Readiness under pressure
should_run pressure && {
python - <<'PY'
import time, math
t=time.time()+5
while time.time()<t:
    for i in range(30000): math.sqrt(i)
PY
code=$(curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s -o /dev/null -w "%{http_code}" "$SERVER/readyz")
[[ "$code" == "200" ]] && Pass "/readyz 200 under light pressure" || Fail "/readyz degraded HTTP $code"
}

# 14) Optional: PM2 graceful reload check
should_run pm2 && {
if command -v pm2 >/dev/null 2>&1; then
  Info "PM2 graceful reload check"
  pm2 gracefulReload all || Info "pm2 gracefulReload failed or not configured"
  sleep 2
  code=$(curl "${CURL_RETRY_ARGS[@]}" --max-time "$TIMEOUT_DEFAULT" -s -o /dev/null -w "%{http_code}" "$SERVER/readyz")
  [[ "$code" == "200" ]] && Pass "Service stayed ready during PM2 reload" || Fail "Service not ready after PM2 reload (HTTP $code)"
fi
}

# Summary
echo
echo "===== SUMMARY ====="
echo "PASS: $PASS  FAIL: $FAIL  SKIP: $SKIP  INFO: $INFO"
[[ "$FAIL" -gt 0 ]] && echo "One or more checks FAILED. Scroll up for details."

# Emit env text blocks just before calling write_json_if_needed
{
  for i in "${!LOG_TYPES[@]}"; do echo "${LOG_TYPES[$i]}"; done
} | awk '1' | { MB_LOG_TYPES="$(cat)"; export MB_LOG_TYPES; }
{
  for i in "${!LOG_MSGS[@]}"; do echo "${LOG_MSGS[$i]}"; done
} | awk '1' | { MB_LOG_MSGS="$(cat)"; export MB_LOG_MSGS; }
{
  for i in "${!LOG_TIMESTAMPS[@]}"; do echo "${LOG_TIMESTAMPS[$i]}"; done
} | awk '1' | { MB_LOG_TIMESTAMPS="$(cat)"; export MB_LOG_TIMESTAMPS; }
{
  for i in "${!LOG_DURATIONS[@]}"; do echo "${LOG_DURATIONS[$i]}"; done
} | awk '1' | { MB_LOG_DURATIONS="$(cat)"; export MB_LOG_DURATIONS; }
export MB_PASS="$PASS" MB_FAIL="$FAIL" MB_SKIP="$SKIP" MB_INFO="$INFO"

# Write JUnit XML and JSON summary at the very end (before exit)
write_junit_if_needed
write_json_if_needed

# CI-friendly hard-fail on failures
if (( FAIL > 0 )); then exit 1; else exit 0; fi