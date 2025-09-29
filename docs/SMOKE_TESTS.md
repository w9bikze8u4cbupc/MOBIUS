# Local smoke test (compose)

This file documents how to run the containerized API smoke test locally (same steps CI runs).

1. Build the API container

```bash
docker compose -f docker-compose.staging.yml build
```

2. Start the API service

```bash
docker compose -f docker-compose.staging.yml up -d api
```

3. Check health

```bash
curl -f http://localhost:5001/health
```

Expected response:
```json
{"status":"healthy","timestamp":"2025-09-29T01:14:01.319Z","version":"0.1.0","mode":"mock"}
```

4. Tear down

```bash
docker compose -f docker-compose.staging.yml down -v
```

Notes:
- The compose file activates mock mode (USE_MOCKS=true). This avoids external dependencies like DB or OpenAI when running CI/local smoke tests.
- The API listens on port 5001 by default.