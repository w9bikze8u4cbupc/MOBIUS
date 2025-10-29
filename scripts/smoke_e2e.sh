#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 PROJECT_ID PDF_PATH BGG_URL" >&2
  exit 1
fi

PROJECT_ID="$1"
PDF_PATH="$2"
BGG_URL="$3"
BASE_URL="${BASE_URL:-http://127.0.0.1:5001}"

if [[ ! -f "$PDF_PATH" ]]; then
  echo "PDF not found: $PDF_PATH" >&2
  exit 1
fi

function curl_json() {
  local method="$1"
  local endpoint="$2"
  local body="$3"
  local response
  response=$(curl -s -X "$method" "$BASE_URL$endpoint" -H 'content-type: application/json' -d "$body")
  echo "$response"
}

function assert_ok() {
  local response="$1"
  local context="$2"
  local ok
  ok=$(echo "$response" | jq -r '.ok // empty')
  if [[ "$ok" != "true" ]]; then
    echo "[$context] request failed" >&2
    echo "$response" | jq . >&2 || echo "$response" >&2
    exit 1
  fi
  echo "$response" | jq .
}

echo "[1/8] Checking health"
HEALTH=$(curl -s "$BASE_URL/health")
assert_ok "$HEALTH" "health"

echo "[2/8] Uploading PDF"
UPLOAD=$(curl -s -F "projectId=$PROJECT_ID" -F "file=@$PDF_PATH" "$BASE_URL/ingest/pdf?heuristics=true")
assert_ok "$UPLOAD" "pdf"

echo "[3/8] BGG ingest"
BGG=$(curl_json POST "/ingest/bgg" "{\"projectId\":\"$PROJECT_ID\",\"bggUrl\":\"$BGG_URL\"}")
assert_ok "$BGG" "bgg"

echo "[4/8] Generate script"
SCRIPT=$(curl_json POST "/script/generate" "{\"project\":{\"id\":\"$PROJECT_ID\"},\"lang\":\"en\"}")
assert_ok "$SCRIPT" "script"

SEGMENTS=$(echo "$SCRIPT" | jq '.segments')

echo "[5/8] Generate TTS"
TTS=$(curl_json POST "/tts/generate" "{\"projectId\":\"$PROJECT_ID\",\"segments\":$SEGMENTS}")
assert_ok "$TTS" "tts"

echo "[6/8] Compose preview"
RENDER=$(curl_json POST "/render/compose" "{\"project\":{\"id\":\"$PROJECT_ID\"},\"options\":{\"mode\":\"preview\"}}")
assert_ok "$RENDER" "render"

echo "[7/8] Kick off export"
EXPORT=$(curl_json POST "/project/export" "{\"projectId\":\"$PROJECT_ID\"}")
assert_ok "$EXPORT" "export"
EXPORT_ID=$(echo "$EXPORT" | jq -r '.exportId')

if [[ -z "$EXPORT_ID" ]]; then
  echo "Export ID missing" >&2
  exit 1
fi

echo "[8/8] Polling export status"
while true; do
  STATUS=$(curl -s "$BASE_URL/project/export/status?exportId=$EXPORT_ID")
  OK=$(echo "$STATUS" | jq -r '.ok // empty')
  if [[ "$OK" != "true" ]]; then
    echo "[export-status] request failed" >&2
    echo "$STATUS" | jq . >&2 || echo "$STATUS" >&2
    exit 1
  fi
  STATE=$(echo "$STATUS" | jq -r '.state')
  echo "$STATUS" | jq .
  if [[ "$STATE" == "complete" ]]; then
    ZIP_PATH=$(echo "$STATUS" | jq -r '.zipPath')
    echo "Export complete: $ZIP_PATH"
    exit 0
  fi
  if [[ "$STATE" == "failed" ]]; then
    echo "Export failed"
    exit 1
  fi
  sleep 1
done

