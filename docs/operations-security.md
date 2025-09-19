# Operations & Security

## Security Model

### BGG Allowlist and SSRF Prevention
The application implements a strict URL allowlist to prevent Server-Side Request Forgery (SSRF) attacks. Only the following hosts are permitted:
- `boardgamegeek.com` and `www.boardgamegeek.com`
- `cf.geekdo-images.com`
- `geekdo-static.com`
- `localhost` and `127.0.0.1` (development only)

This prevents malicious users from making the server fetch data from internal services or other unauthorized endpoints.

### PDF Validation
PDF uploads are validated with multiple layers of security:
1. **Size Limits**: Maximum 50MB file size
2. **MIME Type Checking**: Only `application/pdf` files are accepted
3. **File Signature Verification**: PDF files must start with the `%PDF-` magic header
4. **Content Validation**: PDF content is parsed to ensure it's a valid PDF document

### Rate Limiting
API endpoints are protected with token bucket rate limiting to prevent abuse:
- Default: 10 requests per minute for BGG API calls
- Configurable via environment variables
- Includes standard HTTP headers for client-friendly rate limiting:
  - `Retry-After`
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`

## Health and Readiness

### Liveness Endpoint
- **Path**: `/livez`
- **Purpose**: Basic health check to determine if the service is running
- **Response**: `200 OK` with "OK" text

### Readiness Endpoint
- **Path**: `/readyz`
- **Purpose**: Comprehensive health check to determine if the service is ready to serve requests
- **Checks**:
  - Required API keys present
  - Event loop delay within acceptable range
  - Memory usage within limits
  - Outbound HTTP connectivity to BGG
  - Temp directory writeability
  - Cache directory access

## Observability

### Correlation IDs
All requests are assigned a correlation ID that is:
- Passed through via `X-Request-ID` header if provided
- Auto-generated if not provided
- Included in all log entries for request tracing
- Returned in response headers for client-side tracing

### Structured Logging
The application uses structured JSON logging with the following fields:
- `level`: Log level (info, warn, error)
- `requestId`: Correlation ID for request tracing
- `method`: HTTP method
- `path`: Request path
- `timestamp`: ISO timestamp
- `message`: Log message
- `durationMs`: Request duration in milliseconds (for completed requests)

## Worker Pool

### Concurrency Management
PDF processing is handled in worker threads to keep the main server responsive:
- Maximum 2 concurrent workers by default
- Configurable via environment variables
- Workers are recycled after 100 jobs or 1 hour of operation

### Memory Safety
Worker threads are monitored for memory usage:
- Maximum 500MB heap per worker
- Workers are terminated and recycled if they exceed memory limits
- Automatic cleanup of worker resources on completion

## Environment Configuration

### Required Environment Variables
- `PORT`: Server port (default: 5001)
- `NODE_ENV`: Environment (development/production)
- `BACKEND_URL`: Backend URL for CORS configuration
- `CORS_ORIGIN`: Comma-separated list of allowed origins

### Optional Environment Variables
- `REQUEST_TIMEOUT_MS`: Request timeout in milliseconds (default: 30000)
- `HEALTH_CHECK_TIMEOUT_MS`: Health check timeout in milliseconds (default: 5000)
- `BGG_FETCH_TIMEOUT_MS`: BGG fetch timeout in milliseconds (default: 10000)
- `BGG_RATE_LIMIT_REQUESTS`: BGG API rate limit requests (default: 10)
- `BGG_RATE_LIMIT_WINDOW_MS`: BGG API rate limit window in milliseconds (default: 60000)
- `MAX_WORKERS`: Maximum PDF worker threads (default: 2)
- `MAX_JOBS_PER_WORKER`: Maximum jobs per worker before recycling (default: 100)