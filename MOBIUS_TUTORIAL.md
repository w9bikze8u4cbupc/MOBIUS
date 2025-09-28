# MOBIUS Tutorial - FastAPI Backend + Deployment Guide

## Overview

This guide covers the MOBIUS FastAPI ingestion service, local development setup, testing procedures, and deployment operations.

## Architecture

The MOBIUS system now includes:
- **React Frontend** (port 3000) - User interface
- **FastAPI Backend** (port 8000) - Ingestion service with WebSocket updates  
- **Node.js API** (port 5001) - Existing game processing service
- **Docker Compose** - Full-stack local development

## Quick Start

### 1. Full Stack with Docker Compose

```bash
# Clone and navigate to project
git clone <repository-url>
cd MOBIUS

# Set environment variables (optional)
export ALLOWED_TOKEN=your_secure_token_here
export OPENAI_API_KEY=your_openai_key

# Start all services
docker-compose up

# Access services:
# - Frontend: http://localhost:3000
# - FastAPI Backend: http://localhost:8000
# - FastAPI Docs: http://localhost:8000/docs
# - Node.js API: http://localhost:5001
```

### 2. Backend Only (Development)

**Linux/macOS:**
```bash
cd backend
chmod +x run.sh
./run.sh
```

**Windows (PowerShell):**
```powershell
cd backend
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser  # First time only
.\run.ps1
```

**Manual Setup:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export ALLOWED_TOKEN=dev_token_here
uvicorn main:app --reload --port 8000
```

## API Usage

### Health Check
```bash
curl http://localhost:8000/health
```

### Ingest Data (JSON only)
```bash
curl -X POST "http://localhost:8000/api/ingest" \
  -H "Authorization: Bearer dev_token_here" \
  -F 'metadata={"source":"tutorial-test","type":"validation"}'
```

### Ingest with File Upload
```bash
curl -X POST "http://localhost:8000/api/ingest" \
  -H "Authorization: Bearer dev_token_here" \
  -F 'metadata={"source":"file-upload","description":"Test file"}' \
  -F 'file=@example.txt'
```

### Check Job Status
```bash
curl http://localhost:8000/api/status/{job_id}
```

### List Recent Jobs
```bash
curl http://localhost:8000/api/jobs
```

### WebSocket Connection (JavaScript)
```javascript
const ws = new WebSocket('ws://localhost:8000/api/ws');
ws.onmessage = function(event) {
    const data = JSON.parse(event.data);
    console.log('Job update:', data);
};
```

## Testing

### Run Backend Tests
```bash
cd backend
python -m pytest test_api.py -v

# With coverage
python -m pytest test_api.py -v --cov=main
```

### Integration Test Script
```bash
# Test complete job lifecycle
cd backend
python -c "
import requests
import json
import time

# Create job
response = requests.post(
    'http://localhost:8000/api/ingest',
    data={'metadata': json.dumps({'source': 'integration-test'})},
    headers={'Authorization': 'Bearer dev_token_here'}
)
job_id = response.json()['job_id']
print(f'Created job: {job_id}')

# Wait for processing
time.sleep(3)

# Check status
status = requests.get(f'http://localhost:8000/api/status/{job_id}')
print(f'Final status: {status.json()[\"status\"]}')
"
```

## Deployment Operations

### Quick Deploy (Recommended)

Deploy to staging:
```bash
./quick-deploy.sh v1.2.3 --env staging --no-dry-run
```

Deploy dry-run to production:
```bash
./quick-deploy.sh v1.2.3 --env production  # Dry run by default
```

### Manual Operations

**Backup:**
```bash
./scripts/mock-harness/backup.sh
```

**Monitor:**
```bash
export ENVIRONMENT=staging
export MONITORING_DURATION=300  # 5 minutes
./scripts/mock-harness/monitor.sh
```

**Rollback:**
```bash
./scripts/mock-harness/rollback.sh previous staging false
```

**Notifications:**
```bash
./scripts/mock-harness/notify.sh "Deployment completed" "success"
```

### Cross-Platform Scripts

All deployment scripts support both bash and PowerShell:

```bash
# Linux/macOS
./scripts/mock-harness/backup.sh
./scripts/mock-harness/deploy-wrapper.sh v1.2.3 staging false

# Windows PowerShell
.\scripts\mock-harness\backup.ps1
.\scripts\mock-harness\deploy-wrapper.ps1 -ImageTag "v1.2.3" -Environment "staging" -DryRun "false"
```

## Monitoring and Observability

### Health Endpoints
- **Basic Health**: `GET /health` - Service status
- **Detailed Status**: `GET /api/jobs` - Recent job activity

### Log Analysis
```bash
# View logs with job context
docker-compose logs backend | grep "job_id="

# Monitor real-time logs
docker-compose logs -f backend
```

### WebSocket Monitoring
The WebSocket endpoint (`/api/ws`) broadcasts:
- `job_created` - When new jobs are submitted
- `job_updated` - When job status changes

## Troubleshooting

### Common Issues

**Port Conflicts:**
```bash
# Check what's using port 8000
lsof -i :8000  # macOS/Linux
netstat -an | find "8000"  # Windows

# Use different port
export PORT=8001
uvicorn main:app --port 8001
```

**Authentication Errors:**
```bash
# Check token configuration
echo $ALLOWED_TOKEN

# Set token for testing
export ALLOWED_TOKEN=your_token_here
```

**Docker Issues:**
```bash
# Rebuild containers
docker-compose down
docker-compose build --no-cache
docker-compose up

# View container logs
docker-compose logs backend
```

### Debug Mode

Enable detailed logging:
```bash
export LOG_LEVEL=DEBUG
uvicorn main:app --reload --log-level debug
```

## Production Hardening Checklist

Before production deployment, complete these items:

- [ ] **Authentication**: Replace `ALLOWED_TOKEN` with OAuth2/JWT + scope validation
- [ ] **Task Queue**: Implement Redis/Celery for background job processing
- [ ] **Storage**: Configure persistent artifact storage (S3/DB)
- [ ] **Metrics**: Add Prometheus metrics and monitoring
- [ ] **Load Testing**: Perform capacity planning and load testing
- [ ] **Security**: Security scan, dependency audit, CORS configuration
- [ ] **Backup/Recovery**: Implement proper backup and disaster recovery
- [ ] **CI/CD**: Complete CI pipeline with integration tests

## Support and Contact

- **Backend Issues**: Create issue with `backend` label
- **Deployment Issues**: Tag `@ops` team
- **Security Concerns**: Contact security team immediately

## Appendix

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8000 | Backend service port |
| `ALLOWED_TOKEN` | dev_token_here | Authentication token (dev only) |
| `LOG_LEVEL` | INFO | Logging level |
| `MONITORING_DURATION` | 300 | Monitoring duration in seconds |
| `ERROR_THRESHOLD` | 5 | Error rate threshold (%) |
| `LATENCY_THRESHOLD` | 2000 | Latency threshold (ms) |

### Docker Commands Reference

```bash
# Build backend image
docker build -t mobius-backend ./backend

# Run backend container
docker run -p 8000:8000 -e ALLOWED_TOKEN=test mobius-backend

# Exec into running container
docker exec -it mobius_backend_1 /bin/bash
```