# MOBIUS Deployment Notification Templates

This directory contains standardized notification templates for Slack and Microsoft Teams.

## Slack Templates

### Deployment Started
```json
{
  "username": "MOBIUS Deploy Bot",
  "icon_emoji": ":rocket:",
  "attachments": [
    {
      "color": "good",
      "title": "🚀 MOBIUS Deployment Started",
      "text": "Deployment for version {{VERSION}} has begun",
      "fields": [
        {
          "title": "Environment",
          "value": "{{ENVIRONMENT}}",
          "short": true
        },
        {
          "title": "Version",
          "value": "{{VERSION}}",
          "short": true
        },
        {
          "title": "Deploy Operator",
          "value": "{{OPERATOR}}",
          "short": true
        },
        {
          "title": "Started At",
          "value": "{{TIMESTAMP}}",
          "short": true
        }
      ],
      "footer": "MOBIUS Deployment Framework",
      "ts": "{{UNIX_TIMESTAMP}}"
    }
  ]
}
```

### Deployment Success
```json
{
  "username": "MOBIUS Deploy Bot", 
  "icon_emoji": ":white_check_mark:",
  "attachments": [
    {
      "color": "good",
      "title": "✅ MOBIUS Deployment Successful",
      "text": "Deployment completed successfully in {{DURATION}}",
      "fields": [
        {
          "title": "Environment",
          "value": "{{ENVIRONMENT}}",
          "short": true
        },
        {
          "title": "Version",
          "value": "{{VERSION}}",
          "short": true
        },
        {
          "title": "Duration",
          "value": "{{DURATION}}",
          "short": true
        },
        {
          "title": "Smoke Tests",
          "value": "{{SMOKE_TEST_STATUS}}",
          "short": true
        }
      ],
      "actions": [
        {
          "type": "button",
          "text": "View Health Check",
          "url": "{{HEALTH_CHECK_URL}}"
        }
      ],
      "footer": "MOBIUS Deployment Framework",
      "ts": "{{UNIX_TIMESTAMP}}"
    }
  ]
}
```

### Deployment Failed
```json
{
  "username": "MOBIUS Deploy Bot",
  "icon_emoji": ":x:",
  "attachments": [
    {
      "color": "danger",
      "title": "❌ MOBIUS Deployment Failed",
      "text": "Deployment failed: {{ERROR_MESSAGE}}",
      "fields": [
        {
          "title": "Environment", 
          "value": "{{ENVIRONMENT}}",
          "short": true
        },
        {
          "title": "Version",
          "value": "{{VERSION}}",
          "short": true
        },
        {
          "title": "Error",
          "value": "{{ERROR_MESSAGE}}",
          "short": false
        },
        {
          "title": "Rollback Status",
          "value": "{{ROLLBACK_STATUS}}",
          "short": true
        }
      ],
      "actions": [
        {
          "type": "button",
          "text": "View Logs",
          "url": "{{LOG_URL}}"
        },
        {
          "type": "button",
          "text": "Incident Response",
          "url": "{{INCIDENT_URL}}"
        }
      ],
      "footer": "MOBIUS Deployment Framework",
      "ts": "{{UNIX_TIMESTAMP}}"
    }
  ]
}
```

### Rollback Triggered
```json
{
  "username": "MOBIUS Deploy Bot",
  "icon_emoji": ":warning:",
  "attachments": [
    {
      "color": "warning",
      "title": "⚠️ MOBIUS Rollback Triggered",
      "text": "Automatic rollback initiated: {{REASON}}",
      "fields": [
        {
          "title": "Environment",
          "value": "{{ENVIRONMENT}}",
          "short": true
        },
        {
          "title": "Trigger Reason",
          "value": "{{REASON}}",
          "short": false
        },
        {
          "title": "Backup File",
          "value": "{{BACKUP_FILE}}",
          "short": true
        },
        {
          "title": "Rollback Status",
          "value": "In Progress",
          "short": true
        }
      ],
      "footer": "MOBIUS Deployment Framework",
      "ts": "{{UNIX_TIMESTAMP}}"
    }
  ]
}
```

### Monitoring Alert
```json
{
  "username": "MOBIUS Deploy Bot",
  "icon_emoji": ":warning:",
  "attachments": [
    {
      "color": "warning",
      "title": "🚨 MOBIUS Monitoring Alert",
      "text": "{{METRIC}} exceeded threshold",
      "fields": [
        {
          "title": "Environment",
          "value": "{{ENVIRONMENT}}",
          "short": true
        },
        {
          "title": "Metric",
          "value": "{{METRIC}}",
          "short": true
        },
        {
          "title": "Current Value",
          "value": "{{CURRENT_VALUE}}",
          "short": true
        },
        {
          "title": "Threshold",
          "value": "{{THRESHOLD}}",
          "short": true
        }
      ],
      "footer": "MOBIUS Deployment Framework",
      "ts": "{{UNIX_TIMESTAMP}}"
    }
  ]
}
```

## Microsoft Teams Templates

### Deployment Started
```json
{
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions",
  "themeColor": "0076D7",
  "summary": "MOBIUS Deployment Started",
  "sections": [
    {
      "activityTitle": "🚀 MOBIUS Deployment Started",
      "activitySubtitle": "Version {{VERSION}} deployment initiated",
      "activityImage": "https://via.placeholder.com/32x32/0076D7/ffffff?text=M",
      "facts": [
        {
          "name": "Environment:",
          "value": "{{ENVIRONMENT}}"
        },
        {
          "name": "Version:",
          "value": "{{VERSION}}"
        },
        {
          "name": "Deploy Operator:",
          "value": "{{OPERATOR}}"
        },
        {
          "name": "Started At:",
          "value": "{{TIMESTAMP}}"
        }
      ],
      "markdown": true
    }
  ]
}
```

### Deployment Success
```json
{
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions",
  "themeColor": "00FF00",
  "summary": "MOBIUS Deployment Successful",
  "sections": [
    {
      "activityTitle": "✅ MOBIUS Deployment Successful",
      "activitySubtitle": "Deployment completed in {{DURATION}}",
      "activityImage": "https://via.placeholder.com/32x32/00FF00/ffffff?text=✓",
      "facts": [
        {
          "name": "Environment:",
          "value": "{{ENVIRONMENT}}"
        },
        {
          "name": "Version:",
          "value": "{{VERSION}}"
        },
        {
          "name": "Duration:",
          "value": "{{DURATION}}"
        },
        {
          "name": "Smoke Tests:",
          "value": "{{SMOKE_TEST_STATUS}}"
        }
      ],
      "markdown": true
    }
  ],
  "potentialAction": [
    {
      "@type": "OpenUri",
      "name": "View Health Check",
      "targets": [
        {
          "os": "default",
          "uri": "{{HEALTH_CHECK_URL}}"
        }
      ]
    }
  ]
}
```

### Deployment Failed
```json
{
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions", 
  "themeColor": "FF0000",
  "summary": "MOBIUS Deployment Failed",
  "sections": [
    {
      "activityTitle": "❌ MOBIUS Deployment Failed",
      "activitySubtitle": "Immediate attention required",
      "activityImage": "https://via.placeholder.com/32x32/FF0000/ffffff?text=✗",
      "facts": [
        {
          "name": "Environment:",
          "value": "{{ENVIRONMENT}}"
        },
        {
          "name": "Version:",
          "value": "{{VERSION}}"
        },
        {
          "name": "Error:",
          "value": "{{ERROR_MESSAGE}}"
        },
        {
          "name": "Rollback Status:",
          "value": "{{ROLLBACK_STATUS}}"
        }
      ],
      "markdown": true
    }
  ],
  "potentialAction": [
    {
      "@type": "OpenUri",
      "name": "View Logs",
      "targets": [
        {
          "os": "default",
          "uri": "{{LOG_URL}}"
        }
      ]
    },
    {
      "@type": "OpenUri", 
      "name": "Incident Response",
      "targets": [
        {
          "os": "default",
          "uri": "{{INCIDENT_URL}}"
        }
      ]
    }
  ]
}
```

### Rollback Triggered
```json
{
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions",
  "themeColor": "FFAA00",
  "summary": "MOBIUS Rollback Triggered",
  "sections": [
    {
      "activityTitle": "⚠️ MOBIUS Rollback Triggered",
      "activitySubtitle": "Automatic rollback in progress",
      "activityImage": "https://via.placeholder.com/32x32/FFAA00/ffffff?text=⚠",
      "facts": [
        {
          "name": "Environment:",
          "value": "{{ENVIRONMENT}}"
        },
        {
          "name": "Trigger Reason:",
          "value": "{{REASON}}"
        },
        {
          "name": "Backup File:",
          "value": "{{BACKUP_FILE}}"
        },
        {
          "name": "Rollback Status:",
          "value": "In Progress"
        }
      ],
      "markdown": true
    }
  ]
}
```

### Monitoring Alert
```json
{
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions",
  "themeColor": "FFAA00",
  "summary": "MOBIUS Monitoring Alert",
  "sections": [
    {
      "activityTitle": "🚨 MOBIUS Monitoring Alert",
      "activitySubtitle": "Performance threshold exceeded",
      "activityImage": "https://via.placeholder.com/32x32/FFAA00/ffffff?text=🚨",
      "facts": [
        {
          "name": "Environment:",
          "value": "{{ENVIRONMENT}}"
        },
        {
          "name": "Metric:",
          "value": "{{METRIC}}"
        },
        {
          "name": "Current Value:",
          "value": "{{CURRENT_VALUE}}"
        },
        {
          "name": "Threshold:",
          "value": "{{THRESHOLD}}"
        }
      ],
      "markdown": true
    }
  ]
}
```

## Template Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{ENVIRONMENT}}` | Target environment | production, staging |
| `{{VERSION}}` | Version being deployed | v1.2.3, commit-abc123 |
| `{{OPERATOR}}` | Deploy operator username | @ops, @john.doe |
| `{{TIMESTAMP}}` | Human-readable timestamp | 2024-01-15 14:30:00 UTC |
| `{{UNIX_TIMESTAMP}}` | Unix timestamp | 1705329000 |
| `{{DURATION}}` | Deployment duration | 15m 30s |
| `{{ERROR_MESSAGE}}` | Error description | Database connection timeout |
| `{{REASON}}` | Rollback trigger reason | 3 consecutive health check failures |
| `{{BACKUP_FILE}}` | Backup file path | backups/dhash_prod_20240115.zip |
| `{{ROLLBACK_STATUS}}` | Rollback state | In Progress, Completed, Failed |
| `{{SMOKE_TEST_STATUS}}` | Test results | Passed, Failed, Skipped |
| `{{HEALTH_CHECK_URL}}` | Health endpoint URL | https://api.mobius.com/health |
| `{{LOG_URL}}` | Log viewer URL | Link to logs |
| `{{INCIDENT_URL}}` | Incident tracking URL | Link to incident |
| `{{METRIC}}` | Alert metric name | Response Time, Error Rate |
| `{{CURRENT_VALUE}}` | Current metric value | 5.2s, 8.5% |
| `{{THRESHOLD}}` | Alert threshold | 5.0s, 5% |

## Usage with Notification CLI

```bash
# Use templates with the notification CLI
./scripts/deploy/notify.js template deploy-start production v1.2.3
./scripts/deploy/notify.js template deploy-success production v1.2.3 "15m 30s"
./scripts/deploy/notify.js template deploy-failed production v1.2.3 "Connection timeout"
./scripts/deploy/notify.js template rollback-triggered production "Health check failures"
./scripts/deploy/notify.js template monitoring-alert production "Response Time" "5000ms" "6200ms"
```