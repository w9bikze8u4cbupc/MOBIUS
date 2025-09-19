#!/usr/bin/env bash
set -e
API_BASE="${API_BASE:-http://127.0.0.1:5001}"
echo "Health: $(curl -fsS "$API_BASE/healthz" || echo 'unhealthy')"
echo "Ports:"
lsof -i :3000 -sTCP:LISTEN || true
lsof -i :5001 -sTCP:LISTEN || true
echo "PIDs:"
[ -f logs/dev-backend.pid ] && echo "backend: $(cat logs/dev-backend.pid)"
[ -f logs/dev-frontend.pid ] && echo "frontend: $(cat logs/dev-frontend.pid)"