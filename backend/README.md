# MOBIUS FastAPI Backend

A FastAPI service for processing game rulebook uploads and generating tutorial content.

## Features

- 📁 File upload and processing (PDF, TXT, DOC, DOCX)
- 📊 Job status tracking with unique IDs
- 🔐 Token-based authentication
- 🏥 Health checks and monitoring
- 🐳 Docker containerization
- 🧪 Comprehensive test suite

## Quick Start

### Linux / macOS / Git Bash

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export ALLOWED_TOKEN=your_token_here
uvicorn main:app --reload --port 8000
```

Or use the run script:

```bash
cd backend
./run.sh
```

### Windows PowerShell

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:ALLOWED_TOKEN="your_token_here"
python main.py   # or use uvicorn main:app --reload --port 8000
```

Or use the PowerShell script:

```powershell
cd backend
.\run.ps1
```

## API Endpoints

- **GET** `/health` - Health check
- **POST** `/ingest` - Upload file for processing (requires auth)
- **GET** `/status/{job_id}` - Get job status
- **GET** `/jobs` - List all jobs (requires auth)
- **POST** `/process/{job_id}` - Trigger processing (requires auth)
- **DELETE** `/jobs/{job_id}` - Delete job and files (requires auth)

## API Documentation

Once running, visit:
- Interactive docs: http://localhost:8000/docs
- OpenAPI spec: http://localhost:8000/openapi.json

## Testing

Run the test suite:

```bash
cd backend
source .venv/bin/activate  # or .\.venv\Scripts\Activate.ps1 on Windows
export ALLOWED_TOKEN=test-token-123
python -m pytest test_api.py -v
```

## Linting

```bash
cd backend
source .venv/bin/activate
flake8 main.py test_api.py --max-line-length=88
black main.py test_api.py --line-length=88
```

## Docker

Build and run with Docker:

```bash
cd backend
docker build -t mobius-backend .
docker run -p 8000:8000 -e ALLOWED_TOKEN=your-token mobius-backend
```

Or use docker-compose from the project root:

```bash
docker-compose up --build
```

## Environment Variables

- `ALLOWED_TOKEN` - API authentication token (default: "dev-token-123")
- `PYTHONPATH` - Set to backend directory for imports

## Development Notes

- Uses in-memory job store (TODO: Redis/DB for production)
- File uploads stored in `uploads/` directory
- Supports CORS for React frontend on localhost:3000
- Comprehensive error handling and validation
- Type hints and Pydantic models for API contracts

## Production Considerations

For production deployment:

1. Replace in-memory job store with Redis/Database
2. Add OAuth2/JWT authentication
3. Implement actual file processing logic
4. Add rate limiting and input validation
5. Use persistent storage for uploaded files
6. Add monitoring and logging
7. Configure proper CORS origins
8. Add SSL/TLS termination