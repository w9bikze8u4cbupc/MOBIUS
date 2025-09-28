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

### Using cURL

1. Start an ingestion job:
```bash
curl -X POST "http://localhost:8000/api/ingest" \
     -H "Authorization: Bearer REPLACE_WITH_PROD_TOKEN" \
     -F "metadata={\"test\":\"data\"}"
```

2. Check job status:
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

### Using the React UI

1. Open http://localhost:3000
2. Import the GlowingOrbWithBackend component into your main App.js
3. Select a file and click "Start Ingest"
4. Watch the progress updates in real-time

## API Endpoints

- `POST /api/ingest` - Start a new ingestion job (returns job_id)
- `GET /api/status/{job_id}` - Get current job status and progress
- `WebSocket /ws/status/{job_id}?token=TOKEN` - Real-time status updates

## Security Notes

- Replace `REPLACE_WITH_PROD_TOKEN` with a secure token in production
- Implement proper JWT/OAuth authentication instead of bearer tokens
- Use HTTPS in production
- Add rate limiting and input validation