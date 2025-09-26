# MOBIUS Notification Templates

## Overview

This document provides templates for deployment notifications across different platforms.

## Slack Templates

### Deployment Started
```json
{
  "text": "🚀 MOBIUS Deployment Started",
  "attachments": [{
    "color": "#36a64f",
    "fields": [{
      "title": "Environment",
      "value": "{{DEPLOY_ENV}}",
      "short": true
    }, {
      "title": "Version",
      "value": "{{GIT_COMMIT}}",
      "short": true
    }, {
      "title": "Triggered by",
      "value": "{{GITHUB_ACTOR}}",
      "short": true
    }]
  }]
}
```

### Deployment Success
```json
{
  "text": "✅ MOBIUS Deployment Successful",
  "attachments": [{
    "color": "#36a64f",
    "fields": [{
      "title": "Environment",
      "value": "{{DEPLOY_ENV}}",
      "short": true
    }, {
      "title": "Duration",
      "value": "{{DEPLOYMENT_DURATION}}",
      "short": true
    }, {
      "title": "Health Status",
      "value": "All checks passed",
      "short": false
    }]
  }]
}
```

### Rollback Alert
```json
{
  "text": "🚨 MOBIUS Rollback Triggered",
  "attachments": [{
    "color": "#ff0000",
    "fields": [{
      "title": "Reason",
      "value": "{{ROLLBACK_REASON}}",
      "short": false
    }, {
      "title": "Environment", 
      "value": "{{DEPLOY_ENV}}",
      "short": true
    }, {
      "title": "Action Required",
      "value": "Monitor rollback progress",
      "short": true
    }]
  }]
}
```

## Microsoft Teams Templates

### Deployment Started
```json
{
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  "summary": "MOBIUS Deployment Started",
  "themeColor": "00FF00",
  "sections": [{
    "activityTitle": "🚀 MOBIUS Deployment Started",
    "activitySubtitle": "{{DEPLOY_ENV}} environment",
    "facts": [{
      "name": "Environment",
      "value": "{{DEPLOY_ENV}}"
    }, {
      "name": "Version",
      "value": "{{GIT_COMMIT}}"
    }, {
      "name": "Triggered by",
      "value": "{{GITHUB_ACTOR}}"
    }]
  }]
}
```

### Health Check Failure
```json
{
  "@type": "MessageCard", 
  "@context": "https://schema.org/extensions",
  "summary": "MOBIUS Health Check Failed",
  "themeColor": "FFAA00",
  "sections": [{
    "activityTitle": "⚠️ MOBIUS Health Check Failed",
    "activitySubtitle": "Consecutive failures: {{FAILURE_COUNT}}/{{FAILURE_THRESHOLD}}",
    "facts": [{
      "name": "Environment",
      "value": "{{DEPLOY_ENV}}"
    }, {
      "name": "Failure Count",
      "value": "{{FAILURE_COUNT}}/{{FAILURE_THRESHOLD}}"
    }, {
      "name": "Next Check",
      "value": "{{CHECK_INTERVAL}} seconds"
    }]
  }]
}
```

## Email Templates

### Deployment Summary (HTML)
```html
<!DOCTYPE html>
<html>
<head>
    <title>MOBIUS Deployment Summary</title>
    <style>
        body { font-family: Arial, sans-serif; }
        .header { background-color: #f8f9fa; padding: 20px; }
        .content { padding: 20px; }
        .success { color: #28a745; }
        .warning { color: #ffc107; }
        .error { color: #dc3545; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
    </style>
</head>
<body>
    <div class="header">
        <h1>MOBIUS Deployment Summary</h1>
    </div>
    <div class="content">
        <h2>Deployment Details</h2>
        <table>
            <tr><td><strong>Environment:</strong></td><td>{{DEPLOY_ENV}}</td></tr>
            <tr><td><strong>Version:</strong></td><td>{{GIT_COMMIT}}</td></tr>
            <tr><td><strong>Status:</strong></td><td class="{{STATUS_CLASS}}">{{STATUS}}</td></tr>
            <tr><td><strong>Duration:</strong></td><td>{{DEPLOYMENT_DURATION}}</td></tr>
        </table>
        
        <h2>Verification Results</h2>
        <ul>
            <li class="{{SMOKE_TESTS_CLASS}}">Smoke Tests: {{SMOKE_TESTS_STATUS}}</li>
            <li class="{{HEALTH_CHECKS_CLASS}}">Health Checks: {{HEALTH_CHECKS_STATUS}}</li>
            <li class="{{MONITORING_CLASS}}">Monitoring: {{MONITORING_STATUS}}</li>
        </ul>
        
        <p><em>This is an automated message from the MOBIUS Deployment Framework.</em></p>
    </div>
</body>
</html>
```

## Webhook URLs Configuration

### Environment Variables
```bash
# Slack
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"

# Microsoft Teams  
export TEAMS_WEBHOOK_URL="https://your-tenant.webhook.office.com/YOUR/TEAMS/WEBHOOK"

# Email (generic webhook)
export EMAIL_WEBHOOK_URL="https://api.your-email-service.com/send"
```

### Usage Examples

**Send deployment start notification:**
```bash
node scripts/deploy/notify.js \
  --message "Deployment started for version abc123" \
  --severity "info"
```

**Send warning notification:**
```bash
node scripts/deploy/notify.js \
  --message "Health check failure detected" \
  --severity "warning"
```

**Test notifications (dry-run):**
```bash
node scripts/deploy/notify.js \
  --message "Test notification" \
  --severity "info" \
  --dry-run
```

## Customization

### Adding Custom Fields

Edit `scripts/deploy/notify.js` to add custom fields:

```javascript
// Add to createSlackPayload function
fields.push({
  title: 'Custom Field',
  value: process.env.CUSTOM_VALUE || 'default',
  short: true
});
```

### Custom Webhook Platforms

Add new platforms by extending the notification script:

```javascript
// Example: Discord webhook
function createDiscordPayload(message, severity) {
  return {
    content: `**${severity.toUpperCase()}:** ${message}`,
    embeds: [{
      color: severity === 'error' ? 15158332 : 3066993,
      timestamp: new Date().toISOString()
    }]
  };
}
```

## Testing Notifications

### Test Webhook Connectivity
```bash
# Test Slack webhook
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Test from MOBIUS"}' \
  $SLACK_WEBHOOK_URL

# Test Teams webhook  
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Test from MOBIUS"}' \
  $TEAMS_WEBHOOK_URL
```

### Validate Template Variables

Ensure all template variables are properly substituted:
- `{{DEPLOY_ENV}}` - Deployment environment
- `{{GIT_COMMIT}}` - Git commit hash
- `{{GITHUB_ACTOR}}` - User who triggered deployment
- `{{ROLLBACK_REASON}}` - Reason for rollback
- `{{FAILURE_COUNT}}` - Current failure count
- `{{FAILURE_THRESHOLD}}` - Maximum failures before rollback

---

*Generated by MOBIUS Deployment Framework*
*Last updated: $(date)*
