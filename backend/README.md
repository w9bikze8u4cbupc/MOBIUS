# Backend API Integration Setup

This document describes how to run and test the new FastAPI backend integration with WebSocket support for real-time job status updates.

## Prerequisites

- Python 3.8+
- Node.js 16+
- npm

## Backend Setup (FastAPI)

1. Install Python dependencies:
```bash
cd backend
pip install -r requirements.txt
```

2. Start the FastAPI server:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at http://localhost:8000

## Frontend Setup (React)

1. Install dependencies:
```bash
cd client
npm install
```

2. Create a `.env` file in the client directory:
```bash
REACT_APP_API_BASE=http://localhost:8000
REACT_APP_API_TOKEN=REPLACE_WITH_PROD_TOKEN
```

3. Start the React development server:
```bash
npm start
```

The frontend will be available at http://localhost:3000

## Testing the Integration

### Using the React UI

1. Open http://localhost:3000
2. Scroll down to the "🚀 FastAPI Backend Integration Demo" section
3. **Test without file**: Click "Start Ingest" to test basic ingestion
4. **Test with file**: Click "Choose File", select a file, then "Start Ingest"
5. Watch real-time progress updates via WebSocket
6. Use "Poll Status" button for fallback status checking

**Features Demonstrated:**
- ✅ Real-time WebSocket status updates
- ✅ File upload support with SHA256 hashing
- ✅ Background job processing with progress tracking
- ✅ Bearer token authentication
- ✅ Exponential backoff retry logic
- ✅ Automatic WebSocket cleanup on completion

### Using cURL

1. Start an ingestion job (no file):
```bash
curl -X POST "http://localhost:8000/api/ingest" \
     -H "Authorization: Bearer REPLACE_WITH_PROD_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"metadata": "{\"test\":\"data\"}"}'
```

2. Start an ingestion job (with file):
```bash
curl -X POST "http://localhost:8000/api/ingest" \
     -H "Authorization: Bearer REPLACE_WITH_PROD_TOKEN" \
     -F "file=@test.txt" \
     -F "metadata={\"source\":\"curl\"}"
```

3. Check job status:
```bash
curl "http://localhost:8000/api/status/JOB_ID" \
     -H "Authorization: Bearer REPLACE_WITH_PROD_TOKEN"
```

### Using PowerShell

```powershell
$token = "REPLACE_WITH_PROD_TOKEN"
$res = Invoke-RestMethod -Uri "http://localhost:8000/api/ingest" -Method Post -Headers @{ Authorization = "Bearer $token" } -Body @{ metadata = "{}" }
$jobId = $res.job_id
Invoke-RestMethod -Uri "http://localhost:8000/api/status/$jobId" -Method Get -Headers @{ Authorization = "Bearer $token" }
```

### WebSocket Testing

You can test WebSocket connections directly using browser console or wscat:

```bash
# Install wscat if needed
npm install -g wscat

# Connect to WebSocket (replace JOB_ID and token)
wscat -c "ws://localhost:8000/ws/status/JOB_ID?token=REPLACE_WITH_PROD_TOKEN"
```

## API Endpoints

- `POST /api/ingest` - Start a new ingestion job (returns job_id)
- `GET /api/status/{job_id}` - Get current job status and progress
- `WebSocket /ws/status/{job_id}?token=TOKEN` - Real-time status updates

## Architecture Overview

### FastAPI Backend (Port 8000)
- **Background Tasks**: Uses FastAPI BackgroundTasks for async processing
- **In-Memory Storage**: Job states stored in memory (easily replaceable with Redis/DB)
- **WebSocket Management**: Active connections tracked per job_id
- **File Processing**: Supports multipart uploads with SHA256 hashing

### React Frontend Integration
- **Environment Variables**: API base URL and token configurable
- **Error Handling**: Exponential backoff with jitter for network resilience
- **Real-time Updates**: WebSocket integration with automatic cleanup
- **Fallback Polling**: Manual status checking when needed

### Communication Flow
1. React sends POST to `/api/ingest` with optional file
2. FastAPI returns job_id and starts background processing
3. React opens WebSocket connection to `/ws/status/{job_id}`
4. FastAPI sends periodic status updates via WebSocket
5. WebSocket closes automatically when job completes

## Security Notes

- Replace `REPLACE_WITH_PROD_TOKEN` with a secure token in production
- Implement proper JWT/OAuth authentication instead of bearer tokens
- Use HTTPS in production
- Add rate limiting and input validation
- Consider implementing proper session management

## Production Deployment

For production deployment:

1. **Database Integration**: Replace in-memory job storage with Redis or PostgreSQL
2. **Queue Management**: Use Celery, RQ, or similar for robust background processing
3. **Authentication**: Implement OAuth2/JWT with proper scopes
4. **Monitoring**: Add health checks, metrics, and logging
5. **Scaling**: Consider horizontal scaling with shared state storage