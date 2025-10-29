# Offline Runbook

This guide walks an operator through launching MOBIUS without an internet connection and running the PDF → export bundle pipeline end to end.

---

## 1. Services Overview

| Service | Directory | Default Port |
|---------|-----------|--------------|
| Ingest (FastAPI) | `services/ingest-py` | `8001` |
| API Gateway (Express) | `apps/api-gateway` | `5001` |
| Frontend UI (Vite) | `apps/board-game-video-generator` | `5173` |

Ensure the `data/` directory is writable; project artifacts live under `services/ingest-py/data`.

---

## 2. Python (Ingest service)

1. Place your offline wheel cache under `services/ingest-py/offline/wheels/`.
2. Run the helper script:

   ```bash
   bash services/ingest-py/scripts_offline_example.sh
   ```

   This script delegates to [`pip_offline.sh`](services/ingest-py/pip_offline.sh) which installs all requirements without touching PyPI. The ingest API starts on `0.0.0.0:${INGEST_PORT:-8001}`.

---

## 3. Node.js (API Gateway)

1. Copy an offline `node_modules` archive (e.g. `offline/node_modules.tgz`) into `apps/api-gateway/`.
2. Launch the helper script:

   ```bash
   bash apps/api-gateway/scripts_offline_example.sh
   ```

   Internally it calls [`node_unpack.sh`](apps/api-gateway/node_unpack.sh) to extract dependencies and then boots the gateway on `PORT=${PORT:-5001}`.

---

## 4. Frontend UI

1. Restore the UI dependencies with your preferred offline strategy (e.g. `npm ci --offline`).
2. Run `npm run dev -- --host` from `apps/board-game-video-generator` to expose the Vite dev server.
3. Open `http://127.0.0.1:5173` in a browser connected to the same machine.

The UI persists the last `projectId` in `localStorage` and can load a saved manifest after a page refresh.

---

## 5. Port Map & Quick Checks

| Command | Purpose |
|---------|---------|
| `curl -s http://127.0.0.1:5001/health | jq .` | Gateway + ingest health summary |
| `curl -s -F "projectId=demo123" -F "file=@/abs/path/rulebook.pdf" "http://127.0.0.1:5001/ingest/pdf?heuristics=true" | jq .` | Upload a rulebook with heuristics |
| `curl -s -X POST http://127.0.0.1:5001/ingest/bgg -H 'content-type: application/json' -d '{"projectId":"demo123","bggUrl":"https://boardgamegeek.com/boardgame/13/catan"}' | jq .` | Cache BGG metadata |
| `curl -s -X POST http://127.0.0.1:5001/script/generate -H 'content-type: application/json' -d '{"project":{"id":"demo123"},"lang":"en"}' | jq .` | Generate script stubs |
| `curl -s -X POST http://127.0.0.1:5001/tts/generate -H 'content-type: application/json' -d '{"projectId":"demo123","segments":[{"id":"seg-1","text":"Hello"}]}' | jq .` | Synthesize placeholder audio |
| `curl -s -X POST http://127.0.0.1:5001/render/compose -H 'content-type: application/json' -d '{"project":{"id":"demo123"},"options":{"mode":"preview"}}' | jq .` | Compose preview artifact |
| `curl -s -X POST http://127.0.0.1:5001/project/export -H 'content-type: application/json' -d '{"projectId":"demo123"}' | jq .` | Kick off export |
| `curl -s 'http://127.0.0.1:5001/project/export/status?exportId=...' | jq .` | Poll export status |

---

## 6. Troubleshooting

| Symptom | Root Cause | Fix |
|---------|------------|-----|
| `400 Invalid projectId` | ID does not match `^[a-zA-Z0-9._-]{1,64}$` | Rename the project using only ASCII letters, digits, `.`, `_`, or `-` |
| `413 payload_too_large` | JSON payload exceeded 10&nbsp;MB gateway limit | Reduce request size or chunk uploads (PDF must go via multipart) |
| `429 rate_limit_exceeded` | Token bucket exhausted | Wait a second or increase `RATE_CAPACITY` env var |
| `503 upstream_unreachable` on `/health` | Gateway cannot contact ingest service | Verify ingest is running on `INGEST_SERVICE_URL` |
| Export stuck in `processing` | Background worker failed silently | Check `services/ingest-py/data/exports/<exportId>.json` for diagnostics |
| Need a clean slate | Remove project artifacts | `rm -rf services/ingest-py/data/projects/<projectId>` |

---

## 7. Offline Smoke Test

After both services are running, validate the whole flow using the automated script:

```bash
bash scripts/smoke_e2e.sh demo123 /absolute/path/to/rulebook.pdf https://boardgamegeek.com/boardgame/13/catan
```

The script exits with status `0` on success and prints the final `zipPath`. Use `zipinfo <zipPath>` to verify the package contains `manifest.json`, `captions/subtitles.srt`, `description.txt`, and `thumbnail.jpg`.

---

Happy operating!
