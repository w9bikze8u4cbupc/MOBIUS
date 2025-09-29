# MOBIUS Games Tutorial Generator

## API Smoke Tests

You can run the containerized API smoke tests locally using Docker Compose:

```bash
# Start the API service
docker compose -f docker-compose.staging.yml up -d api

# Wait for the service to be healthy
timeout 30 bash -c 'until curl -f http://localhost:5001/health; do sleep 2; done'

# Test the health endpoint
curl http://localhost:5001/health

# Stop and clean up
docker compose -f docker-compose.staging.yml down -v
```

The API runs in mock mode when containerized, providing stub responses for all endpoints without requiring external dependencies like OpenAI API keys or database connections.
