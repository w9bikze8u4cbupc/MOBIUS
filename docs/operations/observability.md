# Observability in the Video Rendering Pipeline

This document describes the observability features implemented in the Mobius Tutorial Generator's video rendering pipeline.

## Metrics

The rendering pipeline exposes Prometheus metrics for monitoring performance and reliability. Metrics are available via an HTTP endpoint that can be scraped by Prometheus or other monitoring systems.

### Available Metrics

| Metric Name | Type | Description |
|-------------|------|-------------|
| `mobius_render_started_total` | Counter | Total number of renders started |
| `mobius_render_completed_total` | Counter | Total number of renders completed successfully |
| `mobius_render_failed_total` | Counter | Total number of renders that failed |
| `mobius_render_duration_seconds` | Histogram | Render durations in seconds |
| `mobius_ffmpeg_speed_ratio` | Histogram | FFmpeg processing speed ratio |

### Starting the Metrics Server

The metrics server can be started by calling the `startMetricsServer` function from the `metrics.js` module:

```javascript
import { startMetricsServer } from './src/render/metrics.js';

const server = startMetricsServer(9464); // Port defaults to METRICS_PORT env var or 9464
```

The metrics will be available at `http://localhost:9464/metrics`.

## Structured Logging

The pipeline uses structured logging with NDJSON format for better parseability and correlation. All log entries include timestamps, log levels, and correlation IDs.

### Log Fields

Each log entry includes the following fields:

- `ts`: ISO timestamp
- `level`: Log level (debug, info, warn, error)
- `message`: Log message
- `sessionId`: Unique identifier for the render session
- `jobId`: Unique identifier for the render job
- Additional context-specific fields

### Progress Logging

Progress updates include additional fields for tracking render progress:

- `stage`: Current rendering stage
- `progress`: Completion percentage (0-100)
- `eta`: Estimated time of arrival
- `speed`: Processing speed ratio
- `fps`: Frames per second

## Integration with OpenTelemetry (Optional)

The pipeline is designed to support OpenTelemetry integration for distributed tracing. This can be enabled by setting the `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable.

## Grafana Dashboard

A minimal Grafana dashboard can be imported to visualize the rendering metrics:

```json
{
  "title": "Mobius Rendering",
  "panels": [
    { 
      "type": "stat", 
      "title": "Success Rate (24h)", 
      "targets": [
        { 
          "expr": "1 - (sum(increase(mobius_render_failed_total[24h])) / clamp_min(sum(increase(mobius_render_started_total[24h])),1))" 
        }
      ]
    },
    { 
      "type": "graph", 
      "title": "Renders Started/Completed/Failed", 
      "targets": [
        { 
          "expr": "sum(increase(mobius_render_started_total[5m]))", 
          "legendFormat": "started" 
        },
        { 
          "expr": "sum(increase(mobius_render_completed_total[5m]))", 
          "legendFormat": "completed" 
        },
        { 
          "expr": "sum(increase(mobius_render_failed_total[5m]))", 
          "legendFormat": "failed" 
        }
      ]
    },
    { 
      "type": "graph", 
      "title": "P95 Duration by Mode (s)", 
      "targets": [
        { 
          "expr": "histogram_quantile(0.95, sum by (le, mode) (rate(mobius_render_duration_seconds_bucket[5m])))", 
          "legendFormat": "mode" 
        }
      ]
    }
  ]
}
```

## Usage in Applications

To use the observability features in your application:

1. Import the metrics module and start the server:
   ```javascript
   import { startMetricsServer } from './src/render/metrics.js';
   startMetricsServer(); // Defaults to port 9464
   ```

2. Use the structured logger:
   ```javascript
   import { logger } from './src/render/log.js';
   
   const log = logger.withContext({ component: 'my-app' });
   log.info('Application started');
   ```

3. The render function automatically integrates with both metrics and logging systems.

## Monitoring in CI/CD

In CI/CD environments, the metrics server can be configured to push metrics to a Prometheus Pushgateway instead of exposing an HTTP endpoint. This is particularly useful in short-lived CI environments.

## Security Considerations

- The metrics endpoint should not be exposed to public networks without authentication
- Log entries should not contain sensitive information
- Access to the metrics endpoint should be restricted in production environments