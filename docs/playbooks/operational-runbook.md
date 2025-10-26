# Mobius Games Tutorial Generator - Operational Runbook

## Overview
This document provides operational guidance for the Mobius Games Tutorial Generator, covering alerts, dashboards, saturation handling, retention policies, and service level objectives.

## System Components

### API Endpoints
- `GET /health` - Health check endpoint
- `GET /metrics` - Prometheus metrics endpoint
- `POST /api/ingest` - PDF ingestion endpoint
- `POST /api/preview` - Chapter preview generation endpoint
- `POST /api/export` - Tutorial package export endpoint

### Core Services
- PDF Text Extraction
- BoardGameGeek Metadata Fetching
- Storyboard Generation
- File Storage and Management
- Preview Generation
- Image Matching

## Configuration Parameters

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| API_VERSION | v1 | API version header |
| DATA_DIR | ./data | Canonical data directory |
| PORT | 5001 | Server port |
| INGEST_MAX_CONCURRENCY | 3 | Maximum concurrent ingestion tasks |
| INGEST_QUEUE_MAX | 20 | Maximum queue size for ingestion |
| UPLOAD_MAX_MB | 25 | Maximum upload file size in MB |
| NODE_ENV | production | Environment (production/development) |
| BGG_CACHE_TTL_MS | 86400000 (24h) | BGG cache time-to-live in milliseconds |
| BGG_RATE_LIMIT_QPS | 2 | BGG API rate limit in queries per second |
| KEEP_UPLOADS_DAYS | 30 | Days to retain uploaded files |
| KEEP_OUTPUT_DAYS | 90 | Days to retain output files |

## Monitoring and Alerting

### Key Metrics
- `requests_total` - Total HTTP requests
- `ingest_total` - Successful ingestions
- `ingest_errors_total` - Failed ingestions
- `ingest_rejected_saturated_total` - Rejected ingestions due to queue saturation
- `errors_total` - Total application errors
- `preview_requests_total` - Total preview requests
- `preview_failures_total` - Total preview failures
- `exports_generated_total` - Total exports generated
- `export_errors_total` - Total export errors

### Alerting Rules
1. **High Error Rate**: If `ingest_errors_total` increases by >10% in 5 minutes
2. **Queue Saturation**: If `ingest_rejected_saturated_total` > 5 in 10 minutes
3. **Service Unavailability**: If `health` endpoint returns non-200 for > 30 seconds
4. **High Latency**: If 95th percentile request latency > 5 seconds for 5 minutes
5. **Preview Failures**: If `preview_failures_total` > 3 in 10 minutes

### Dashboards
1. **Ingestion Throughput**: Requests per second, success/failure rates
2. **Resource Utilization**: CPU, memory, disk usage
3. **Queue Metrics**: Current queue size, saturation events
4. **BGG API Metrics**: Cache hit rate, API response times
5. **Preview Metrics**: Preview requests, failures, duration

## Saturation Handling

### Queue Management
- Maximum concurrent ingestion tasks: 3
- Maximum queue size: 20
- When queue is saturated, API returns 503 with `Retry-After` header
- Clients should implement exponential backoff when receiving 503

### Rate Limiting
- BGG API rate limited to 2 QPS
- Requests are queued and processed with proper delays
- Cache is used to minimize external API calls

## Retention Policies

### File Retention
- Uploaded files: 30 days
- Output files: 90 days
- Preview files: 7 days
- Export files: 30 days
- Janitor job runs daily to clean up expired files

### Cache Retention
- BGG metadata: 24 hours
- Cache is automatically refreshed after TTL expires

## Security

### File Validation
- Production environment only accepts PDF files
- Development environment allows PDF and text files
- Maximum file size enforced via Multer
- PDF header validation
- Suspicious content scanning (JavaScript, OpenAction, etc.)
- Encrypted PDF rejection

### Access Control
- CORS restricted to localhost:3000 by default
- File uploads stored in private data directory
- No direct access to uploaded files via API

## Service Level Objectives (SLOs)

### Availability
- 99.9% uptime for API endpoints
- 99.5% success rate for ingestion requests
- 99.0% success rate for preview requests

### Latency
- 95% of requests < 2 seconds
- 99% of requests < 5 seconds
- Preview requests < 10 seconds

### Durability
- 99.99% data persistence for generated storyboards
- 99.9% successful BGG metadata retrieval
- 99.5% successful preview generation

## Response Schema (v1)

### Health Endpoint
```json
{
  "status": "ok",
  "time": "2025-10-08T17:02:05.323Z",
  "requestId": "req_1caqt21zmgi8ks8t",
  "hostname": "Cactuar",
  "pid": 63544
}
```

### Metrics Endpoint
```json
{
  "counters": {
    "requests_total": 42,
    "ingest_total": 5,
    "ingest_errors_total": 1,
    "ingest_rejected_saturated_total": 0,
    "errors_total": 1,
    "preview_requests_total": 3,
    "preview_failures_total": 0,
    "exports_generated_total": 2,
    "export_errors_total": 0
  }
}
```

### Ingest Endpoint (Success)
```json
{
  "ok": true,
  "id": "1a2b3c",
  "file": "123456_rulebook.pdf",
  "summary": {
    "pages": 24,
    "chunks": 24,
    "tocDetected": true,
    "flags": {
      "pagesWithLowTextRatio": [],
      "componentsDetected": true
    }
  },
  "bgg": {
    "title": "Wingspan",
    "year": 2019,
    "designers": ["Elizabeth Hargrave"],
    "players": "1-5",
    "time": "40-70",
    "age": "10+"
  },
  "storyboardPath": "output/1a2b3c_storyboard.json"
}
```

### Preview Endpoint (Success)
```json
{
  "status": "queued",
  "requestId": "req_123456",
  "jobToken": "abc123",
  "previewPath": "previews/project1/chapter1.json"
}
```

### Export Endpoint (Success)
```json
{
  "ok": true,
  "exportId": "def456",
  "files": {
    "chapters": "exports/def456_chapters.json",
    "srt": "exports/def456_script.srt",
    "meta": "exports/def456_meta.json"
  },
  "generatedAt": "2025-10-08T17:02:05.323Z"
}
```

### Error Response
```json
{
  "error": "Server busy, try again later"
}
```

## Troubleshooting

### Common Issues

1. **503 Errors**
   - Cause: Ingestion queue is saturated
   - Solution: Wait for `Retry-After` seconds and retry request

2. **PDF Parsing Failures**
   - Cause: Corrupted or encrypted PDF
   - Solution: Verify PDF integrity, ensure it's not encrypted

3. **BGG Metadata Not Found**
   - Cause: Invalid BGG ID or network issues
   - Solution: Verify BGG ID, check network connectivity

4. **File Upload Rejected**
   - Cause: Invalid file type or size in production
   - Solution: Ensure file is PDF and under size limit

5. **Preview Generation Failures**
   - Cause: Invalid chapter data or system resource issues
   - Solution: Verify chapter structure, check system resources

### Log Analysis
- Structured JSON logs with request correlation
- Log levels: info, warn, error
- Request IDs for tracing operations
- Metrics counters for system state monitoring

## Maintenance

### Daily Tasks
- Janitor job runs to clean up expired files
- Monitor queue saturation metrics
- Check BGG API rate limit usage
- Verify preview and export file retention

### Weekly Tasks
- Review error logs for patterns
- Verify backup integrity
- Update dependencies

### Monthly Tasks
- Review and adjust retention policies
- Performance tuning
- Security audit

## Phase F Features

### Script Workbench
The Script Workbench provides a unified interface for:
- Managing script content (chapters and steps)
- Matching images to steps
- Generating previews of chapters
- Exporting tutorial packages

### Image Matcher
The Image Matcher allows:
- Drag-and-drop association of images with steps
- Visual preview of asset placement
- Management of asset libraries
- Persistence of image-step mappings

### Preview Generation
Preview generation features:
- Dry-run mode for testing
- Asynchronous processing with job queuing
- Status tracking via job tokens
- Artifact storage in canonical data directory

### Export Packaging
Export packaging capabilities:
- Generation of chapters.json, SRT, and metadata files
- Bundling of all tutorial assets
- Versioned export identifiers
- Automated file organization