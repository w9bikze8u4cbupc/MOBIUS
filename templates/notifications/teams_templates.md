# Microsoft Teams Notification Templates

## Deployment Started
```json
{
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  "summary": "dhash Deployment Started",
  "themeColor": "00FF00",
  "title": "🚀 dhash Deployment Started",
  "sections": [
    {
      "activityTitle": "Environment",
      "activitySubtitle": "{{environment}}",
      "activityImage": "https://via.placeholder.com/32x32/00FF00/FFFFFF?text=D"
    },
    {
      "facts": [
        {
          "name": "Operator:",
          "value": "{{operator}}"
        },
        {
          "name": "Deployment ID:",
          "value": "{{deployment_id}}"
        },
        {
          "name": "Timestamp:",
          "value": "{{timestamp}}"
        }
      ]
    }
  ]
}
```

## Quality Gate Alert  
```json
{
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  "summary": "dhash Quality Gate Violation",
  "themeColor": "FFA500",
  "title": "⚠️ dhash Quality Gate Violation",
  "sections": [
    {
      "activityTitle": "{{gate_name}}",
      "activitySubtitle": "{{environment}}",
      "activityImage": "https://via.placeholder.com/32x32/FFA500/FFFFFF?text=!"
    },
    {
      "facts": [
        {
          "name": "Threshold:",
          "value": "{{threshold}}"
        },
        {
          "name": "Actual:",
          "value": "{{actual_value}}"
        },
        {
          "name": "Details:",
          "value": "{{message}}"
        }
      ]
    }
  ],
  "potentialAction": [
    {
      "@type": "OpenUri",
      "name": "View Monitoring",
      "targets": [
        {
          "os": "default",
          "uri": "{{monitoring_url}}"
        }
      ]
    }
  ]
}
```

## Auto-rollback Triggered
```json
{
  "@type": "MessageCard", 
  "@context": "https://schema.org/extensions",
  "summary": "dhash Auto-rollback Triggered",
  "themeColor": "800080",
  "title": "🚨 dhash Auto-rollback Triggered",
  "sections": [
    {
      "activityTitle": "Critical Alert",
      "activitySubtitle": "{{environment}} - Automatic rollback in progress",
      "activityImage": "https://via.placeholder.com/32x32/800080/FFFFFF?text=R"
    },
    {
      "facts": [
        {
          "name": "Reason:",
          "value": "{{reason}}"
        },
        {
          "name": "Backup File:",
          "value": "{{backup_file}}"
        },
        {
          "name": "Deployment ID:",
          "value": "{{deployment_id}}"
        }
      ]
    }
  ],
  "potentialAction": [
    {
      "@type": "OpenUri",
      "name": "View Logs",
      "targets": [
        {
          "os": "default", 
          "uri": "{{logs_url}}"
        }
      ]
    },
    {
      "@type": "OpenUri",
      "name": "Create Incident",
      "targets": [
        {
          "os": "default",
          "uri": "{{incident_url}}"
        }
      ]
    }
  ]
}
```

## Deployment Success
```json
{
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions", 
  "summary": "dhash Deployment Successful",
  "themeColor": "00FF00",
  "title": "✅ dhash Deployment Successful",
  "sections": [
    {
      "activityTitle": "Deployment Complete",
      "activitySubtitle": "{{environment}} - All quality gates passed",
      "activityImage": "https://via.placeholder.com/32x32/00FF00/FFFFFF?text=✓"
    },
    {
      "facts": [
        {
          "name": "Duration:",
          "value": "{{duration}}"
        },
        {
          "name": "Quality Gates:",
          "value": "All passed"
        },
        {
          "name": "Completed:",
          "value": "{{timestamp}}"
        }
      ]
    }
  ]
}
```