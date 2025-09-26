# Microsoft Teams Notification Templates for MOBIUS Deployments

This document contains Microsoft Teams notification templates using Adaptive Cards for deployment communications during the T-30 to T+60 minute window around MOBIUS deployments.

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

**Channel:** `MOBIUS Operations`  
**Priority:** Important

```
🚀 **MOBIUS Deployment Scheduled**

**Release Version:** {{RELEASE_TAG}}
**Scheduled Time:** {{DEPLOYMENT_TIME}}
**Estimated Duration:** 15 minutes
**Environment:** Production
**Deploy Lead:** {{DEPLOY_LEAD}}

**📋 Release Summary:**
{{RELEASE_NOTES}}

**✅ Pre-deployment Validation:**
- All automated tests: PASSED ✅
- Golden video tests: PASSED ✅
- Security scans: CLEAN ✅
- Performance benchmarks: MET ✅
- Database migrations: READY ✅

**⚠️ Impact:**
- API (api.mobius-games.com): ~2 min downtime expected
- Frontend (mobius-games.com): No downtime expected  
- Game processing: Temporarily suspended during deployment

**🔒 Code Freeze:** Please avoid merging to main branch until deployment completes.

**📞 Questions?** Contact {{DEPLOY_LEAD}} or post in this channel.
```

### T-10: Final Deployment Warning

```
⏰ **MOBIUS Deployment Starting in 10 Minutes**

**Release:** {{RELEASE_TAG}}
**Start Time:** {{DEPLOYMENT_TIME}}
**Deploy Lead:** {{DEPLOY_LEAD}}

**🔴 Final Notice:**
- Code freeze NOW in effect
- No changes to main branch
- All pending PRs should be postponed

**📊 Current System Status:**
- API Health: ✅ HEALTHY
- Database: ✅ READY
- External Services: ✅ OPERATIONAL
- Backup Systems: ✅ STANDBY

**📱 Stay tuned for live updates during deployment.**
```

### T-0: Deployment Started

```
🟡 **MOBIUS Deployment IN PROGRESS**

**Release:** {{RELEASE_TAG}}
**Started:** {{CURRENT_TIME}}
**Lead:** {{DEPLOY_LEAD}}
**Status:** DEPLOYING

**🔄 Current Progress:**
1. ⏳ Building container images...
2. ⏳ Running database migrations...
3. ⏳ Deploying API services...
4. ⏳ Updating frontend...
5. ⏳ Running health checks...

**📈 Live Monitoring:**
- Dashboard: {{MONITORING_URL}}
- Logs: {{LOGS_URL}}
- Status Page: {{STATUS_PAGE_URL}}

**Updates every 3-5 minutes or as status changes.**
```

### T+15: Deployment Complete

```
✅ **MOBIUS Deployment SUCCESSFUL**

**Release:** {{RELEASE_TAG}}
**Completed:** {{COMPLETION_TIME}}
**Total Duration:** {{ACTUAL_DURATION}}
**Lead:** {{DEPLOY_LEAD}}

**🎯 Deployment Results:**
✅ Container deployment: SUCCESS
✅ Database migrations: APPLIED ({{MIGRATION_COUNT}} migrations)
✅ API services: HEALTHY
✅ Frontend deployment: SUCCESS  
✅ Smoke tests: PASSED
✅ Health checks: ALL GREEN

**📊 Current Performance:**
- API Response Time: {{API_RESPONSE_TIME}}ms (target: <2000ms)
- Error Rate: {{ERROR_RATE}}% (target: <1%)
- Memory Usage: {{MEMORY_USAGE}}% (target: <80%)
- CPU Usage: {{CPU_USAGE}}% (target: <70%)

**🔓 Code freeze LIFTED** - Normal development can resume.

**Next Steps:** Running extended health checks and performance validation...
```

### T+30: Health Check Results

```
📊 **MOBIUS Post-Deployment Health Report**

**Release:** {{RELEASE_TAG}}
**Health Status:** {{OVERALL_STATUS}}
**Report Time:** {{HEALTH_CHECK_TIME}}

**🎯 Core Services Health:**
🟢 API Services: {{API_STATUS}} (Avg response: {{API_RESPONSE_TIME}}ms)
🟢 Database: {{DB_STATUS}} ({{DB_CONNECTION_COUNT}} active connections)
🟢 Redis Cache: {{REDIS_STATUS}} (Hit rate: {{CACHE_HIT_RATE}}%)
🟢 File Storage: {{STORAGE_STATUS}} ({{STORAGE_USAGE}}% utilized)

**🎮 Game Processing Pipeline:**
🟢 PDF Processing: {{PDF_STATUS}}
🟢 Text Extraction: {{TEXT_STATUS}}
🟢 Video Generation: {{VIDEO_STATUS}}
🟢 Audio Synthesis: {{AUDIO_STATUS}}
🟢 Metadata Analysis: {{METADATA_STATUS}}

**🌐 External Dependencies:**
🟢 OpenAI API: {{OPENAI_STATUS}} (Latency: {{OPENAI_LATENCY}}ms)
🟢 ElevenLabs API: {{ELEVENLABS_STATUS}} (Latency: {{ELEVENLABS_LATENCY}}ms)
🟢 AWS Services: {{AWS_STATUS}}

**📈 Performance Metrics (vs Pre-deployment):**
- Request Throughput: {{THROUGHPUT}} req/min ({{THROUGHPUT_CHANGE}})
- Error Rate: {{ERROR_RATE}}% ({{ERROR_RATE_CHANGE}})
- P95 Response Time: {{P95_RESPONSE}}ms ({{P95_CHANGE}})
- Memory Efficiency: {{MEMORY_EFFICIENCY}}% ({{MEMORY_CHANGE}})

{{#if ISSUES_DETECTED}}
**⚠️ Issues Requiring Attention:**
{{#each ISSUES_LIST}}
- {{issue_severity}}: {{issue_description}}
{{/each}}
{{else}}
**🎉 All systems operating within normal parameters!**
{{/if}}
```

### T+60: Post-Deployment Summary

```
📋 **MOBIUS Deployment Complete - Final Summary**

**Release:** {{RELEASE_TAG}}
**Environment:** Production
**Date:** {{DEPLOYMENT_DATE}}
**Overall Success:** {{OVERALL_SUCCESS_RATE}}%

**⏱️ Timing Metrics:**
- Total Duration: {{TOTAL_DURATION}} (Target: <20 minutes)
- Actual Downtime: {{ACTUAL_DOWNTIME}} (Target: <2 minutes)
- Rollback Required: {{ROLLBACK_REQUIRED}}

**🎯 Feature Validation Results:**
{{#each NEW_FEATURES}}
- {{feature_name}}: {{status}} {{emoji}}
{{/each}}

**📊 Performance Impact Analysis:**
| Metric | Before | After | Impact |
|--------|--------|-------|---------|
| API Response Time | {{BEFORE_API}}ms | {{AFTER_API}}ms | {{API_IMPACT}} |
| Memory Usage | {{BEFORE_MEM}}MB | {{AFTER_MEM}}MB | {{MEM_IMPACT}} |
| Throughput | {{BEFORE_THROUGHPUT}}/min | {{AFTER_THROUGHPUT}}/min | {{THROUGHPUT_IMPACT}} |
| Error Rate | {{BEFORE_ERROR}}% | {{AFTER_ERROR}}% | {{ERROR_IMPACT}} |

**🎮 Game Processing Validation:**
- Test Games Processed: {{TEST_GAMES_COUNT}}
- Average Processing Time: {{AVG_PROCESS_TIME}}s
- Success Rate: {{PROCESS_SUCCESS_RATE}}%
- Quality Score: {{QUALITY_SCORE}}/10

**✅ Post-Deployment Checklist:**
✅ Monitoring dashboards updated
✅ Alert thresholds adjusted  
✅ Documentation updated
✅ Team notifications sent
✅ Performance baselines established
✅ Backup retention verified

**🔮 Upcoming:**
- Next Release: {{NEXT_RELEASE_TAG}}
- Scheduled: {{NEXT_RELEASE_DATE}}
- Focus Areas: {{NEXT_RELEASE_FOCUS}}

**🙏 Thank you to everyone involved in this successful deployment!**

---
**Lead:** {{DEPLOY_LEAD}}
**Team:** {{TEAM_MEMBERS}}
**Retrospective:** {{RETROSPECTIVE_DATE}}
```

---

## 🧩 Adaptive Card JSON Templates

### T-30: Pre-Deployment Announcement (Adaptive Card)

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "Container",
      "style": "emphasis",
      "items": [
        {
          "type": "ColumnSet",
          "columns": [
            {
              "type": "Column",
              "width": "auto",
              "items": [
                {
                  "type": "TextBlock",
                  "text": "🚀",
                  "size": "large"
                }
              ]
            },
            {
              "type": "Column", 
              "width": "stretch",
              "items": [
                {
                  "type": "TextBlock",
                  "text": "MOBIUS Deployment Scheduled",
                  "weight": "bolder",
                  "size": "large",
                  "color": "accent"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "FactSet",
      "facts": [
        {
          "title": "Release:",
          "value": "`{{RELEASE_TAG}}`"
        },
        {
          "title": "Scheduled Time:",
          "value": "{{DEPLOYMENT_TIME}}"
        },
        {
          "title": "Duration:",
          "value": "~15 minutes"
        },
        {
          "title": "Environment:",
          "value": "Production"
        },
        {
          "title": "Deploy Lead:",
          "value": "{{DEPLOY_LEAD}}"
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "**Release Summary:**",
      "weight": "bolder",
      "spacing": "medium"
    },
    {
      "type": "TextBlock",
      "text": "{{RELEASE_NOTES}}",
      "wrap": true,
      "spacing": "small"
    },
    {
      "type": "TextBlock",
      "text": "**Pre-deployment Validation:**",
      "weight": "bolder",
      "spacing": "medium"
    },
    {
      "type": "TextBlock",
      "text": "✅ All automated tests: PASSED\n✅ Golden video tests: PASSED\n✅ Security scans: CLEAN\n✅ Performance benchmarks: MET",
      "wrap": true,
      "spacing": "small"
    },
    {
      "type": "Container",
      "style": "warning",
      "items": [
        {
          "type": "TextBlock",
          "text": "🔒 **Code Freeze:** Please avoid merging to main branch until deployment completes.",
          "wrap": true,
          "weight": "bolder"
        }
      ]
    }
  ],
  "actions": [
    {
      "type": "Action.OpenUrl",
      "title": "📊 View Dashboard",
      "url": "{{DASHBOARD_URL}}"
    },
    {
      "type": "Action.OpenUrl", 
      "title": "📋 Release Notes",
      "url": "{{RELEASE_NOTES_URL}}"
    }
  ]
}
```

### T-0: Deployment Started (Adaptive Card)

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "Container",
      "style": "warning",
      "items": [
        {
          "type": "ColumnSet",
          "columns": [
            {
              "type": "Column",
              "width": "auto",
              "items": [
                {
                  "type": "TextBlock",
                  "text": "🟡",
                  "size": "large"
                }
              ]
            },
            {
              "type": "Column",
              "width": "stretch", 
              "items": [
                {
                  "type": "TextBlock",
                  "text": "MOBIUS Deployment IN PROGRESS",
                  "weight": "bolder",
                  "size": "large",
                  "color": "warning"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "FactSet",
      "facts": [
        {
          "title": "Release:",
          "value": "`{{RELEASE_TAG}}`"
        },
        {
          "title": "Started:",
          "value": "{{CURRENT_TIME}}"
        },
        {
          "title": "Lead:",
          "value": "{{DEPLOY_LEAD}}"
        },
        {
          "title": "Status:",
          "value": "🔒 Code freeze active"
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "**🔄 Current Progress:**",
      "weight": "bolder",
      "spacing": "medium"
    },
    {
      "type": "TextBlock",
      "text": "1. ⏳ Building container images...\n2. ⏳ Running database migrations...\n3. ⏳ Deploying API services...\n4. ⏳ Updating frontend...\n5. ⏳ Running health checks...",
      "wrap": true,
      "spacing": "small"
    }
  ],
  "actions": [
    {
      "type": "Action.OpenUrl",
      "title": "📈 Live Monitoring",
      "url": "{{MONITORING_URL}}"
    },
    {
      "type": "Action.OpenUrl",
      "title": "📄 View Logs", 
      "url": "{{LOGS_URL}}"
    }
  ]
}
```

### T+15: Deployment Success (Adaptive Card)

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "Container",
      "style": "good",
      "items": [
        {
          "type": "ColumnSet",
          "columns": [
            {
              "type": "Column",
              "width": "auto",
              "items": [
                {
                  "type": "TextBlock",
                  "text": "✅",
                  "size": "large"
                }
              ]
            },
            {
              "type": "Column",
              "width": "stretch",
              "items": [
                {
                  "type": "TextBlock",
                  "text": "MOBIUS Deployment SUCCESSFUL",
                  "weight": "bolder",
                  "size": "large",
                  "color": "good"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "FactSet",
      "facts": [
        {
          "title": "Release:",
          "value": "`{{RELEASE_TAG}}`"
        },
        {
          "title": "Completed:",
          "value": "{{COMPLETION_TIME}}"
        },
        {
          "title": "Duration:",
          "value": "{{ACTUAL_DURATION}}"
        },
        {
          "title": "Status:",
          "value": "🔓 Code freeze lifted"
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "**🎯 Deployment Results:**",
      "weight": "bolder",
      "spacing": "medium"
    },
    {
      "type": "TextBlock",
      "text": "✅ Container deployment: SUCCESS\n✅ Database migrations: APPLIED\n✅ API services: HEALTHY\n✅ Frontend deployment: SUCCESS\n✅ Smoke tests: PASSED\n✅ Health checks: ALL GREEN",
      "wrap": true,
      "spacing": "small"
    },
    {
      "type": "TextBlock",
      "text": "**📊 Performance Metrics:**",
      "weight": "bolder", 
      "spacing": "medium"
    },
    {
      "type": "FactSet",
      "facts": [
        {
          "title": "API Response Time:",
          "value": "{{API_RESPONSE_TIME}}ms"
        },
        {
          "title": "Error Rate:",
          "value": "{{ERROR_RATE}}%"
        },
        {
          "title": "Memory Usage:",
          "value": "{{MEMORY_USAGE}}%"
        }
      ]
    },
    {
      "type": "Container",
      "style": "good",
      "items": [
        {
          "type": "TextBlock",
          "text": "🔓 **Code freeze LIFTED** - Normal development can resume",
          "wrap": true,
          "weight": "bolder"
        }
      ]
    }
  ],
  "actions": [
    {
      "type": "Action.OpenUrl",
      "title": "🎯 Health Dashboard",
      "url": "{{HEALTH_DASHBOARD_URL}}"
    }
  ]
}
```

### T+60: Final Summary (Adaptive Card)

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "Container",
      "style": "emphasis",
      "items": [
        {
          "type": "TextBlock",
          "text": "📋 MOBIUS Deployment Summary Report",
          "weight": "bolder",
          "size": "large",
          "horizontalAlignment": "center"
        }
      ]
    },
    {
      "type": "FactSet",
      "facts": [
        {
          "title": "Release:",
          "value": "`{{RELEASE_TAG}}`"
        },
        {
          "title": "Environment:",
          "value": "Production"
        },
        {
          "title": "Date:",
          "value": "{{DEPLOYMENT_DATE}}"
        },
        {
          "title": "Success Rate:",
          "value": "{{OVERALL_SUCCESS_RATE}}%"
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "**📈 Deployment Metrics:**",
      "weight": "bolder",
      "spacing": "medium"
    },
    {
      "type": "FactSet",
      "facts": [
        {
          "title": "Duration:",
          "value": "{{TOTAL_DURATION}} (target: <20min)"
        },
        {
          "title": "Downtime:",
          "value": "{{ACTUAL_DOWNTIME}} (target: <2min)"
        },
        {
          "title": "Rollback:",
          "value": "{{ROLLBACK_STATUS}}"
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "**🎮 Game Processing Validation:**",
      "weight": "bolder",
      "spacing": "medium"
    },
    {
      "type": "FactSet",
      "facts": [
        {
          "title": "Games Tested:",
          "value": "{{TEST_GAMES_COUNT}}"
        },
        {
          "title": "Avg Process Time:",
          "value": "{{AVG_PROCESS_TIME}}s"
        },
        {
          "title": "Success Rate:",
          "value": "{{PROCESS_SUCCESS_RATE}}%"
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "**🔮 Next Release:** `{{NEXT_RELEASE_TAG}}` scheduled for `{{NEXT_RELEASE_DATE}}`",
      "wrap": true,
      "spacing": "medium"
    },
    {
      "type": "TextBlock",
      "text": "🎉 **Great work team!**",
      "weight": "bolder",
      "horizontalAlignment": "center",
      "spacing": "medium",
      "color": "good"
    }
  ],
  "actions": [
    {
      "type": "Action.OpenUrl",
      "title": "📊 Full Report",
      "url": "{{FULL_REPORT_URL}}"
    },
    {
      "type": "Action.OpenUrl",
      "title": "📋 Retrospective",
      "url": "{{RETROSPECTIVE_URL}}"
    }
  ]
}
```

---

## 🚨 Error and Rollback Templates (Adaptive Cards)

### Deployment Failure Alert

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "Container",
      "style": "attention",
      "items": [
        {
          "type": "ColumnSet",
          "columns": [
            {
              "type": "Column",
              "width": "auto",
              "items": [
                {
                  "type": "TextBlock",
                  "text": "🔴",
                  "size": "large"
                }
              ]
            },
            {
              "type": "Column",
              "width": "stretch",
              "items": [
                {
                  "type": "TextBlock",
                  "text": "MOBIUS Deployment FAILED",
                  "weight": "bolder",
                  "size": "large",
                  "color": "attention"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "FactSet",
      "facts": [
        {
          "title": "Release:",
          "value": "`{{RELEASE_TAG}}`"
        },
        {
          "title": "Failed At:",
          "value": "{{FAILURE_TIME}}"
        },
        {
          "title": "Step:",
          "value": "{{FAILED_STEP}}"
        },
        {
          "title": "Impact:",
          "value": "{{IMPACT_LEVEL}}"
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "**Error Details:**",
      "weight": "bolder",
      "spacing": "medium"
    },
    {
      "type": "TextBlock",
      "text": "```\n{{ERROR_MESSAGE}}\n```",
      "fontType": "monospace",
      "wrap": true,
      "spacing": "small"
    },
    {
      "type": "Container",
      "style": "attention",
      "items": [
        {
          "type": "TextBlock",
          "text": "🚨 **Action Required:**\n• Investigating failure cause\n• Initiating rollback procedure\n• {{DEPLOY_LEAD}} coordinating response",
          "wrap": true,
          "weight": "bolder"
        }
      ]
    }
  ],
  "actions": [
    {
      "type": "Action.OpenUrl",
      "title": "🚨 View Error Logs",
      "url": "{{ERROR_LOGS_URL}}"
    },
    {
      "type": "Action.OpenUrl",
      "title": "📞 Escalate",
      "url": "{{ESCALATION_URL}}"
    }
  ]
}
```

### Rollback Complete

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "Container",
      "style": "warning",
      "items": [
        {
          "type": "TextBlock",
          "text": "🔄 MOBIUS Rollback Complete",
          "weight": "bolder",
          "size": "large",
          "horizontalAlignment": "center"
        }
      ]
    },
    {
      "type": "FactSet",
      "facts": [
        {
          "title": "Failed Release:",
          "value": "`{{FAILED_RELEASE}}`"
        },
        {
          "title": "Rolled Back To:",
          "value": "`{{ROLLBACK_VERSION}}`"
        },
        {
          "title": "Rollback Time:",
          "value": "{{ROLLBACK_DURATION}}"
        },
        {
          "title": "Status:",
          "value": "✅ Services restored"
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "**Services Status:**",
      "weight": "bolder",
      "spacing": "medium"
    },
    {
      "type": "TextBlock",
      "text": "✅ API operational\n✅ Frontend restored\n✅ Database stable\n✅ Health checks passing",
      "wrap": true,
      "spacing": "small"
    },
    {
      "type": "TextBlock",
      "text": "**Impact Summary:**",
      "weight": "bolder",
      "spacing": "medium"
    },
    {
      "type": "FactSet",
      "facts": [
        {
          "title": "Total Downtime:",
          "value": "{{TOTAL_DOWNTIME}}"
        },
        {
          "title": "Users Affected:",
          "value": "{{AFFECTED_USERS}}"
        },
        {
          "title": "Degraded Time:",
          "value": "{{DEGRADED_TIME}}"
        }
      ]
    }
  ]
}
```

---

## 🔧 Webhook Configuration

### Teams Webhook Setup

1. Navigate to your Teams channel
2. Click "..." → "Connectors"
3. Find "Incoming Webhook" and click "Add"
4. Configure webhook name and image
5. Copy the webhook URL

Example webhook URL format:
```
https://outlook.office.com/webhook/{{TEAM_ID}}/IncomingWebhook/{{CHANNEL_ID}}/{{TOKEN}}
```

### Environment Variables

```bash
# Teams configuration
export TEAMS_WEBHOOK_URL="https://outlook.office.com/webhook/..."
export TEAMS_CHANNEL_NAME="MOBIUS Operations"
export TEAMS_BOT_NAME="MOBIUS Deploy Bot"
```

---

## 📝 Usage Examples

### Send Teams Notification via PowerShell

```powershell
# Send T-0 deployment notification to Teams

$WebhookUrl = $env:TEAMS_WEBHOOK_URL
$ReleaseTag = $args[0]

$Body = @{
    "@type" = "MessageCard"
    "@context" = "https://schema.org/extensions"
    "summary" = "MOBIUS Deployment Started"
    "themeColor" = "FFA500" 
    "title" = "🟡 MOBIUS Deployment IN PROGRESS"
    "sections" = @(
        @{
            "facts" = @(
                @{ "name" = "Release"; "value" = $ReleaseTag },
                @{ "name" = "Started"; "value" = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") },
                @{ "name" = "Status"; "value" = "DEPLOYING" }
            )
        }
    )
    "potentialAction" = @(
        @{
            "@type" = "OpenUri"
            "name" = "📈 View Dashboard"
            "targets" = @(
                @{ "os" = "default"; "uri" = "{{DASHBOARD_URL}}" }
            )
        }
    )
}

$JsonBody = $Body | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $JsonBody -ContentType 'application/json'
```

### Send Teams Notification via cURL

```bash
#!/bin/bash
# Send custom Teams notification

WEBHOOK_URL="${TEAMS_WEBHOOK_URL}"
MESSAGE="$1"
STATUS="$2"  # success, warning, error

# Determine color based on status
case $STATUS in
  "success") COLOR="00FF00" ;;
  "warning") COLOR="FFA500" ;;
  "error") COLOR="FF0000" ;;
  *) COLOR="0078D4" ;;
esac

curl -X POST -H 'Content-Type: application/json' \
  --data "{
    \"@type\": \"MessageCard\",
    \"@context\": \"https://schema.org/extensions\",
    \"summary\": \"MOBIUS Deployment Update\",
    \"themeColor\": \"${COLOR}\",
    \"title\": \"MOBIUS Deployment Update\",
    \"text\": \"${MESSAGE}\"
  }" \
  "${WEBHOOK_URL}"
```

### Send Adaptive Card via Node.js

```javascript
const axios = require('axios');

async function sendTeamsNotification(webhookUrl, adaptiveCard) {
  const payload = {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: adaptiveCard
    }]
  };

  try {
    await axios.post(webhookUrl, payload);
    console.log('Teams notification sent successfully');
  } catch (error) {
    console.error('Failed to send Teams notification:', error);
  }
}

// Usage example
const card = {
  // Adaptive Card JSON from templates above
};

sendTeamsNotification(process.env.TEAMS_WEBHOOK_URL, card);
```

---

## 🔄 Integration with CI/CD

### GitHub Actions Integration

```yaml
# .github/workflows/notify-teams.yml
name: Notify Teams
on:
  workflow_run:
    workflows: ["Deploy"]
    types: [completed]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
    - name: Send Teams Notification
      uses: ./.github/actions/teams-notification
      with:
        webhook-url: ${{ secrets.TEAMS_WEBHOOK_URL }}
        status: ${{ github.event.workflow_run.conclusion }}
        release-tag: ${{ github.event.workflow_run.head_branch }}
```

---

*Template Version: 1.0*  
*Last Updated: {{CURRENT_DATE}}*  
*Channel: MOBIUS Operations*