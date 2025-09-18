# Go-Live Runbook

## Deploy

```bash
pm2 start ecosystem.config.js --env production
pm2 save && pm2 startup
```

## Smoke Tests

```bash
curl /api/health
curl /api/health/details
curl /metrics
```

## Rollback

```bash
pm2 revert 1
# or
pm2 restart mobius-api@previous
```

## On-call Quick Checks

```bash
# Tail logs
pm2 logs mobius-api

# Analyze latest output
ffprobe on latest output

# Check metrics
curl /metrics
# Confirm counters moving
```

## Emergency Procedures

### High Error Rate
1. Check logs: `pm2 logs mobius-api`
2. Check system resources: `pm2 monit`
3. Check recent deploys
4. Consider rollback if error rate > 5%

### High Latency
1. Check system resources
2. Check downstream dependencies
3. Check for network issues
4. Consider scaling if sustained > 1s P95

### TTS Issues
1. Check ElevenLabs API key
2. Check rate limits
3. Check cache health
4. Verify network connectivity