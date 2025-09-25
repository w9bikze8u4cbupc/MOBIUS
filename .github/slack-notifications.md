# 📱 Slack Notification Templates

## T-30 Minutes: Pre-Deploy Preparation

### Block Kit JSON
```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🚀 MOBIUS Deployment Starting in 30 minutes",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Release:* {{RELEASE_TAG}}\n*Target:* Production Environment\n*Scheduled:* {{DEPLOY_TIME}}"
      },
      "accessory": {
        "type": "image",
        "image_url": "https://i.imgur.com/mobius-logo.png",
        "alt_text": "MOBIUS Logo"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Deploy Lead:*\n{{DEPLOY_LEAD}}"
        },
        {
          "type": "mrkdwn",
          "text": "*Duration:*\n~{{ESTIMATED_DURATION}} minutes"
        },
        {
          "type": "mrkdwn",
          "text": "*Components:*\n• API Server\n• Video Pipeline\n• Web Interface"
        },
        {
          "type": "mrkdwn",
          "text": "*Impact:*\n• {{EXPECTED_DOWNTIME}} downtime\n• Video generation paused"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Pre-deployment checks:*\n✅ Golden tests passed\n✅ Audio compliance verified\n✅ Database migration ready\n✅ Rollback plan confirmed"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View Release Notes",
            "emoji": true
          },
          "url": "{{RELEASE_NOTES_URL}}",
          "style": "primary"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Deployment Dashboard",
            "emoji": true
          },
          "url": "{{DASHBOARD_URL}}"
        }
      ]
    }
  ]
}
```

### Formatted Text Version
```
🚀 *MOBIUS Deployment Starting in 30 minutes*

*Release:* {{RELEASE_TAG}}
*Target:* Production Environment
*Scheduled:* {{DEPLOY_TIME}}
*Deploy Lead:* {{DEPLOY_LEAD}}
*Duration:* ~{{ESTIMATED_DURATION}} minutes

*Components Being Updated:*
• API Server (Node.js backend)
• Video Pipeline (FFmpeg processing)
• Web Interface (React frontend)

*Expected Impact:*
• {{EXPECTED_DOWNTIME}} downtime expected
• Video generation temporarily paused
• Existing videos remain accessible

*Pre-deployment Status:* ✅ All checks passed
• Golden tests validated
• Audio compliance verified (LUFS: {{LUFS_VALUE}} dB)
• Database migration ready
• Rollback plan confirmed

🔗 *Links:*
Release Notes: {{RELEASE_NOTES_URL}}
Dashboard: {{DASHBOARD_URL}}
Runbook: {{RUNBOOK_URL}}
```

---

## T-5 Minutes: Final Preparation

### Block Kit JSON
```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "⚡ MOBIUS Deployment Starting in 5 minutes",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Final preparations underway*\n\n🔒 Maintenance mode: *{{MAINTENANCE_STATUS}}*\n📊 Current system status: *{{SYSTEM_STATUS}}*\n👥 Active users: *{{ACTIVE_USERS}}*\n🎬 Videos in queue: *{{QUEUE_SIZE}}*"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Deploy lead: {{DEPLOY_LEAD}} | Expected completion: {{COMPLETION_TIME}}"
        }
      ]
    }
  ]
}
```

### Formatted Text Version
```
⚡ *MOBIUS Deployment Starting in 5 minutes*

*Final preparations underway*

🔒 Maintenance mode: {{MAINTENANCE_STATUS}}
📊 Current system status: {{SYSTEM_STATUS}}
👥 Active users: {{ACTIVE_USERS}}
🎬 Videos in queue: {{QUEUE_SIZE}}

Deploy lead: {{DEPLOY_LEAD}} | Expected completion: {{COMPLETION_TIME}}
```

---

## T-0: Deployment In Progress

### Block Kit JSON
```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🔄 MOBIUS Deployment In Progress",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Deployment {{RELEASE_TAG}} is now live*\n\n⏱️ Started: {{START_TIME}}\n📊 Progress: {{PROGRESS_PERCENTAGE}}%\n🎯 Current phase: {{CURRENT_PHASE}}"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Database:*\n{{DB_STATUS}}"
        },
        {
          "type": "mrkdwn",
          "text": "*API:*\n{{API_STATUS}}"
        },
        {
          "type": "mrkdwn",
          "text": "*Pipeline:*\n{{PIPELINE_STATUS}}"
        },
        {
          "type": "mrkdwn",
          "text": "*Frontend:*\n{{FRONTEND_STATUS}}"
        }
      ]
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "🚫 Service temporarily unavailable | 📞 On-call: {{ONCALL_ENGINEER}}"
        }
      ]
    }
  ]
}
```

### Formatted Text Version
```
🔄 *MOBIUS Deployment In Progress*

*Deployment {{RELEASE_TAG}} is now live*

⏱️ Started: {{START_TIME}}
📊 Progress: {{PROGRESS_PERCENTAGE}}%
🎯 Current phase: {{CURRENT_PHASE}}

*Component Status:*
• Database: {{DB_STATUS}}
• API: {{API_STATUS}}
• Video Pipeline: {{PIPELINE_STATUS}}
• Frontend: {{FRONTEND_STATUS}}

🚫 Service temporarily unavailable
📞 On-call engineer: {{ONCALL_ENGINEER}}
```

---

## T+15 Minutes: Deployment Complete

### Block Kit JSON
```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "✅ MOBIUS Deployment Complete",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Deployment {{RELEASE_TAG}} successfully completed!*\n\n🎉 All services are back online and healthy\n⏱️ Total duration: {{TOTAL_DURATION}}\n📊 Health check: {{HEALTH_STATUS}}"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*API Response:*\n{{API_RESPONSE_TIME}}ms avg"
        },
        {
          "type": "mrkdwn",
          "text": "*Video Pipeline:*\n{{PIPELINE_HEALTH}} ({{PROCESSING_TIME}}s avg)"
        },
        {
          "type": "mrkdwn",
          "text": "*Database:*\n{{DB_CONNECTIONS}} connections"
        },
        {
          "type": "mrkdwn",
          "text": "*Audio Quality:*\nLUFS: {{LUFS_VALUE}} dB ✅"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*What's New:*\n{{RELEASE_HIGHLIGHTS}}"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View Application",
            "emoji": true
          },
          "url": "{{APP_URL}}",
          "style": "primary"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Release Notes",
            "emoji": true
          },
          "url": "{{RELEASE_NOTES_URL}}"
        }
      ]
    }
  ]
}
```

### Formatted Text Version
```
✅ *MOBIUS Deployment Complete*

*Deployment {{RELEASE_TAG}} successfully completed!*

🎉 All services are back online and healthy
⏱️ Total duration: {{TOTAL_DURATION}}
📊 Health check: {{HEALTH_STATUS}}

*Performance Metrics:*
• API Response: {{API_RESPONSE_TIME}}ms avg
• Video Pipeline: {{PIPELINE_HEALTH}} ({{PROCESSING_TIME}}s avg)
• Database: {{DB_CONNECTIONS}} active connections
• Audio Quality: LUFS {{LUFS_VALUE}} dB ✅

*What's New:*
{{RELEASE_HIGHLIGHTS}}

🔗 *Links:*
Application: {{APP_URL}}
Release Notes: {{RELEASE_NOTES_URL}}
Dashboard: {{DASHBOARD_URL}}
```

---

## T+60 Minutes: Post-Deploy Status

### Block Kit JSON
```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "📊 MOBIUS Post-Deploy Status (1 hour)",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*System stability report for {{RELEASE_TAG}}*\n\n✅ Deployment remains stable and healthy\n📈 Performance metrics within normal range\n🎬 Video generation pipeline fully operational"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Usage Stats:*\n• {{VIDEOS_GENERATED}} videos generated\n• {{API_REQUESTS}} API requests\n• {{ACTIVE_USERS}} active users"
        },
        {
          "type": "mrkdwn",
          "text": "*Performance:*\n• {{ERROR_RATE}}% error rate\n• {{RESPONSE_TIME}}ms avg response\n• {{UPTIME}}% uptime"
        },
        {
          "type": "mrkdwn",
          "text": "*Resources:*\n• CPU: {{CPU_USAGE}}%\n• Memory: {{MEMORY_USAGE}}%\n• Disk: {{DISK_USAGE}}%"
        },
        {
          "type": "mrkdwn",
          "text": "*Queue Status:*\n• {{QUEUE_SIZE}} videos pending\n• {{AVG_PROCESSING_TIME}}s avg processing\n• {{QUEUE_WAIT_TIME}}s avg wait"
        }
      ]
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Next status update in 3 hours | On-call: {{ONCALL_ENGINEER}}"
        }
      ]
    }
  ]
}
```

### Formatted Text Version
```
📊 *MOBIUS Post-Deploy Status (1 hour)*

*System stability report for {{RELEASE_TAG}}*

✅ Deployment remains stable and healthy
📈 Performance metrics within normal range
🎬 Video generation pipeline fully operational

*Usage Stats (last hour):*
• {{VIDEOS_GENERATED}} videos generated
• {{API_REQUESTS}} API requests processed
• {{ACTIVE_USERS}} active users

*Performance Metrics:*
• {{ERROR_RATE}}% error rate (target: <1%)
• {{RESPONSE_TIME}}ms average response time
• {{UPTIME}}% uptime

*System Resources:*
• CPU utilization: {{CPU_USAGE}}%
• Memory usage: {{MEMORY_USAGE}}%
• Disk usage: {{DISK_USAGE}}%

*Video Processing Queue:*
• {{QUEUE_SIZE}} videos pending processing
• {{AVG_PROCESSING_TIME}}s average processing time
• {{QUEUE_WAIT_TIME}}s average queue wait time

Next status update in 3 hours | On-call: {{ONCALL_ENGINEER}}
```