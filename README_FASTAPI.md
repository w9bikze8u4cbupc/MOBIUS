# MOBIUS - Game Tutorial Generator

A pipeline for generating game tutorial videos from structured game rules, built with FastAPI backend and React frontend.

## Architecture

- **Backend**: FastAPI (Python 3.11) - Game processing and API endpoints
- **Frontend**: React - User interface for game input and tutorial generation  
- **Processing**: FFmpeg - Video and audio generation pipeline

## Development Setup

### FastAPI Backend

```bash
# Install Python dependencies
pip install -r requirements.txt

# Run development server
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd client
npm install
npm start
```

### Docker Development

```bash
# Build and run full stack
docker-compose up --build

# Run tests
pytest --cov=src tests/
```

## CI/CD

The project uses a multi-platform CI pipeline that includes:

- **Code Quality**: isort, black, flake8
- **Testing**: pytest with coverage reporting
- **Docker**: Multi-arch builds with health checks
- **E2E Testing**: Full stack integration tests on staging

Required secrets:
- `ALLOWED_TOKEN`: Authentication token for API access

## API Endpoints

- `GET /`: Root endpoint
- `GET /health`: Health check (requires auth)  
- `GET /api/status`: API status (requires auth)

All authenticated endpoints require `Authorization: Bearer <token>` header.