#!/bin/bash
# Regression validation script for Mobius Games Tutorial Generator
# Based on the checklist provided

set -e
BASE=http://127.0.0.1:5001

echo "=== Mobius Games Tutorial Generator Validation ==="

echo "1. Health checks"
echo "Healthz endpoint:"
curl -sS $BASE/healthz -D - | head -n 1
echo "Readyz endpoint:"
curl -sS $BASE/readyz -D - | head -n 1

echo ""
echo "2. BGG HTML path"
curl -sS -H "Content-Type: application/json" \
  -d '{"url":"https://boardgamegeek.com/boardgame/174430/gloomhaven"}' \
  $BASE/api/extract-bgg-html | jq '.success, .source, .metadata.title'

echo ""
echo "3. BGG XML fallback (simulated by using a game that might trigger fallback)"
curl -sS -H "Content-Type: application/json" \
  -d '{"url":"https://boardgamegeek.com/boardgame/13"}' \
  $BASE/api/extract-bgg-html | jq '.source, .metadata.title'

echo ""
echo "4. Testing correlation IDs"
curl -sS -H "Content-Type: application/json" -H "X-Request-ID: validation-test-$(date +%s)" \
  -d '{"url":"https://boardgamegeek.com/boardgame/68448"}' \
  $BASE/api/extract-bgg-html | jq '.success, .source'

echo ""
echo "=== Validation Complete ==="