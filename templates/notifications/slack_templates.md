# Slack Notification Templates

## Deployment Started
```json
{
  "channel": "#alerts",
  "username": "dhash-deploy",
  "icon_emoji": ":rocket:",
  "attachments": [
    {
      "color": "#36a64f",
      "title": "🚀 dhash Deployment Started",
      "fields": [
        {
          "title": "Environment",
          "value": "{{environment}}",
          "short": true
        },
        {
          "title": "Operator",
          "value": "{{operator}}",
          "short": true
        },
        {
          "title": "Deployment ID",
          "value": "{{deployment_id}}",
          "short": false
        }
      ],
      "ts": "{{timestamp}}"
    }
  ]
}
```

## Quality Gate Alert
```json
{
  "channel": "#alerts",
  "username": "dhash-monitor",
  "icon_emoji": ":warning:",
  "attachments": [
    {
      "color": "#ff9900",
      "title": "⚠️ dhash Quality Gate Violation",
      "fields": [
        {
          "title": "Environment",
          "value": "{{environment}}",
          "short": true
        },
        {
          "title": "Gate",
          "value": "{{gate_name}}",
          "short": true
        },
        {
          "title": "Threshold",
          "value": "{{threshold}}",
          "short": true
        },
        {
          "title": "Actual Value",
          "value": "{{actual_value}}",
          "short": true
        },
        {
          "title": "Details",
          "value": "{{message}}",
          "short": false
        }
      ],
      "ts": "{{timestamp}}"
    }
  ]
}
```

## Auto-rollback Triggered
```json
{
  "channel": "#alerts",
  "username": "dhash-monitor",
  "icon_emoji": ":rotating_light:",
  "attachments": [
    {
      "color": "#800080",
      "title": "🚨 dhash Auto-rollback Triggered",
      "fields": [
        {
          "title": "Environment",
          "value": "{{environment}}",
          "short": true
        },
        {
          "title": "Reason",
          "value": "{{reason}}",
          "short": false
        },
        {
          "title": "Backup Used",
          "value": "{{backup_file}}",
          "short": true
        },
        {
          "title": "Deployment ID",
          "value": "{{deployment_id}}",
          "short": true
        }
      ],
      "actions": [
        {
          "type": "button",
          "text": "View Logs",
          "url": "{{logs_url}}"
        },
        {
          "type": "button",
          "text": "Incident Response",
          "url": "{{incident_url}}"
        }
      ],
      "ts": "{{timestamp}}"
    }
  ]
}
```

## Deployment Success
```json
{
  "channel": "#alerts",
  "username": "dhash-deploy",
  "icon_emoji": ":white_check_mark:",
  "attachments": [
    {
      "color": "#36a64f",
      "title": "✅ dhash Deployment Successful",
      "fields": [
        {
          "title": "Environment",
          "value": "{{environment}}",
          "short": true
        },
        {
          "title": "Duration",
          "value": "{{duration}}",
          "short": true
        },
        {
          "title": "Monitoring Complete",
          "value": "All quality gates passed",
          "short": false
        }
      ],
      "ts": "{{timestamp}}"
    }
  ]
}
```