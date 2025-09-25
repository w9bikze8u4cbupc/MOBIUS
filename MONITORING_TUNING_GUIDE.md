# Monitor Threshold Tuning Guide

The `scripts/monitor_dhash.sh` script uses environment variables to control thresholds and behavior. These can be tuned per environment or adjusted based on production telemetry.

## Environment Variables

| Variable | Default | Description |
|---------|---------|-------------|
| `HEALTH_URL` | `http://localhost:5000/health` | Health endpoint to poll |
| `METRICS_URL` | `http://localhost:5000/metrics/dhash` | Metrics endpoint |
| `ROLLBACK_SCRIPT` | `./scripts/rollback_dhash.sh` | Path to rollback script |
| `BACKUP_DIR` | `backups/` | Directory containing verified backups |
| `MONITOR_DURATION` | `3600` | Total monitoring window in seconds (60 min) |
| `FAST_INTERVAL` | `30` | Polling interval (first 5 minutes) |
| `SLOW_INTERVAL` | `120` | Polling interval (after 5 minutes) |
| `FAST_PERIOD` | `300` | Duration of fast polling in seconds |
| `EXTRACTION_FAILURE_RATE_ABS` | `10.0` | Absolute threshold for extraction failure rate (%) |
| `EXTRACTION_FAILURE_RATE_MULT` | `3` | Multiplier over baseline for failure rate |
| `P95_MS_ABS` | `30000` | Absolute threshold for p95 hash time (ms) |
| `P95_MS_MULT` | `3` | Multiplier over baseline for p95 |
| `LOW_CONF_QUEUE_ABS` | `100` | Absolute threshold for low-confidence queue |
| `LOW_CONF_QUEUE_MULT` | `5` | Multiplier over baseline for queue |

## Threshold Configuration Examples

### Conservative Production Tuning
For production environments where stability is critical:

```bash
# Strict thresholds for production
EXTRACTION_FAILURE_RATE_ABS=5.0 \
P95_MS_ABS=20000 \
LOW_CONF_QUEUE_ABS=50 \
EXTRACTION_FAILURE_RATE_MULT=2 \
P95_MS_MULT=2 \
LOW_CONF_QUEUE_MULT=3 \
./scripts/monitor_dhash.sh --env production
```

**Rationale:**
- Lower absolute thresholds catch issues early
- Reduced multipliers prevent gradual degradation
- Suitable for high-availability production systems

### Aggressive Staging Tuning
For staging environments where some variance is acceptable:

```bash
# Relaxed thresholds for staging
EXTRACTION_FAILURE_RATE_ABS=20.0 \
P95_MS_ABS=60000 \
LOW_CONF_QUEUE_ABS=200 \
EXTRACTION_FAILURE_RATE_MULT=5 \
P95_MS_MULT=4 \
LOW_CONF_QUEUE_MULT=10 \
./scripts/monitor_dhash.sh --env staging
```

**Rationale:**
- Higher thresholds accommodate test data variations
- Larger multipliers allow for experimental features
- Reduces false positive rollbacks during testing

### High-Traffic Load Tuning
For periods of expected high traffic:

```bash
# High-traffic optimized thresholds
EXTRACTION_FAILURE_RATE_ABS=15.0 \
P95_MS_ABS=45000 \
LOW_CONF_QUEUE_ABS=150 \
MONITOR_DURATION=7200 \
FAST_PERIOD=600 \
./scripts/monitor_dhash.sh --env production
```

**Rationale:**
- Increased absolute thresholds for expected load
- Extended monitoring duration for stability assessment
- Longer fast polling period for better data collection

## Baseline Behavior

### Initial Baseline Establishment
On the first poll, the script establishes baseline values for:
- P95 hash processing time
- Extraction failure rate
- Low-confidence queue length

These baselines are stored in `monitor_logs/baseline_{environment}.json`:

```json
{
  "extraction_failure_rate": 2.5,
  "p95_hash_time_ms": 15000,
  "low_confidence_queue_length": 25,
  "established_at": "2024-12-15T10:30:00Z"
}
```

### Baseline Reset Conditions
Baselines are automatically reset when:
- New deployment is detected
- Monitoring script runs after 24+ hours
- Baseline file is manually deleted

### Manual Baseline Reset
```bash
# Force baseline reset
rm monitor_logs/baseline_production.json
./scripts/monitor_dhash.sh --env production
```

## Environment-Specific Configurations

### Development Environment
```bash
# Development - very relaxed thresholds
EXTRACTION_FAILURE_RATE_ABS=50.0 \
P95_MS_ABS=120000 \
LOW_CONF_QUEUE_ABS=500 \
MONITOR_DURATION=900 \
FAST_INTERVAL=60 \
NO_ROLLBACK=true \
./scripts/monitor_dhash.sh --env development
```

### QA Environment
```bash
# QA - moderate thresholds with extended monitoring
EXTRACTION_FAILURE_RATE_ABS=25.0 \
P95_MS_ABS=90000 \
LOW_CONF_QUEUE_ABS=300 \
MONITOR_DURATION=5400 \
VERIFICATION_RETRIES=5 \
./scripts/monitor_dhash.sh --env qa
```

### Production Environment
```bash
# Production - strict thresholds with quick response
EXTRACTION_FAILURE_RATE_ABS=8.0 \
P95_MS_ABS=25000 \
LOW_CONF_QUEUE_ABS=75 \
MONITOR_DURATION=3600 \
FAST_INTERVAL=15 \
VERIFICATION_RETRIES=15 \
./scripts/monitor_dhash.sh --env production
```

## Dynamic Threshold Adjustment

### Time-Based Adjustments
For environments with predictable traffic patterns:

```bash
#!/bin/bash
# Adjust thresholds based on time of day

HOUR=$(date +%H)

if [ $HOUR -ge 9 ] && [ $HOUR -le 17 ]; then
    # Business hours - tighter thresholds
    export EXTRACTION_FAILURE_RATE_ABS=8.0
    export P95_MS_ABS=25000
    export LOW_CONF_QUEUE_ABS=75
else
    # Off-hours - relaxed thresholds
    export EXTRACTION_FAILURE_RATE_ABS=15.0
    export P95_MS_ABS=45000
    export LOW_CONF_QUEUE_ABS=150
fi

./scripts/monitor_dhash.sh --env production
```

### Load-Based Adjustments
Adjust thresholds based on current system load:

```bash
#!/bin/bash
# Adjust thresholds based on CPU usage

CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1}')

if (( $(echo "$CPU_USAGE > 80" | bc -l) )); then
    # High load - increase thresholds
    export P95_MS_ABS=50000
    export EXTRACTION_FAILURE_RATE_ABS=20.0
elif (( $(echo "$CPU_USAGE < 20" | bc -l) )); then
    # Low load - decrease thresholds
    export P95_MS_ABS=15000
    export EXTRACTION_FAILURE_RATE_ABS=5.0
fi

./scripts/monitor_dhash.sh --env production
```

## Monitoring and Alerting Integration

### Integration with Monitoring Systems

#### Prometheus/Grafana
Export monitoring data to Prometheus:

```bash
# Add Prometheus metrics export
PROMETHEUS_GATEWAY="http://prometheus-gateway:9091" \
METRICS_JOB="dhash-monitor" \
./scripts/monitor_dhash.sh --env production
```

#### Datadog
Send metrics to Datadog:

```bash
# Datadog integration
DATADOG_API_KEY="your-api-key" \
DD_TAGS="env:production,service:dhash" \
./scripts/monitor_dhash.sh --env production
```

### Alert Thresholds
Configure alerts based on monitoring patterns:

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Extraction Failure Rate | > 5% | > 10% | Investigate/Rollback |
| P95 Processing Time | > 20s | > 30s | Scale/Rollback |
| Queue Length | > 50 | > 100 | Process/Rollback |
| Consecutive Health Failures | 2 | 3 | Rollback |

## Logging and Debugging

### Log Analysis
Monitor logs are written to `monitor_logs/` by default:

```bash
# Analyze recent monitoring logs
tail -f monitor_logs/monitor_production_*.log

# Search for threshold violations
grep "threshold violations" monitor_logs/monitor_production_*.log

# Find rollback triggers
grep "Triggering rollback" monitor_logs/monitor_production_*.log
```

### Debug Mode
Enable verbose logging for troubleshooting:

```bash
# Enable debug logging
LOG_LEVEL=debug \
VERBOSE=true \
./scripts/monitor_dhash.sh --env staging
```

### Test Threshold Configuration
Validate thresholds without running full monitoring:

```bash
# Test configuration with short duration
MONITOR_DURATION=60 \
DRY_RUN=true \
./scripts/monitor_dhash.sh --env staging
```

## Performance Tuning

### Polling Optimization
Adjust polling intervals based on system responsiveness:

```bash
# High-frequency monitoring for critical deployments
FAST_INTERVAL=10 \
SLOW_INTERVAL=30 \
FAST_PERIOD=600 \
./scripts/monitor_dhash.sh --env production
```

### Resource Optimization
For resource-constrained environments:

```bash
# Reduced monitoring overhead
MONITOR_DURATION=1800 \
SLOW_INTERVAL=300 \
VERIFICATION_RETRIES=3 \
./scripts/monitor_dhash.sh --env staging
```

## Best Practices

### 1. Gradual Threshold Tightening
Start with relaxed thresholds and gradually tighten based on observed behavior:

```bash
# Week 1: Relaxed
EXTRACTION_FAILURE_RATE_ABS=20.0

# Week 2: Moderate  
EXTRACTION_FAILURE_RATE_ABS=15.0

# Week 3: Target
EXTRACTION_FAILURE_RATE_ABS=10.0
```

### 2. A/B Threshold Testing
Test different threshold configurations:

```bash
# Test A - Current production
EXTRACTION_FAILURE_RATE_ABS=10.0 ./scripts/monitor_dhash.sh &

# Test B - Tighter thresholds
EXTRACTION_FAILURE_RATE_ABS=8.0 ./scripts/monitor_dhash.sh &
```

### 3. Threshold Documentation
Document threshold changes with rationale:

```bash
# Document threshold changes
echo "$(date): Changed P95_MS_ABS from 30000 to 25000 - improved baseline after optimization" >> threshold_changes.log
```

### 4. Regular Review
Schedule regular threshold reviews:
- Weekly: Review monitoring logs
- Monthly: Analyze threshold effectiveness
- Quarterly: Update baselines based on system evolution

---

*Last updated: December 2024*
*Next review: January 2025*