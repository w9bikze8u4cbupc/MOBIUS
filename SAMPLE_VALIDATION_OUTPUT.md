# Sample Validation Output

This document shows examples of the expected validation output for each test case.

## SSRF Validation

### Direct Disallowed Host
```json
{
  "success": false,
  "code": "url_disallowed",
  "message": "URL not allowed by policy",
  "requestId": "test-ssrf-1"
}
```
Status: 400

### Allowed Host Redirecting to Disallowed
```json
{
  "success": false,
  "code": "url_disallowed",
  "message": "URL not allowed by policy",
  "requestId": "test-ssrf-2"
}
```
Status: 400

## PDF Validation Matrix

### Valid PDF
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "filename": "valid-small.pdf",
  "size": 1234,
  "validationDetails": {
    "fileSize": 1234,
    "fileName": "valid-small.pdf",
    "fileType": "application/pdf",
    "hasPdfSignature": true
  }
}
```
Status: 200

### Oversized PDF
```json
{
  "success": false,
  "code": "pdf_oversize",
  "message": "File too large. Maximum size allowed is 50MB.",
  "suggestion": "Please upload a smaller PDF file (under 50MB)."
}
```
Status: 400

### Wrong MIME Type
```json
{
  "success": false,
  "code": "pdf_bad_signature",
  "message": "Invalid PDF file - missing PDF signature",
  "suggestion": "The uploaded file does not appear to be a valid PDF document. Please check the file and try again.",
  "validationDetails": {
    "fileSize": 12,
    "fileName": "not-a-pdf.pdf",
    "fileType": "application/pdf",
    "hasPdfSignature": false
  }
}
```
Status: 400

## Retry-with-Jitter Test Logs

```
BGG fetch attempt 1 failed with 429, retrying in 250ms...
BGG fetch attempt 2 failed with 429, retrying in 750ms...
Attempt 3: Status 200 (Success)
```

## Readiness Endpoint

### Healthy State
```json
{
  "status": "ready",
  "timings": {
    "bgg_dns_resolve": 45,
    "worker_pool_ping": 5
  },
  "rssMB": 85,
  "loopMs": 0,
  "time": "2025-09-19T22:30:45.123Z"
}
```
Status: 200

### Unhealthy State (Worker Pool Saturation)
```json
{
  "status": "not_ready",
  "reasons": ["worker_pool_ping_failed"],
  "timings": {
    "bgg_dns_resolve": 35,
    "worker_pool_ping": null
  },
  "rssMB": 85,
  "loopMs": 0,
  "time": "2025-09-19T22:30:45.123Z"
}
```
Status: 503

### Unhealthy State (DNS Failure)
```json
{
  "status": "not_ready",
  "reasons": ["bgg_connectivity"],
  "timings": {
    "bgg_dns_resolve": 3000,
    "worker_pool_ping": 5
  },
  "rssMB": 85,
  "loopMs": 0,
  "time": "2025-09-19T22:30:45.123Z"
}
```
Status: 503

## Correlation ID Flow

### Request Headers
```
X-Request-ID: req-12345-test-flow
Content-Type: application/json
```

### Response Headers
```
X-Request-ID: req-12345-test-flow
```

### Error Response with Correlation ID
```json
{
  "success": false,
  "code": "url_disallowed",
  "message": "URL not allowed by policy",
  "requestId": "req-12345-test-flow"
}
```

## Frontend Toast Messages

| Error Code | Toast Message |
|------------|---------------|
| url_disallowed | "URL not allowed by policy." |
| fetch_timeout | "BGG timed out. Try again shortly." |
| pdf_oversize | "PDF too large (max 50 MB)." |
| pdf_bad_mime | "File must be a PDF." |
| pdf_bad_signature | "File content isn't a valid PDF." |

These samples demonstrate the expected behavior of all implemented features and validation tests.