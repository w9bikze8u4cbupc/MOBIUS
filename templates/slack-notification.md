# 🚀 MOBIUS Deployment Notifications - Slack Templates

## T-30 Pre-Deployment Notification

```json
{
  "text": "🚀 MOBIUS Deployment Starting Soon",
  "blocks": [
    {
      "type": "header", 
      "text": {
        "type": "plain_text",
        "text": "🚀 MOBIUS Deployment - T-30 Minutes"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Release:* `RELEASE_TAG`"
        },
        {
          "type": "mrkdwn", 
          "text": "*Environment:* {{TARGET_ENV}}"
        },
        {
          "type": "mrkdwn",
          "text": "*Deploy Lead:* @DEPLOY_LEAD"
        },
        {
          "type": "mrkdwn",
          "text": "*Scheduled:* {{DEPLOY_TIME}}"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn", 
        "text": "📋 *Pre-deployment checklist:*\n• ✅ Quality gates passed\n• ✅ Artifacts validated\n• ✅ @ops team notified\n• ✅ Rollback plan ready"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📊 View CI Results"
          },
          "url": "{{CI_URL}}"
        },
        {
          "type": "button", 
          "text": {
            "type": "plain_text",
            "text": "📖 Release Notes"
          },
          "url": "{{RELEASE_NOTES_URL}}"
        }
      ]
    }
  ]
}
```

## T-0 Deployment Started

```json
{
  "text": "🟡 MOBIUS Deployment In Progress", 
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text", 
        "text": "🟡 MOBIUS Deployment Started"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Release:* `RELEASE_TAG`"
        },
        {
          "type": "mrkdwn",
          "text": "*Started:* {{START_TIME}}" 
        },
        {
          "type": "mrkdwn",
          "text": "*Deploy Lead:* @DEPLOY_LEAD"
        },
        {
          "type": "mrkdwn",
          "text": "*ETA:* {{ETA}}"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "🔄 Deployment is now in progress. Monitoring for successful completion..."
      }
    }
  ]
}
```

## T+15 Deployment Success

```json
{
  "text": "✅ MOBIUS Deployment Successful",
  "blocks": [
    {
      "type": "header", 
      "text": {
        "type": "plain_text",
        "text": "✅ MOBIUS Deployment Successful!"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Release:* `RELEASE_TAG`"
        },
        {
          "type": "mrkdwn",
          "text": "*Completed:* {{COMPLETION_TIME}}"
        },
        {
          "type": "mrkdwn", 
          "text": "*Duration:* {{DURATION}}"
        },
        {
          "type": "mrkdwn",
          "text": "*Environment:* {{TARGET_ENV}}"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "🎉 *Deployment completed successfully!*\n\n📊 *Post-deployment status:*\n• ✅ Smoke tests passed\n• ✅ Health checks OK\n• ✅ Monitoring active"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text", 
            "text": "📈 View Monitoring"
          },
          "url": "{{MONITORING_URL}}"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📋 Smoke Test Results" 
          },
          "url": "{{SMOKE_TEST_URL}}"
        }
      ]
    }
  ]
}
```

## T+60 Post-Deployment Summary

```json
{
  "text": "📊 MOBIUS Deployment Summary - T+60",
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text", 
        "text": "📊 MOBIUS Deployment Summary - T+60"
      }
    },
    {
      "type": "section", 
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Release:* `RELEASE_TAG`"
        },
        {
          "type": "mrkdwn",
          "text": "*Status:* ✅ Stable"
        },
        {
          "type": "mrkdwn",
          "text": "*Uptime:* {{UPTIME}}"
        },
        {
          "type": "mrkdwn", 
          "text": "*Performance:* {{PERFORMANCE_STATUS}}"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📈 *1-hour post-deployment metrics:*\n• Response time: {{AVG_RESPONSE_TIME}}ms\n• Error rate: {{ERROR_RATE}}%\n• Throughput: {{THROUGHPUT}} req/min\n• CPU usage: {{CPU_USAGE}}%\n• Memory usage: {{MEMORY_USAGE}}%"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn", 
          "text": "Deployed by @DEPLOY_LEAD • Monitored by @ops • Next review in 24h"
        }
      ]
    }
  ]
}
```

## 🚨 Deployment Failure Alert

```json
{
  "text": "🚨 MOBIUS Deployment Failed",
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🚨 MOBIUS Deployment Failed"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn", 
          "text": "*Release:* `RELEASE_TAG`"
        },
        {
          "type": "mrkdwn",
          "text": "*Failed At:* {{FAILURE_TIME}}"
        },
        {
          "type": "mrkdwn",
          "text": "*Deploy Lead:* @DEPLOY_LEAD"
        },
        {
          "type": "mrkdwn",
          "text": "*Severity:* {{SEVERITY}}"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn", 
        "text": "⚠️ *Deployment failed during {{FAILURE_STAGE}}*\n\n*Error:* {{ERROR_MESSAGE}}\n\n🔄 *Next steps:*\n• Investigating root cause\n• Rollback initiated\n• @ops team notified"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📋 View Logs"
          },
          "url": "{{LOGS_URL}}",
          "style": "danger"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text", 
            "text": "🔄 Rollback Status"
          },
          "url": "{{ROLLBACK_URL}}"
        }
      ]
    }
  ]
}
```