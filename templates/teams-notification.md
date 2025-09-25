# 🚀 MOBIUS Deployment Notifications - Microsoft Teams Templates

## T-30 Pre-Deployment Notification

```json
{
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  "summary": "MOBIUS Deployment Starting Soon",
  "themeColor": "0078D4",
  "sections": [
    {
      "activityTitle": "🚀 MOBIUS Deployment - T-30 Minutes",
      "activitySubtitle": "Pre-deployment notification for RELEASE_TAG",
      "facts": [
        {
          "name": "Release:",
          "value": "RELEASE_TAG"
        },
        {
          "name": "Environment:", 
          "value": "{{TARGET_ENV}}"
        },
        {
          "name": "Deploy Lead:",
          "value": "@DEPLOY_LEAD"
        },
        {
          "name": "Scheduled Time:",
          "value": "{{DEPLOY_TIME}}"
        }
      ],
      "text": "📋 **Pre-deployment checklist:**\n- ✅ Quality gates passed\n- ✅ Artifacts validated  \n- ✅ @ops team notified\n- ✅ Rollback plan ready"
    }
  ],
  "potentialAction": [
    {
      "@type": "OpenUri", 
      "name": "📊 View CI Results",
      "targets": [
        {
          "os": "default",
          "uri": "{{CI_URL}}"
        }
      ]
    },
    {
      "@type": "OpenUri",
      "name": "📖 Release Notes", 
      "targets": [
        {
          "os": "default",
          "uri": "{{RELEASE_NOTES_URL}}"
        }
      ]
    }
  ]
}
```

## T-0 Deployment Started

```json
{
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  "summary": "MOBIUS Deployment In Progress",
  "themeColor": "FF8C00",
  "sections": [
    {
      "activityTitle": "🟡 MOBIUS Deployment Started", 
      "activitySubtitle": "Deployment is now in progress",
      "facts": [
        {
          "name": "Release:",
          "value": "RELEASE_TAG"
        },
        {
          "name": "Started:",
          "value": "{{START_TIME}}"
        },
        {
          "name": "Deploy Lead:",
          "value": "@DEPLOY_LEAD"
        },
        {
          "name": "Estimated Completion:",
          "value": "{{ETA}}"
        }
      ],
      "text": "🔄 Deployment is now in progress. Monitoring for successful completion..."
    }
  ]
}
```

## T+15 Deployment Success

```json
{
  "@type": "MessageCard", 
  "@context": "https://schema.org/extensions",
  "summary": "MOBIUS Deployment Successful",
  "themeColor": "28A745",
  "sections": [
    {
      "activityTitle": "✅ MOBIUS Deployment Successful!",
      "activitySubtitle": "Deployment completed successfully",
      "facts": [
        {
          "name": "Release:",
          "value": "RELEASE_TAG"
        },
        {
          "name": "Completed:",
          "value": "{{COMPLETION_TIME}}"
        },
        {
          "name": "Duration:",
          "value": "{{DURATION}}"
        },
        {
          "name": "Environment:", 
          "value": "{{TARGET_ENV}}"
        }
      ],
      "text": "🎉 **Deployment completed successfully!**\n\n📊 **Post-deployment status:**\n- ✅ Smoke tests passed\n- ✅ Health checks OK\n- ✅ Monitoring active"
    }
  ],
  "potentialAction": [
    {
      "@type": "OpenUri",
      "name": "📈 View Monitoring",
      "targets": [
        {
          "os": "default", 
          "uri": "{{MONITORING_URL}}"
        }
      ]
    },
    {
      "@type": "OpenUri",
      "name": "📋 Smoke Test Results",
      "targets": [
        {
          "os": "default",
          "uri": "{{SMOKE_TEST_URL}}"
        }
      ]
    }
  ]
}
```

## T+60 Post-Deployment Summary

```json
{
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions", 
  "summary": "MOBIUS Deployment Summary - T+60",
  "themeColor": "0078D4",
  "sections": [
    {
      "activityTitle": "📊 MOBIUS Deployment Summary - T+60",
      "activitySubtitle": "One-hour post-deployment metrics", 
      "facts": [
        {
          "name": "Release:",
          "value": "RELEASE_TAG"
        },
        {
          "name": "Status:",
          "value": "✅ Stable"
        },
        {
          "name": "Uptime:",
          "value": "{{UPTIME}}"
        },
        {
          "name": "Performance:",
          "value": "{{PERFORMANCE_STATUS}}"
        }
      ],
      "text": "📈 **1-hour post-deployment metrics:**\n- Response time: {{AVG_RESPONSE_TIME}}ms\n- Error rate: {{ERROR_RATE}}%\n- Throughput: {{THROUGHPUT}} req/min\n- CPU usage: {{CPU_USAGE}}%\n- Memory usage: {{MEMORY_USAGE}}%\n\n*Deployed by @DEPLOY_LEAD • Monitored by @ops • Next review in 24h*"
    }
  ]
}
```

## 🚨 Deployment Failure Alert

```json
{
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  "summary": "MOBIUS Deployment Failed", 
  "themeColor": "DC3545",
  "sections": [
    {
      "activityTitle": "🚨 MOBIUS Deployment Failed",
      "activitySubtitle": "Immediate attention required",
      "facts": [
        {
          "name": "Release:",
          "value": "RELEASE_TAG"
        },
        {
          "name": "Failed At:", 
          "value": "{{FAILURE_TIME}}"
        },
        {
          "name": "Deploy Lead:",
          "value": "@DEPLOY_LEAD"
        },
        {
          "name": "Severity:",
          "value": "{{SEVERITY}}"
        }
      ],
      "text": "⚠️ **Deployment failed during {{FAILURE_STAGE}}**\n\n**Error:** {{ERROR_MESSAGE}}\n\n🔄 **Next steps:**\n- Investigating root cause\n- Rollback initiated\n- @ops team notified"
    }
  ],
  "potentialAction": [
    {
      "@type": "OpenUri",
      "name": "📋 View Logs",
      "targets": [
        {
          "os": "default",
          "uri": "{{LOGS_URL}}"
        }
      ]
    },
    {
      "@type": "OpenUri", 
      "name": "🔄 Rollback Status",
      "targets": [
        {
          "os": "default",
          "uri": "{{ROLLBACK_URL}}"
        }
      ]
    }
  ]
}
```