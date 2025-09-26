# Slack Notification Templates for MOBIUS Deployments

This document contains Slack notification templates for deployment communications during the T-30 to T+60 minute window around MOBIUS deployments.

## 🔔 Notification Schedule

- **T-30:** Pre-deployment announcement
- **T-10:** Final deployment warning
- **T-0:** Deployment started
- **T+15:** Deployment complete / Status update
- **T+30:** Health check results
- **T+60:** Post-deployment summary

---

## 📱 Human-Readable Templates

### T-30: Pre-Deployment Announcement

**Channel:** `#mobius-deployments`  
**Mentions:** `@channel`

```
🚀 **MOBIUS Deployment Scheduled**

**Release:** `{{RELEASE_TAG}}`  
**Scheduled Time:** `{{DEPLOYMENT_TIME}}`  
**Duration:** ~15 minutes  
**Environment:** Production

**Changes in this release:**
{{RELEASE_NOTES}}

**Pre-deployment checklist:**
✅ All tests passing  
✅ Golden tests validated  
✅ Security scan clean  
✅ Performance benchmarks met  

**Point of contact:** {{DEPLOY_LEAD}} 

Please avoid making changes to the main branch until deployment is complete.
```

### T-10: Final Deployment Warning

```
⏰ **MOBIUS Deployment Starting in 10 minutes**

**Release:** `{{RELEASE_TAG}}`  
**Time:** `{{DEPLOYMENT_TIME}}`  
**Lead:** {{DEPLOY_LEAD}}

🔒 **Code freeze in effect** - No merges to main branch until further notice.

**Services affected:**
• API (api.mobius-games.com) - ~2 min downtime
• Frontend (mobius-games.com) - No downtime expected
• Game processing pipeline - Temporarily suspended

**Rollback plan:** Available if issues detected within 30 minutes
```

### T-0: Deployment Started

```
🟡 **MOBIUS Deployment IN PROGRESS**

**Release:** `{{RELEASE_TAG}}`  
**Started:** `{{CURRENT_TIME}}`  
**Lead:** {{DEPLOY_LEAD}}

**Current status:**
⏳ Building containers...  
⏳ Preparing database migrations...  
⏳ Staging deployment artifacts...  

**Monitoring:** {{MONITORING_URL}}  
**Logs:** {{LOGS_URL}}  

Updates every 5 minutes or as status changes.
```

### T+15: Deployment Complete / Status Update

```
✅ **MOBIUS Deployment SUCCESSFUL**

**Release:** `{{RELEASE_TAG}}`  
**Completed:** `{{COMPLETION_TIME}}`  
**Duration:** `{{ACTUAL_DURATION}}`

**Status:**
✅ API deployment complete  
✅ Frontend updated  
✅ Database migrations applied  
✅ Health checks passing  
✅ Basic smoke tests passed  

**Performance:**
• API response time: {{API_RESPONSE_TIME}}ms  
• Error rate: {{ERROR_RATE}}%  
• Memory usage: {{MEMORY_USAGE}}%  

🔓 **Code freeze lifted** - Normal development can resume.

Running extended health checks...
```

### T+30: Health Check Results

```
📊 **MOBIUS Post-Deployment Health Check**

**Release:** `{{RELEASE_TAG}}`  
**Health Status:** {{OVERALL_STATUS}}

**Detailed Results:**
🎯 **Core Services**
• API Health: {{API_STATUS}} ({{API_RESPONSE_TIME}}ms avg)
• Database: {{DB_STATUS}} ({{DB_CONNECTION_COUNT}} connections)
• Redis Cache: {{REDIS_STATUS}}

🎮 **Game Pipeline**
• Video Generation: {{VIDEO_STATUS}}
• Audio Synthesis: {{AUDIO_STATUS}} 
• PDF Processing: {{PDF_STATUS}}
• Metadata Extraction: {{METADATA_STATUS}}

🌐 **External Dependencies**
• OpenAI API: {{OPENAI_STATUS}}
• ElevenLabs API: {{ELEVENLABS_STATUS}}
• AWS Services: {{AWS_STATUS}}

**Performance Metrics:**
• Throughput: {{THROUGHPUT}} req/min
• Error Rate: {{ERROR_RATE}}% (target: <1%)
• P95 Response Time: {{P95_RESPONSE}}ms (target: <2000ms)

{{#if ISSUES_DETECTED}}
⚠️ **Issues Detected:**
{{ISSUES_LIST}}
{{/if}}
```

### T+60: Post-Deployment Summary

```
📋 **MOBIUS Deployment Summary Report**

**Release:** `{{RELEASE_TAG}}`  
**Environment:** Production  
**Date:** `{{DEPLOYMENT_DATE}}`

**📈 Deployment Metrics:**
• **Duration:** {{TOTAL_DURATION}} (target: <20min)
• **Downtime:** {{ACTUAL_DOWNTIME}} (target: <2min)  
• **Success Rate:** {{SUCCESS_RATE}}%
• **Rollback:** {{ROLLBACK_STATUS}}

**🎯 Feature Validation:**
{{#each NEW_FEATURES}}
• {{feature_name}}: {{validation_status}}
{{/each}}

**📊 Performance Comparison:**
| Metric | Before | After | Change |
|--------|--------|-------|---------|
| API Response | {{BEFORE_API}}ms | {{AFTER_API}}ms | {{API_CHANGE}} |
| Memory Usage | {{BEFORE_MEM}}MB | {{AFTER_MEM}}MB | {{MEM_CHANGE}} |
| Error Rate | {{BEFORE_ERR}}% | {{AFTER_ERR}}% | {{ERR_CHANGE}} |

**🎮 Game Processing Tests:**
• Sample games processed: {{GAMES_TESTED}}
• Average processing time: {{AVG_PROCESS_TIME}}s
• Success rate: {{PROCESS_SUCCESS_RATE}}%

**✅ Post-deployment actions completed:**
• Monitoring alerts updated
• Documentation updated  
• Team notified
• Metrics baseline established

**🔮 Next Release:** `{{NEXT_RELEASE_TAG}}` scheduled for `{{NEXT_RELEASE_DATE}}`

Great work team! 🎉
```

---

## 🧩 Block Kit JSON Templates

### T-30: Pre-Deployment Announcement (Block Kit)

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🚀 MOBIUS Deployment Scheduled"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Release:*\n`{{RELEASE_TAG}}`"
        },
        {
          "type": "mrkdwn", 
          "text": "*Scheduled Time:*\n{{DEPLOYMENT_TIME}}"
        },
        {
          "type": "mrkdwn",
          "text": "*Duration:*\n~15 minutes"
        },
        {
          "type": "mrkdwn",
          "text": "*Environment:*\nProduction"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Changes in this release:*\n{{RELEASE_NOTES}}"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Pre-deployment checklist:*\n✅ All tests passing\n✅ Golden tests validated\n✅ Security scan clean\n✅ Performance benchmarks met"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Point of contact:* {{DEPLOY_LEAD}}\n\nPlease avoid making changes to the main branch until deployment is complete."
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📊 View Dashboard"
          },
          "url": "{{DASHBOARD_URL}}",
          "style": "primary"
        },
        {
          "type": "button", 
          "text": {
            "type": "plain_text",
            "text": "📋 Release Notes"
          },
          "url": "{{RELEASE_NOTES_URL}}"
        }
      ]
    }
  ]
}
```

### T-0: Deployment Started (Block Kit)

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🟡 MOBIUS Deployment IN PROGRESS"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Release:*\n`{{RELEASE_TAG}}`"
        },
        {
          "type": "mrkdwn",
          "text": "*Started:*\n{{CURRENT_TIME}}"
        },
        {
          "type": "mrkdwn", 
          "text": "*Lead:*\n{{DEPLOY_LEAD}}"
        },
        {
          "type": "mrkdwn",
          "text": "*Status:*\n🔒 Code freeze active"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Current status:*\n⏳ Building containers...\n⏳ Preparing database migrations...\n⏳ Staging deployment artifacts..."
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text", 
            "text": "📈 Live Monitoring"
          },
          "url": "{{MONITORING_URL}}",
          "style": "primary"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📄 View Logs"
          },
          "url": "{{LOGS_URL}}"
        }
      ]
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Updates every 5 minutes or as status changes"
        }
      ]
    }
  ]
}
```

### T+15: Deployment Success (Block Kit)

```json
{
  "blocks": [
    {
      "type": "header", 
      "text": {
        "type": "plain_text",
        "text": "✅ MOBIUS Deployment SUCCESSFUL"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Release:*\n`{{RELEASE_TAG}}`"
        },
        {
          "type": "mrkdwn",
          "text": "*Completed:*\n{{COMPLETION_TIME}}"
        },
        {
          "type": "mrkdwn",
          "text": "*Duration:*\n{{ACTUAL_DURATION}}"
        },
        {
          "type": "mrkdwn", 
          "text": "*Status:*\n🔓 Code freeze lifted"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Deployment Status:*\n✅ API deployment complete\n✅ Frontend updated\n✅ Database migrations applied\n✅ Health checks passing\n✅ Basic smoke tests passed"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Performance Metrics:*\n• API response time: {{API_RESPONSE_TIME}}ms\n• Error rate: {{ERROR_RATE}}%\n• Memory usage: {{MEMORY_USAGE}}%"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "🎯 Health Dashboard"
          },
          "url": "{{HEALTH_DASHBOARD_URL}}",
          "style": "primary"
        }
      ]
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Normal development can resume. Running extended health checks..."
        }
      ]
    }
  ]
}
```

### T+60: Post-Deployment Summary (Block Kit)

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "📋 MOBIUS Deployment Summary Report"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Release:*\n`{{RELEASE_TAG}}`"
        },
        {
          "type": "mrkdwn",
          "text": "*Environment:*\nProduction"
        },
        {
          "type": "mrkdwn", 
          "text": "*Date:*\n{{DEPLOYMENT_DATE}}"
        },
        {
          "type": "mrkdwn",
          "text": "*Success Rate:*\n{{SUCCESS_RATE}}%"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*📈 Deployment Metrics:*\n• *Duration:* {{TOTAL_DURATION}} (target: <20min)\n• *Downtime:* {{ACTUAL_DOWNTIME}} (target: <2min)\n• *Rollback:* {{ROLLBACK_STATUS}}"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*🎮 Game Processing Tests:*\n• Sample games processed: {{GAMES_TESTED}}\n• Average processing time: {{AVG_PROCESS_TIME}}s\n• Success rate: {{PROCESS_SUCCESS_RATE}}%"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*🔮 Next Release:* `{{NEXT_RELEASE_TAG}}` scheduled for `{{NEXT_RELEASE_DATE}}`\n\nGreat work team! 🎉"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📊 Full Report"
          },
          "url": "{{FULL_REPORT_URL}}",
          "style": "primary"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📋 Retrospective"
          },
          "url": "{{RETROSPECTIVE_URL}}"
        }
      ]
    }
  ]
}
```

---

## 🔧 Webhook Configuration

### Slack Webhook Setup

1. Create a new Slack app at https://api.slack.com/apps
2. Add webhook permissions
3. Install app to workspace
4. Copy webhook URL

Example webhook URL format:
```
https://hooks.slack.com/services/{{TEAM_ID}}/{{CHANNEL_ID}}/{{TOKEN}}
```

### Environment Variables

```bash
# Slack configuration
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
export SLACK_CHANNEL="#mobius-deployments"
export SLACK_USERNAME="MOBIUS Deploy Bot"
export SLACK_ICON_EMOJI=":rocket:"
```

---

## 🚨 Error and Rollback Templates

### Deployment Failure Alert

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text", 
        "text": "🔴 MOBIUS Deployment FAILED"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Release:*\n`{{RELEASE_TAG}}`"
        },
        {
          "type": "mrkdwn",
          "text": "*Failed At:*\n{{FAILURE_TIME}}"
        },
        {
          "type": "mrkdwn",
          "text": "*Step:*\n{{FAILED_STEP}}"
        },
        {
          "type": "mrkdwn",
          "text": "*Impact:*\n{{IMPACT_LEVEL}}"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Error Details:*\n```{{ERROR_MESSAGE}}```"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*🚨 Action Required:*\n• Investigating failure cause\n• Initiating rollback procedure\n• {{DEPLOY_LEAD}} coordinating response\n\n*Services Status:*\n{{SERVICE_STATUS_LIST}}"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "🚨 View Logs"
          },
          "url": "{{ERROR_LOGS_URL}}",
          "style": "danger"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text", 
            "text": "📞 Escalate"
          },
          "url": "{{ESCALATION_URL}}"
        }
      ]
    }
  ]
}
```

### Rollback Complete

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🔄 MOBIUS Rollback Complete"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Failed Release:*\n`{{FAILED_RELEASE}}`"
        },
        {
          "type": "mrkdwn",
          "text": "*Rolled Back To:*\n`{{ROLLBACK_VERSION}}`"
        },
        {
          "type": "mrkdwn",
          "text": "*Rollback Time:*\n{{ROLLBACK_DURATION}}"
        },
        {
          "type": "mrkdwn", 
          "text": "*Status:*\n✅ Services restored"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Services Status:*\n✅ API operational\n✅ Frontend restored\n✅ Database stable\n✅ Health checks passing"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Next Steps:*\n• Post-incident review scheduled\n• Root cause analysis in progress\n• Fix for {{FAILED_RELEASE}} in development\n\n*Impact Summary:*\n• Downtime: {{TOTAL_DOWNTIME}}\n• Users affected: {{AFFECTED_USERS}}\n• Degraded performance: {{DEGRADED_TIME}}"
      }
    }
  ]
}
```

---

## 📝 Usage Examples

### Send Deployment Start Notification

```bash
#!/bin/bash
# Send T-0 deployment notification

WEBHOOK_URL="${SLACK_WEBHOOK_URL}"
RELEASE_TAG="${1:-latest}"

curl -X POST -H 'Content-type: application/json' \
  --data '{
    "channel": "#mobius-deployments",
    "username": "MOBIUS Deploy Bot",
    "icon_emoji": ":rocket:",
    "blocks": [/* Block Kit JSON from T-0 template */]
  }' \
  "${WEBHOOK_URL}"
```

### Send Custom Status Update

```bash
#!/bin/bash
# Send custom deployment status

MESSAGE="$1"
STATUS="$2"  # success, warning, error

curl -X POST -H 'Content-type: application/json' \
  --data "{
    \"channel\": \"#mobius-deployments\",
    \"text\": \"MOBIUS Deployment Update: ${MESSAGE}\",
    \"username\": \"MOBIUS Deploy Bot\",
    \"icon_emoji\": \":information_source:\"
  }" \
  "${SLACK_WEBHOOK_URL}"
```

---

*Template Version: 1.0*  
*Last Updated: {{CURRENT_DATE}}*  
*Channel: #mobius-deployments*