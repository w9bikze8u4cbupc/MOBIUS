# Deployment Monitoring and Threshold Tuning

This guide helps maintainers configure and tune monitoring thresholds for the MOBIUS deployment system.

## Monitor Configuration

The monitoring system uses the following default thresholds defined in `PR_MERGE_CHECKLIST.md`:

### Health Monitoring
- **Health endpoint**: `GET /health` → expected `"status": "OK"`
- **Check frequency**: Every 30s for first 5 minutes, then every 2 minutes
- **Monitor duration**: 60 minutes post-deployment

### Performance Metrics
- **avg_hash_time**: Average time to process hash operations
- **p95_hash_time**: 95th percentile processing time
- **extraction_failures_rate**: Percentage of failed extractions
- **low_confidence_queue_length**: Number of items requiring manual review

### Rollback Triggers
- Health check fails for >2 consecutive checks
- `extraction_failures_rate > 10%` OR `> 3× baseline`
- `p95_hash_time > 30s` OR `> 3× baseline` for 3 consecutive checks  
- `low_confidence_queue_length > 100` OR `> 5× baseline`

## Tuning Thresholds

### 1. Environment Variables
Configure monitoring behavior via environment variables:

```bash
export HEALTH_URL="http://localhost:5000/health"
export METRICS_URL="http://localhost:5000/metrics/dhash" 
export MONITOR_INTERVAL=30        # seconds (initial frequency)
export MONITOR_DURATION=3600      # seconds (60 minutes)
```

### 2. Baseline Calculation
Establish baseline metrics during stable periods:

```bash
# Run monitoring script to collect baseline data
./scripts/monitor_baseline.sh --duration 1800 --output baseline_metrics.json

# Example baseline_metrics.json:
{
  "avg_hash_time_baseline": 2.5,
  "p95_hash_time_baseline": 8.0, 
  "extraction_failures_rate_baseline": 1.2,
  "low_confidence_queue_length_baseline": 15
}
```

### 3. Threshold Adjustment
Modify thresholds based on your system's performance characteristics:

**Conservative (recommended for first 24-72 hours):**
```bash
# Lower thresholds for early detection
export HASH_TIME_P95_THRESHOLD=20        # seconds
export FAILURE_RATE_THRESHOLD=5          # percent
export QUEUE_LENGTH_THRESHOLD=50         # count
export BASELINE_MULTIPLIER=2             # 2× baseline instead of 3×
```

**Production-tuned (after stable telemetry):**
```bash
# Higher thresholds to reduce false positives
export HASH_TIME_P95_THRESHOLD=45        # seconds  
export FAILURE_RATE_THRESHOLD=15         # percent
export QUEUE_LENGTH_THRESHOLD=150        # count
export BASELINE_MULTIPLIER=4             # 4× baseline
```

## Manual Monitoring Commands

### Check System Health
```bash
# Quick health check
curl -fsS http://localhost:5000/health | jq .

# Get current metrics
curl -fsS http://localhost:5000/metrics/dhash | jq .
```

### Run Monitoring Script Manually  
```bash
# Monitor for 30 minutes with custom thresholds
./scripts/monitor_deployment.sh \
  --duration 1800 \
  --health-url http://localhost:5000/health \
  --metrics-url http://localhost:5000/metrics/dhash \
  --p95-threshold 25 \
  --failure-rate-threshold 8 \
  --queue-threshold 75
```

### Collect Metrics Snapshots
```bash
# Take snapshot at key intervals
curl -fsS http://localhost:5000/metrics/dhash > metrics_snapshot_$(date +%Y%m%d_%H%M%S).json

# Compare with baseline
./scripts/compare_metrics.sh metrics_snapshot_20240101_120000.json baseline_metrics.json
```

## Threshold Recommendations by Environment

### Staging Environment
- Use **conservative thresholds** (2× baseline)
- Monitor for **30 minutes** post-deploy
- Check every **15 seconds** initially

### Production Environment  
- Use **balanced thresholds** (3× baseline) initially
- Monitor for **60 minutes** post-deploy
- Check every **30 seconds** for 5 minutes, then every **2 minutes**
- Escalate to on-call for any rollback triggers

### Development Environment
- Use **relaxed thresholds** (5× baseline)  
- Monitor for **15 minutes** post-deploy
- Check every **60 seconds**

## Alerting Integration

Configure alerts for your monitoring system:

```bash
# Slack webhook example
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

# PagerDuty integration key
export PAGERDUTY_INTEGRATION_KEY="your-integration-key"

# Email notifications
export ALERT_EMAIL="ops@yourcompany.com"
```

## Troubleshooting

### High False Positive Rate
- Increase baseline multiplier from 3× to 4× or 5×
- Extend monitoring intervals to reduce noise
- Review baseline calculations during peak load periods

### Missed Issues  
- Decrease baseline multiplier from 3× to 2×
- Reduce monitoring intervals for faster detection
- Add additional metrics to monitoring suite

### Performance Impact
- Increase monitoring intervals to reduce system load
- Use sampling for metrics collection
- Implement metrics caching

## Metrics Dashboard

Consider setting up a dashboard with:
- Real-time health status
- Performance metrics over time
- Deployment timeline overlay
- Alert history and resolution times

Popular options: Grafana, DataDog, New Relic, or custom dashboard using the metrics endpoints.