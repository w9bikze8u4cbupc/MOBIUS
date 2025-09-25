# 💼 Microsoft Teams Notification Templates

## T-30 Minutes: Pre-Deploy Preparation

### Adaptive Card JSON
```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "TextBlock",
      "size": "Large",
      "weight": "Bolder",
      "text": "🚀 MOBIUS Deployment Starting in 30 minutes",
      "color": "Good"
    },
    {
      "type": "FactSet",
      "facts": [
        {
          "title": "Release:",
          "value": "{{RELEASE_TAG}}"
        },
        {
          "title": "Target:",
          "value": "Production Environment"
        },
        {
          "title": "Scheduled:",
          "value": "{{DEPLOY_TIME}}"
        },
        {
          "title": "Deploy Lead:",
          "value": "{{DEPLOY_LEAD}}"
        },
        {
          "title": "Duration:",
          "value": "~{{ESTIMATED_DURATION}} minutes"
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "**Components Being Updated:**",
      "weight": "Bolder",
      "spacing": "Medium"
    },
    {
      "type": "TextBlock",
      "text": "• API Server (Node.js backend)\n• Video Pipeline (FFmpeg processing)\n• Web Interface (React frontend)",
      "spacing": "None"
    },
    {
      "type": "TextBlock",
      "text": "**Expected Impact:**",
      "weight": "Bolder",
      "spacing": "Medium"
    },
    {
      "type": "TextBlock",
      "text": "• {{EXPECTED_DOWNTIME}} downtime\n• Video generation temporarily paused\n• Existing videos remain accessible",
      "spacing": "None"
    },
    {
      "type": "Container",
      "style": "good",
      "items": [
        {
          "type": "TextBlock",
          "text": "**Pre-deployment Status:** ✅ All checks passed",
          "weight": "Bolder"
        },
        {
          "type": "TextBlock",
          "text": "• Golden tests validated\n• Audio compliance verified (LUFS: {{LUFS_VALUE}} dB)\n• Database migration ready\n• Rollback plan confirmed"
        }
      ]
    }
  ],
  "actions": [
    {
      "type": "Action.OpenUrl",
      "title": "View Release Notes",
      "url": "{{RELEASE_NOTES_URL}}"
    },
    {
      "type": "Action.OpenUrl",
      "title": "Deployment Dashboard",
      "url": "{{DASHBOARD_URL}}"
    }
  ]
}
```

### Formatted Text Version
```markdown
**🚀 MOBIUS Deployment Starting in 30 minutes**

**Release Details:**
- **Release:** {{RELEASE_TAG}}
- **Target:** Production Environment
- **Scheduled:** {{DEPLOY_TIME}}
- **Deploy Lead:** {{DEPLOY_LEAD}}
- **Duration:** ~{{ESTIMATED_DURATION}} minutes

**Components Being Updated:**
- API Server (Node.js backend)
- Video Pipeline (FFmpeg processing)  
- Web Interface (React frontend)

**Expected Impact:**
- {{EXPECTED_DOWNTIME}} downtime expected
- Video generation temporarily paused
- Existing videos remain accessible

**✅ Pre-deployment Status: All checks passed**
- Golden tests validated
- Audio compliance verified (LUFS: {{LUFS_VALUE}} dB)
- Database migration ready
- Rollback plan confirmed

**Useful Links:**
- [Release Notes]({{RELEASE_NOTES_URL}})
- [Deployment Dashboard]({{DASHBOARD_URL}})
- [Runbook]({{RUNBOOK_URL}})
```

---

## T-5 Minutes: Final Preparation

### Adaptive Card JSON
```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "TextBlock",
      "size": "Large",
      "weight": "Bolder",
      "text": "⚡ MOBIUS Deployment Starting in 5 minutes",
      "color": "Warning"
    },
    {
      "type": "TextBlock",
      "text": "**Final preparations underway**",
      "weight": "Bolder",
      "spacing": "Medium"
    },
    {
      "type": "FactSet",
      "facts": [
        {
          "title": "🔒 Maintenance mode:",
          "value": "{{MAINTENANCE_STATUS}}"
        },
        {
          "title": "📊 Current system status:",
          "value": "{{SYSTEM_STATUS}}"
        },
        {
          "title": "👥 Active users:",
          "value": "{{ACTIVE_USERS}}"
        },
        {
          "title": "🎬 Videos in queue:",
          "value": "{{QUEUE_SIZE}}"
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "Deploy lead: {{DEPLOY_LEAD}} | Expected completion: {{COMPLETION_TIME}}",
      "size": "Small",
      "color": "Default",
      "spacing": "Medium"
    }
  ]
}
```

### Formatted Text Version
```markdown
**⚡ MOBIUS Deployment Starting in 5 minutes**

**Final preparations underway**

- **🔒 Maintenance mode:** {{MAINTENANCE_STATUS}}
- **📊 Current system status:** {{SYSTEM_STATUS}}  
- **👥 Active users:** {{ACTIVE_USERS}}
- **🎬 Videos in queue:** {{QUEUE_SIZE}}

Deploy lead: {{DEPLOY_LEAD}} | Expected completion: {{COMPLETION_TIME}}
```

---

## T-0: Deployment In Progress

### Adaptive Card JSON
```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "TextBlock",
      "size": "Large",
      "weight": "Bolder",
      "text": "🔄 MOBIUS Deployment In Progress",
      "color": "Attention"
    },
    {
      "type": "TextBlock",
      "text": "**Deployment {{RELEASE_TAG}} is now live**",
      "weight": "Bolder",
      "spacing": "Medium"
    },
    {
      "type": "FactSet",
      "facts": [
        {
          "title": "⏱️ Started:",
          "value": "{{START_TIME}}"
        },
        {
          "title": "📊 Progress:",
          "value": "{{PROGRESS_PERCENTAGE}}%"
        },
        {
          "title": "🎯 Current phase:",
          "value": "{{CURRENT_PHASE}}"
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "**Component Status:**",
      "weight": "Bolder",
      "spacing": "Medium"
    },
    {
      "type": "ColumnSet",
      "columns": [
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "**Database:**\n{{DB_STATUS}}"
            }
          ]
        },
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "**API:**\n{{API_STATUS}}"
            }
          ]
        }
      ]
    },
    {
      "type": "ColumnSet",
      "columns": [
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "**Pipeline:**\n{{PIPELINE_STATUS}}"
            }
          ]
        },
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "**Frontend:**\n{{FRONTEND_STATUS}}"
            }
          ]
        }
      ]
    },
    {
      "type": "Container",
      "style": "attention",
      "items": [
        {
          "type": "TextBlock",
          "text": "🚫 Service temporarily unavailable | 📞 On-call: {{ONCALL_ENGINEER}}",
          "weight": "Bolder"
        }
      ]
    }
  ]
}
```

### Formatted Text Version
```markdown
**🔄 MOBIUS Deployment In Progress**

**Deployment {{RELEASE_TAG}} is now live**

- **⏱️ Started:** {{START_TIME}}
- **📊 Progress:** {{PROGRESS_PERCENTAGE}}%
- **🎯 Current phase:** {{CURRENT_PHASE}}

**Component Status:**
- **Database:** {{DB_STATUS}}
- **API:** {{API_STATUS}}
- **Video Pipeline:** {{PIPELINE_STATUS}}
- **Frontend:** {{FRONTEND_STATUS}}

**🚫 Service temporarily unavailable**
📞 On-call engineer: {{ONCALL_ENGINEER}}
```

---

## T+15 Minutes: Deployment Complete

### Adaptive Card JSON
```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "TextBlock",
      "size": "Large",
      "weight": "Bolder",
      "text": "✅ MOBIUS Deployment Complete",
      "color": "Good"
    },
    {
      "type": "TextBlock",
      "text": "**Deployment {{RELEASE_TAG}} successfully completed!**",
      "weight": "Bolder",
      "spacing": "Medium"
    },
    {
      "type": "TextBlock",
      "text": "🎉 All services are back online and healthy\n⏱️ Total duration: {{TOTAL_DURATION}}\n📊 Health check: {{HEALTH_STATUS}}",
      "spacing": "Medium"
    },
    {
      "type": "TextBlock",
      "text": "**Performance Metrics:**",
      "weight": "Bolder",
      "spacing": "Medium"
    },
    {
      "type": "ColumnSet",
      "columns": [
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "**API Response:**\n{{API_RESPONSE_TIME}}ms avg"
            }
          ]
        },
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "**Video Pipeline:**\n{{PIPELINE_HEALTH}} ({{PROCESSING_TIME}}s avg)"
            }
          ]
        }
      ]
    },
    {
      "type": "ColumnSet",
      "columns": [
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "**Database:**\n{{DB_CONNECTIONS}} connections"
            }
          ]
        },
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "**Audio Quality:**\nLUFS: {{LUFS_VALUE}} dB ✅"
            }
          ]
        }
      ]
    },
    {
      "type": "Container",
      "style": "good",
      "items": [
        {
          "type": "TextBlock",
          "text": "**What's New:**",
          "weight": "Bolder"
        },
        {
          "type": "TextBlock",
          "text": "{{RELEASE_HIGHLIGHTS}}"
        }
      ]
    }
  ],
  "actions": [
    {
      "type": "Action.OpenUrl",
      "title": "View Application",
      "url": "{{APP_URL}}"
    },
    {
      "type": "Action.OpenUrl",
      "title": "Release Notes",
      "url": "{{RELEASE_NOTES_URL}}"
    }
  ]
}
```

### Formatted Text Version
```markdown
**✅ MOBIUS Deployment Complete**

**Deployment {{RELEASE_TAG}} successfully completed!**

🎉 All services are back online and healthy  
⏱️ Total duration: {{TOTAL_DURATION}}  
📊 Health check: {{HEALTH_STATUS}}

**Performance Metrics:**
- **API Response:** {{API_RESPONSE_TIME}}ms avg
- **Video Pipeline:** {{PIPELINE_HEALTH}} ({{PROCESSING_TIME}}s avg)  
- **Database:** {{DB_CONNECTIONS}} active connections
- **Audio Quality:** LUFS {{LUFS_VALUE}} dB ✅

**What's New:**
{{RELEASE_HIGHLIGHTS}}

**Links:**
- [View Application]({{APP_URL}})
- [Release Notes]({{RELEASE_NOTES_URL}})
- [Dashboard]({{DASHBOARD_URL}})
```

---

## T+60 Minutes: Post-Deploy Status

### Adaptive Card JSON
```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "TextBlock",
      "size": "Large",
      "weight": "Bolder",
      "text": "📊 MOBIUS Post-Deploy Status (1 hour)",
      "color": "Good"
    },
    {
      "type": "TextBlock",
      "text": "**System stability report for {{RELEASE_TAG}}**",
      "weight": "Bolder",
      "spacing": "Medium"
    },
    {
      "type": "TextBlock",
      "text": "✅ Deployment remains stable and healthy\n📈 Performance metrics within normal range\n🎬 Video generation pipeline fully operational",
      "spacing": "Medium"
    },
    {
      "type": "TextBlock",
      "text": "**System Metrics (Last Hour):**",
      "weight": "Bolder",
      "spacing": "Medium"
    },
    {
      "type": "ColumnSet",
      "columns": [
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "**Usage Stats:**\n• {{VIDEOS_GENERATED}} videos generated\n• {{API_REQUESTS}} API requests\n• {{ACTIVE_USERS}} active users"
            }
          ]
        },
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "**Performance:**\n• {{ERROR_RATE}}% error rate\n• {{RESPONSE_TIME}}ms avg response\n• {{UPTIME}}% uptime"
            }
          ]
        }
      ]
    },
    {
      "type": "ColumnSet",
      "columns": [
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "**Resources:**\n• CPU: {{CPU_USAGE}}%\n• Memory: {{MEMORY_USAGE}}%\n• Disk: {{DISK_USAGE}}%"
            }
          ]
        },
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            {
              "type": "TextBlock",
              "text": "**Queue Status:**\n• {{QUEUE_SIZE}} videos pending\n• {{AVG_PROCESSING_TIME}}s avg processing\n• {{QUEUE_WAIT_TIME}}s avg wait"
            }
          ]
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "Next status update in 3 hours | On-call: {{ONCALL_ENGINEER}}",
      "size": "Small",
      "color": "Default",
      "spacing": "Medium"
    }
  ]
}
```

### Formatted Text Version
```markdown
**📊 MOBIUS Post-Deploy Status (1 hour)**

**System stability report for {{RELEASE_TAG}}**

✅ Deployment remains stable and healthy  
📈 Performance metrics within normal range  
🎬 Video generation pipeline fully operational

**Usage Stats (Last Hour):**
- {{VIDEOS_GENERATED}} videos generated
- {{API_REQUESTS}} API requests processed  
- {{ACTIVE_USERS}} active users

**Performance Metrics:**
- {{ERROR_RATE}}% error rate (target: <1%)
- {{RESPONSE_TIME}}ms average response time
- {{UPTIME}}% uptime

**System Resources:**
- CPU utilization: {{CPU_USAGE}}%
- Memory usage: {{MEMORY_USAGE}}%  
- Disk usage: {{DISK_USAGE}}%

**Video Processing Queue:**
- {{QUEUE_SIZE}} videos pending processing
- {{AVG_PROCESSING_TIME}}s average processing time
- {{QUEUE_WAIT_TIME}}s average queue wait time

Next status update in 3 hours | On-call: {{ONCALL_ENGINEER}}
```