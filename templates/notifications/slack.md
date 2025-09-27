# Slack Notification Templates

## Deployment Success
```json
{
  "text": "🚀 Deployment Notification",
  "attachments": [
    {
      "color": "#00ff00",
      "title": "dhash Deployment Successful - {{environment}}",
      "text": "{{message}}",
      "fields": [
        { "title": "Environment", "value": "{{environment}}", "short": true },
        { "title": "Priority", "value": "{{priority}}", "short": true },
        { "title": "Timestamp", "value": "{{timestamp}}", "short": false }
      ],
      "footer": "MOBIUS dhash Deployment System"
    }
  ]
}
```

## Auto-Rollback Alert
```json
{
  "text": "🚨 Auto-Rollback Triggered",
  "attachments": [
    {
      "color": "#ff0000",
      "title": "CRITICAL: dhash Auto-Rollback - {{environment}}",
      "text": "{{message}}",
      "fields": [
        { "title": "Quality Gate", "value": "{{gate}}", "short": true },
        { "title": "Threshold", "value": "{{threshold}}", "short": true },
        { "title": "Current Value", "value": "{{current}}", "short": true },
        { "title": "Environment", "value": "{{environment}}", "short": true }
      ],
      "footer": "MOBIUS dhash Deployment System"
    }
  ]
}
```

## Monitoring Complete
```json
{
  "text": "✅ Monitoring Complete",
  "attachments": [
    {
      "color": "#00ff00",
      "title": "dhash Monitoring Completed - {{environment}}",
      "text": "60-minute monitoring window completed successfully",
      "fields": [
        { "title": "Total Checks", "value": "{{total_checks}}", "short": true },
        { "title": "Violations", "value": "{{violations}}", "short": true },
        { "title": "Duration", "value": "{{duration}} minutes", "short": true }
      ],
      "footer": "MOBIUS dhash Deployment System"
    }
  ]
}
```