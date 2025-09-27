# Discord Notification Templates

## Deployment Started
```json
{
  "username": "dhash-deploy",
  "avatar_url": "https://via.placeholder.com/64x64/00FF00/FFFFFF?text=D",
  "embeds": [
    {
      "title": "🚀 dhash Deployment Started",
      "color": 3066993,
      "timestamp": "{{timestamp}}",
      "fields": [
        {
          "name": "Environment",
          "value": "{{environment}}",
          "inline": true
        },
        {
          "name": "Operator",
          "value": "{{operator}}",
          "inline": true
        },
        {
          "name": "Deployment ID",
          "value": "{{deployment_id}}",
          "inline": false
        }
      ],
      "footer": {
        "text": "dhash Deployment System"
      }
    }
  ]
}
```

## Quality Gate Alert
```json
{
  "username": "dhash-monitor",
  "avatar_url": "https://via.placeholder.com/64x64/FFA500/FFFFFF?text=!",
  "embeds": [
    {
      "title": "⚠️ dhash Quality Gate Violation",
      "description": "{{message}}",
      "color": 16776960,
      "timestamp": "{{timestamp}}",
      "fields": [
        {
          "name": "Environment",
          "value": "{{environment}}",
          "inline": true
        },
        {
          "name": "Gate",
          "value": "{{gate_name}}",
          "inline": true
        },
        {
          "name": "Threshold",
          "value": "{{threshold}}",
          "inline": true
        },
        {
          "name": "Actual Value",
          "value": "{{actual_value}}",
          "inline": true
        }
      ],
      "footer": {
        "text": "dhash Monitoring System"
      }
    }
  ]
}
```

## Auto-rollback Triggered
```json
{
  "username": "dhash-monitor",
  "avatar_url": "https://via.placeholder.com/64x64/800080/FFFFFF?text=R",
  "content": "@everyone **CRITICAL**: dhash auto-rollback triggered in {{environment}}",
  "embeds": [
    {
      "title": "🚨 dhash Auto-rollback Triggered",
      "description": "Automatic rollback initiated due to quality gate failure",
      "color": 8388736,
      "timestamp": "{{timestamp}}",
      "fields": [
        {
          "name": "Environment",
          "value": "{{environment}}",
          "inline": true
        },
        {
          "name": "Reason",
          "value": "{{reason}}",
          "inline": false
        },
        {
          "name": "Backup File",
          "value": "{{backup_file}}",
          "inline": true
        },
        {
          "name": "Deployment ID",
          "value": "{{deployment_id}}",
          "inline": true
        }
      ],
      "footer": {
        "text": "dhash Auto-rollback System"
      }
    }
  ]
}
```

## Deployment Success
```json
{
  "username": "dhash-deploy",
  "avatar_url": "https://via.placeholder.com/64x64/00FF00/FFFFFF?text=✓",
  "embeds": [
    {
      "title": "✅ dhash Deployment Successful",
      "description": "All quality gates passed during monitoring period",
      "color": 3066993,
      "timestamp": "{{timestamp}}",
      "fields": [
        {
          "name": "Environment",
          "value": "{{environment}}",
          "inline": true
        },
        {
          "name": "Duration",
          "value": "{{duration}}",
          "inline": true
        },
        {
          "name": "Quality Gates",
          "value": "All passed ✅",
          "inline": false
        }
      ],
      "footer": {
        "text": "dhash Deployment System"
      }
    }
  ]
}
```

## Monitoring Started
```json
{
  "username": "dhash-monitor",
  "avatar_url": "https://via.placeholder.com/64x64/0099FF/FFFFFF?text=M",
  "embeds": [
    {
      "title": "👁️ dhash Monitoring Started",
      "description": "60-minute quality gate monitoring window initiated",
      "color": 255,
      "timestamp": "{{timestamp}}",
      "fields": [
        {
          "name": "Environment",
          "value": "{{environment}}",
          "inline": true
        },
        {
          "name": "Window",
          "value": "{{monitoring_minutes}} minutes",
          "inline": true
        },
        {
          "name": "Quality Gates",
          "value": "{{active_gates_count}} active",
          "inline": true
        }
      ],
      "footer": {
        "text": "dhash Monitoring System"
      }
    }
  ]
}
```