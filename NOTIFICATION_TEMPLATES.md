# MOBIUS Notification Templates

## Slack Notifications

### Deploy Start
```
🚀 **MOBIUS Deploy Started**
Environment: `{{ environment }}`
Release: `{{ release_tag }}`
Deploy Lead: {{ deploy_lead }}
Status: In Progress
Dashboard: [Monitor →]({{ dashboard_url }})
```

### Deploy Success
```
✅ **MOBIUS Deploy Completed**
Environment: `{{ environment }}`  
Release: `{{ release_tag }}`
Duration: {{ duration }}
Deploy Lead: {{ deploy_lead }}
Next: Monitoring for {{ monitoring_duration }}min
Dashboard: [Monitor →]({{ dashboard_url }})
Logs: [View →]({{ logs_url }})
```

### Deploy Failed
```
❌ **MOBIUS Deploy Failed**
Environment: `{{ environment }}`
Release: `{{ release_tag }}`
Deploy Lead: {{ deploy_lead }}
Error: {{ error_message }}
Action: {{ recommended_action }}
Logs: [View →]({{ logs_url }})
@channel
```

### Monitoring Alert
```
⚠️ **MOBIUS Alert - {{ alert_type }}**
Environment: `{{ environment }}`
Metric: {{ metric_name }}
Current: {{ current_value }}
Threshold: {{ threshold_value }}
Duration: {{ alert_duration }}
Dashboard: [View →]({{ dashboard_url }})
Runbook: [View →]({{ runbook_url }})
```

### Rollback Started
```
🔄 **MOBIUS Rollback Initiated**
Environment: `{{ environment }}`
Trigger: {{ rollback_reason }}
Backup: `{{ backup_file }}`
Operator: {{ operator }}
Status: In Progress
ETA: {{ estimated_duration }}min
@channel
```

### Rollback Completed
```
✅ **MOBIUS Rollback Completed**
Environment: `{{ environment }}`
Backup: `{{ backup_file }}`
Duration: {{ actual_duration }}
Health Status: {{ health_status }}
Next: Investigating root cause
Post-mortem: {{ postmortem_link }}
```

## Email Templates

### Deploy Notification (HTML)
```html
<!DOCTYPE html>
<html>
<head>
    <title>MOBIUS Deployment {{ status }}</title>
    <style>
        .success { color: #28a745; }
        .failure { color: #dc3545; }
        .warning { color: #ffc107; }
        .info { color: #17a2b8; }
        .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .details { margin: 20px 0; }
        .footer { margin-top: 30px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2 class="{{ status_class }}">MOBIUS Deployment {{ status }}</h2>
            <p><strong>Environment:</strong> {{ environment }}</p>
            <p><strong>Release:</strong> {{ release_tag }}</p>
            <p><strong>Time:</strong> {{ timestamp }}</p>
        </div>
        
        <div class="details">
            <h3>Deployment Details</h3>
            <ul>
                <li><strong>Deploy Lead:</strong> {{ deploy_lead }}</li>
                <li><strong>Duration:</strong> {{ duration }}</li>
                <li><strong>Status:</strong> {{ detailed_status }}</li>
                {% if error_message %}
                <li><strong>Error:</strong> {{ error_message }}</li>
                {% endif %}
            </ul>
        </div>
        
        <div class="details">
            <h3>Links</h3>
            <ul>
                <li><a href="{{ dashboard_url }}">Monitoring Dashboard</a></li>
                <li><a href="{{ logs_url }}">Deployment Logs</a></li>
                {% if smoke_tests_url %}
                <li><a href="{{ smoke_tests_url }}">Smoke Test Results</a></li>
                {% endif %}
            </ul>
        </div>
        
        <div class="details">
            <h3>Next Steps</h3>
            <ul>
                {% for step in next_steps %}
                <li>{{ step }}</li>
                {% endfor %}
            </ul>
        </div>
        
        <div class="footer">
            <p>This is an automated notification from the MOBIUS deployment system.</p>
        </div>
    </div>
</body>
</html>
```

### Alert Notification (Text)
```
MOBIUS ALERT: {{ alert_type }}

Environment: {{ environment }}
Timestamp: {{ timestamp }}
Severity: {{ severity }}

Alert Details:
- Metric: {{ metric_name }}
- Current Value: {{ current_value }}
- Threshold: {{ threshold_value }}  
- Duration: {{ alert_duration }}

System Information:
- Release: {{ current_release }}
- Deployment Time: {{ deployment_time }}
- Health Status: {{ health_status }}

Recommended Actions:
{{ recommended_actions }}

Dashboard: {{ dashboard_url }}
Runbook: {{ runbook_url }}
Logs: {{ logs_url }}

--
MOBIUS Automated Monitoring
```

## PagerDuty Integration

### Incident Payload
```json
{
  "routing_key": "{{ pagerduty_integration_key }}",
  "event_action": "trigger",
  "dedup_key": "mobius-{{ environment }}-{{ alert_type }}-{{ timestamp }}",
  "payload": {
    "summary": "MOBIUS {{ alert_type }} in {{ environment }}",
    "source": "mobius-monitoring",
    "severity": "{{ severity }}",
    "component": "dhash",
    "group": "infrastructure",
    "class": "deployment",
    "custom_details": {
      "environment": "{{ environment }}",
      "release": "{{ release_tag }}",
      "metric": "{{ metric_name }}",
      "current_value": "{{ current_value }}",
      "threshold": "{{ threshold_value }}",
      "duration": "{{ alert_duration }}",
      "dashboard_url": "{{ dashboard_url }}",
      "runbook_url": "{{ runbook_url }}"
    }
  },
  "links": [
    {
      "href": "{{ dashboard_url }}",
      "text": "Monitoring Dashboard"
    },
    {
      "href": "{{ logs_url }}",
      "text": "Application Logs"
    }
  ]
}
```

## Teams/Discord Webhook

### Deployment Status
```json
{
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  "summary": "MOBIUS Deployment {{ status }}",
  "themeColor": "{{ theme_color }}",
  "sections": [
    {
      "activityTitle": "MOBIUS Deployment {{ status }}",
      "activitySubtitle": "Environment: {{ environment }}",
      "activityImage": "https://example.com/mobius-icon.png",
      "facts": [
        {
          "name": "Release",
          "value": "{{ release_tag }}"
        },
        {
          "name": "Deploy Lead",
          "value": "{{ deploy_lead }}"
        },
        {
          "name": "Duration",
          "value": "{{ duration }}"
        },
        {
          "name": "Status",
          "value": "{{ detailed_status }}"
        }
      ],
      "markdown": true
    }
  ],
  "potentialAction": [
    {
      "@type": "OpenUri",
      "name": "View Dashboard",
      "targets": [
        {
          "os": "default",
          "uri": "{{ dashboard_url }}"
        }
      ]
    },
    {
      "@type": "OpenUri", 
      "name": "View Logs",
      "targets": [
        {
          "os": "default",
          "uri": "{{ logs_url }}"
        }
      ]
    }
  ]
}
```

## Notification Configuration

### Environment Variables
```bash
# Slack Configuration
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
SLACK_CHANNEL="#mobius-deploys"
SLACK_USERNAME="mobius-bot"

# Email Configuration  
SMTP_SERVER="smtp.example.com"
SMTP_PORT="587"
SMTP_USERNAME="deployments@example.com"
SMTP_PASSWORD="..."
EMAIL_FROM="MOBIUS Deployments <deployments@example.com>"
EMAIL_TO="ops-team@example.com,engineering@example.com"

# PagerDuty Configuration
PAGERDUTY_INTEGRATION_KEY="..."
PAGERDUTY_SEVERITY_MAPPING="critical:critical,high:error,medium:warning,low:info"

# Teams/Discord Configuration
TEAMS_WEBHOOK_URL="https://outlook.office.com/webhook/..."
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
```

### Usage Examples

#### Send Deploy Notification
```bash
# Success notification
./scripts/send_notification.sh --type deploy_success \
  --environment production \
  --release v1.0.0 \
  --duration "5min 32s" \
  --deploy-lead "@ops"

# Failure notification  
./scripts/send_notification.sh --type deploy_failed \
  --environment production \
  --release v1.0.0 \
  --error "Health check timeout" \
  --recommended-action "Check application logs and consider rollback"
```

#### Send Alert Notification
```bash
./scripts/send_notification.sh --type alert \
  --environment production \
  --alert-type "high_error_rate" \
  --metric "extraction_failures_rate" \
  --current-value "15%" \
  --threshold "10%" \
  --duration "5min"
```

#### Send Rollback Notification
```bash
./scripts/send_notification.sh --type rollback_completed \
  --environment production \
  --backup "dhash-production-20240101-120000.zip" \
  --duration "3min 45s" \
  --health-status "OK"
```