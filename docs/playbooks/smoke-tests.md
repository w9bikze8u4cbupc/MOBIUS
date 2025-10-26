# Exact smoke tests to run after staging deploy

## Dry-run preview (replace staging host)

```bash
curl -X POST "https://staging.example.com/api/preview?dryRun=true" \
  -H "Content-Type: application/json" \
  -H "x-api-version: v1" \
  -d '{"projectId":"smoke","chapterId":"c1","chapter":{"title":"smoke","steps":[{"id":"s1","title":"t","body":"b"}]}}'
```

**Expect** 202 and JSON with `{ status: "dry_run" | "queued", jobToken, previewPath }`.

## Confirm artifact exists (on staging host or mounted DATA_DIR)

```bash
# run on staging host or where DATA_DIR is accessible
ls -l ./data/previews/smoke/c1.json
jq . ./data/previews/smoke/c1.json
```

## Confirm metric increment (example scraping /metrics)

```bash
curl https://staging.example.com/metrics | grep preview_requests_total
```

**Expect** incremented counter.

## Queue/back-pressure test

**Set:**
```
PREVIEW_MAX_CONCURRENCY=1
PREVIEW_QUEUE_MAX=2 (for this test)
```

Then concurrently fire 3 non-dry-run preview requests. **Expected:**

First accepted/queued, second either queued/accepted depending on queue behavior, third should trigger 503 + Retry-After if queue is saturated.