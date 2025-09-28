# MOBIUS Backend API

A simple FastAPI backend service for the MOBIUS project.

## Features

- Health check endpoint at `/health`
- Authenticated API endpoints
- Token-based authentication via Bearer tokens
- Docker support

## Development

Install dependencies:
```bash
pip install -r requirements.txt
```

Run tests:
```bash
pytest -v
```

Run server:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Docker

Build and run with Docker:
```bash
docker build -t mobius/backend .
docker run -p 8000:8000 -e ALLOWED_TOKEN=your_token_here mobius/backend
```

## Environment Variables

- `ALLOWED_TOKEN`: Bearer token for API authentication (optional in development)