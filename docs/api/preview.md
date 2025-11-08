# Preview API

## Overview
The Preview API allows generating previews of tutorial chapters for review before final rendering.

## Endpoints

### POST /api/preview

Generate a preview of a chapter.

#### Request

```http
POST /api/preview HTTP/1.1
Host: localhost:5001
Content-Type: application/json
x-api-version: v1
```

##### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| dryRun | boolean | If true, performs a dry run without generating actual preview (default: false) |

##### Request Body
```json
{
  "projectId": "string",
  "chapterId": "string",
  "chapter": {
    "title": "string",
    "steps": [
      {
        "id": "string",
        "text": "string"
      }
    ]
  }
}
```

#### Response

##### 202 Accepted
```json
{
  "status": "queued|dry_run",
  "requestId": "string",
  "jobToken": "string",
  "previewPath": "string"
}
```

##### 400 Bad Request
```json
{
  "error": "projectId, chapterId, and chapter payload are required"
}
```

##### 422 Unprocessable Entity
```json
{
  "error": "chapter.steps must be an array"
}
```

## Metrics

The Preview API collects the following metrics:

- `preview_requests_total` - Total number of preview requests
- `preview_failures_total` - Total number of preview failures
- `preview_duration_ms` - Duration of preview requests in milliseconds

## Security

The Preview API enforces the same security measures as the rest of the application:
- File size limits
- Rate limiting
- Input validation
- Structured logging

## Usage Examples

### Generate a preview
```bash
curl -X POST http://localhost:5001/api/preview \
  -H "Content-Type: application/json" \
  -H "x-api-version: v1" \
  -d '{
    "projectId": "my-project",
    "chapterId": "chapter-1",
    "chapter": {
      "title": "Introduction",
      "steps": [
        {
          "id": "step-1",
          "text": "Welcome to the tutorial"
        }
      ]
    }
  }'
```

### Generate a dry-run preview
```bash
curl -X POST "http://localhost:5001/api/preview?dryRun=true" \
  -H "Content-Type: application/json" \
  -H "x-api-version: v1" \
  -d '{
    "projectId": "my-project",
    "chapterId": "chapter-1",
    "chapter": {
      "title": "Introduction",
      "steps": [
        {
          "id": "step-1",
          "text": "Welcome to the tutorial"
        }
      ]
    }
  }'
```