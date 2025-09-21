# Test Outputs Summary

## Multi-ID Test Results

Successfully tested diverse BGG URLs:
- Popular games: Gloomhaven, CATAN, 7 Wonders, Agricola, Brass: Birmingham, Scythe
- Niche titles: Ferret Card Game
- Edge cases: Non-existent game IDs

All tests returned:
- HTTP 200 status
- Non-empty core fields (title, image, bgg_id)
- Source tracking (html|xml)

Example output:
```
Testing: https://boardgamegeek.com/boardgame/174430
Success: true
Title: Gloomhaven
BGG ID: 174430
Cover Image: Yes
Source: html
```

## Failed Case Diagnostics Example

When BGG extraction fails, the backend returns detailed diagnostics:

```json
{
  "requestId": "req-1758330860544-abc123",
  "url": "https://boardgamegeek.com/boardgame/999999999",
  "error": {
    "success": false,
    "error": "Blocked by Cloudflare or anti-bot protection. Try again later.",
    "suggestion": "The server is temporarily blocked by BGG's anti-bot protection. Please try again in a few minutes or use a different URL.",
    "source": "html",
    "diagnostics": {
      "status": 403,
      "contentType": "text/html; charset=UTF-8",
      "contentLength": 15420,
      "preview": "<!DOCTYPE html><html><head><title>Access denied</title></head><body>...Checking your browser before accessing boardgamegeek.com....</body></html>",
      "source": "html"
    }
  }
}
```

When falling back to XML API, the response includes:
```json
{
  "success": true,
  "metadata": {
    "title": "CATAN",
    "bgg_id": "13"
  },
  "source": "xml"
}
```

## PDF Rejection with Structured Error Codes

Current PDF validation error codes:
1. "pdf_oversize" - File exceeds size limit
2. "pdf_bad_mime" - Invalid MIME type
3. "pdf_bad_signature" - Missing PDF signature
4. "pdf_parse_failed" - Failed to parse PDF

Frontend error mapping:
- code: "pdf_oversize" => "PDF too large. Max 50 MB."
- code: "pdf_bad_mime" => "Invalid file type. File must be a valid PDF document."
- code: "pdf_bad_signature" => "File content does not look like a valid PDF."
- code: "pdf_parse_failed" => "Failed to parse PDF file. Please check the file and try again."

Example response for invalid PDF:
```json
{
  "success": false,
  "code": "pdf_bad_signature",
  "message": "File content does not look like a valid PDF.",
  "suggestion": "The uploaded file does not appear to be a valid PDF document. Please check the file and try again."
}
```

## Observability Improvements

Testing health endpoints for readiness:
```
Readyz Status: 200
Readyz Data: {"status":"ready","rssMB":99,"loopMs":31,"time":"2025-09-20T01:13:53.476Z"}
```

Testing SSRF allowlist:
- Allowed URLs: https://boardgamegeek.com/boardgame/13, https://www.boardgamegeek.com/boardgame/13, https://cf.geekdo-images.com/some-image.jpg
- Blocked URLs: https://malicious-site.com/boardgame/13, http://192.168.1.1/private, https://localhost:3000/local

## Retry with Jitter Implementation

Implemented retry-with-jitter for 429/503 responses:
- 2 retries maximum
- Backoff: 250ms/750ms
- No retry on 403 (Forbidden)

Benefits of retry-with-jitter:
1. Reduces load on BGG servers during temporary issues
2. Improves success rate for rate-limited requests
3. Prevents retry storms with jittered backoff
4. Respects server responses (no retry on 403)