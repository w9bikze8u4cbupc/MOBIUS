#!/bin/bash
# MOBIUS dhash Slack/Teams T-30 → T+60 Notification Templates
# Ready-to-use notification templates for deployment communication

# =============================================================================
# SLACK NOTIFICATION TEMPLATES
# =============================================================================

# T-30: Pre-deployment notification (30 minutes before)
slack_pre_deployment() {
    cat << 'EOF'
🔔 **UPCOMING DEPLOYMENT - T-30 minutes**

**System:** MOBIUS dhash  
**Environment:** Production  
**Release:** {{ RELEASE_TAG }}  
**Deploy Lead:** {{ @DEPLOY_LEAD }}  
**Scheduled:** {{ DEPLOY_TIME }} ({{ TIMEZONE }})  
**Window:** {{ DEPLOY_WINDOW_DURATION }} minutes  

**Pre-deployment Status:**
✅ All CI checks passed  
✅ Quality gates validated  
✅ Backup created and verified  
✅ Rollback plan confirmed  
✅ Deploy team ready  

**Expected Impact:**
- Service availability: {{ EXPECTED_AVAILABILITY }}
- Downtime: {{ EXPECTED_DOWNTIME }}
- User impact: {{ USER_IMPACT_LEVEL }}

**Team Assignments:**  
- Deploy Lead: {{ @DEPLOY_LEAD }}  
- SRE Support: {{ @SRE_TEAM }}  
- Engineering: {{ @ENG_TEAM }}  

**Communication:**  
📢 Updates in #deployments  
🚨 Alerts in #alerts  
📞 Emergency: {{ EMERGENCY_CONTACT }}  

Get ready team! 🚀

@channel
EOF
}

# T-15: Deployment starting soon
slack_deployment_starting() {
    cat << 'EOF'
⏰ **DEPLOYMENT STARTING - T-15 minutes**

**Final pre-deployment check:**
✅ All systems go  
✅ Team standing by  
✅ Monitoring ready  
✅ Rollback plan active  

**Status Page:** {{ STATUS_PAGE_URL }}  
**Monitoring:** {{ MONITORING_DASHBOARD_URL }}  

Next update: Deployment started (~T+0)

{{ @DEPLOY_LEAD }} {{ @SRE_TEAM }}
EOF
}

# T+0: Deployment started
slack_deployment_started() {
    cat << 'EOF'
🚀 **DEPLOYMENT STARTED**

**System:** MOBIUS dhash  
**Environment:** Production  
**Release:** {{ RELEASE_TAG }}  
**Started:** {{ START_TIME }}  
**ETA:** {{ COMPLETION_ETA }}  

**Current Status:**  
🔄 Deployment in progress  
📊 Monitoring active  
⏱️ Expected completion: {{ COMPLETION_TIME }}  

**Live Updates:**  
- Deploy log: `{{ DEPLOY_LOG_PATH }}`  
- Health dashboard: {{ HEALTH_DASHBOARD_URL }}  
- Status page: {{ STATUS_PAGE_URL }}  

Next update: Deployment completion (~{{ COMPLETION_ETA }})

{{ @DEPLOY_LEAD }}
EOF
}

# T+15: Deployment complete
slack_deployment_complete() {
    cat << 'EOF'
✅ **DEPLOYMENT COMPLETE**

**System:** MOBIUS dhash  
**Environment:** Production  
**Release:** {{ RELEASE_TAG }}  
**Completed:** {{ COMPLETION_TIME }}  
**Duration:** {{ DEPLOY_DURATION }}  
**Status:** Successful ✅  

**Post-deployment Status:**  
✅ Application started successfully  
✅ Health checks passing  
✅ Initial metrics within range  
📊 T+60 monitoring active  

**Current Metrics:**  
- Response Time P95: {{ RESPONSE_TIME_P95 }}ms  
- Error Rate: {{ ERROR_RATE }}%  
- CPU: {{ CPU_USAGE }}% | Memory: {{ MEMORY_USAGE }}%  
- Throughput: {{ THROUGHPUT }} req/s  

**Monitoring Period:**  
📊 {{ MONITORING_DURATION }} minutes of extended monitoring  
⚠️ Alerts configured for quality gates  
📈 Dashboard: {{ MONITORING_DASHBOARD_URL }}  

Excellent work team! 🎉

Next update: T+60 monitoring summary

{{ @DEPLOY_LEAD }} @channel
EOF
}

# T+30: Mid-monitoring update
slack_monitoring_update() {
    cat << 'EOF'
📊 **T+30 MONITORING UPDATE**

**Status:** All systems healthy ✅  
**Monitoring:** 30/60 minutes complete  

**Performance Metrics:**  
- Response Time P95: {{ RESPONSE_TIME_P95 }}ms ✅  
- Error Rate: {{ ERROR_RATE }}% ✅  
- CPU Usage: {{ CPU_USAGE }}% ✅  
- Memory Usage: {{ MEMORY_USAGE }}% ✅  

**Quality Gates:**  
✅ All thresholds within limits  
✅ No alerts triggered  
✅ Service stability confirmed  

**User Experience:**  
- Page Load Time: {{ PAGE_LOAD_TIME }}ms  
- API Response: {{ API_RESPONSE_TIME }}ms  
- Error Reports: {{ USER_ERROR_COUNT }}  

Continuing monitoring for 30 more minutes...

{{ @DEPLOY_LEAD }}
EOF
}

# T+60: Final monitoring summary
slack_monitoring_complete() {
    cat << 'EOF'
🎯 **DEPLOYMENT MONITORING COMPLETE**

**System:** MOBIUS dhash  
**Release:** {{ RELEASE_TAG }}  
**Monitoring:** 60 minutes complete  
**Status:** Successful deployment ✅  

**Final Metrics Summary:**  
📈 **Performance (60-min average)**  
- Response Time P95: {{ AVG_RESPONSE_TIME_P95 }}ms (threshold: 2000ms)  
- Response Time P99: {{ AVG_RESPONSE_TIME_P99 }}ms  
- Error Rate: {{ AVG_ERROR_RATE }}% (threshold: 5%)  
- Availability: {{ AVAILABILITY }}% (threshold: 99.9%)  

📊 **Resource Utilization**  
- CPU Usage: {{ AVG_CPU_USAGE }}% (threshold: 80%)  
- Memory Usage: {{ AVG_MEMORY_USAGE }}% (threshold: 90%)  
- Disk Usage: {{ DISK_USAGE }}%  

🚨 **Alerts & Issues**  
- Total Alerts: {{ ALERT_COUNT }}  
- Critical Alerts: {{ CRITICAL_ALERT_COUNT }}  
- Issues Resolved: {{ RESOLVED_ISSUES }}  
- Outstanding Issues: {{ OUTSTANDING_ISSUES }}  

**Deployment Success Criteria:**  
✅ All quality gates passed  
✅ No critical issues detected  
✅ Performance within thresholds  
✅ User experience maintained  

**Artifacts:**  
- Deployment log: `{{ DEPLOY_LOG_PATH }}`  
- Monitoring log: `{{ MONITOR_LOG_PATH }}`  
- Backup: `{{ BACKUP_FILE_PATH }}`  

🎉 **DEPLOYMENT SUCCESSFULLY COMPLETED**

Great teamwork everyone! The {{ RELEASE_TAG }} deployment is now stable and monitoring is complete.

{{ @DEPLOY_LEAD }} @channel
EOF
}

# Emergency/Rollback notifications
slack_rollback_initiated() {
    cat << 'EOF'
🚨 **EMERGENCY ROLLBACK INITIATED**

**System:** MOBIUS dhash  
**Environment:** Production  
**Trigger:** {{ ROLLBACK_REASON }}  
**Initiated:** {{ ROLLBACK_START_TIME }}  
**Operator:** {{ @DEPLOY_LEAD }}  

**Rollback Status:**  
🔄 Rollback in progress  
💾 Using backup: `{{ BACKUP_FILE }}`  
⏱️ ETA: {{ ROLLBACK_ETA }}  

**Current Impact:**  
⚠️ Service status: {{ SERVICE_STATUS }}  
👥 User impact: {{ USER_IMPACT }}  
📊 Metrics: {{ CURRENT_METRICS }}  

**Response Team:**  
- Operations: {{ @DEPLOY_LEAD }}  
- SRE: {{ @SRE_ONCALL }}  
- Engineering: {{ @ENG_ONCALL }}  

**Communication:**  
📢 Live updates in #incidents  
📞 War room: {{ WAR_ROOM_URL }}  
📋 Incident: {{ INCIDENT_URL }}  

@channel - All hands on deck
EOF
}

# =============================================================================
# TEAMS NOTIFICATION TEMPLATES  
# =============================================================================

# Teams webhook JSON template for deployment started
teams_deployment_started() {
    cat << 'EOF'
{
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "themeColor": "0078D4",
    "summary": "MOBIUS dhash Deployment Started",
    "sections": [
        {
            "activityTitle": "🚀 MOBIUS dhash Deployment Started",
            "activitySubtitle": "Production deployment of {{ RELEASE_TAG }} is now in progress",
            "facts": [
                {
                    "name": "Environment",
                    "value": "Production"
                },
                {
                    "name": "Release Tag",
                    "value": "{{ RELEASE_TAG }}"
                },
                {
                    "name": "Deploy Lead",
                    "value": "{{ DEPLOY_LEAD }}"
                },
                {
                    "name": "Start Time",
                    "value": "{{ START_TIME }}"
                },
                {
                    "name": "Expected Duration",
                    "value": "{{ EXPECTED_DURATION }}"
                }
            ],
            "markdown": true
        }
    ],
    "potentialAction": [
        {
            "@type": "OpenUri",
            "name": "View Deployment Dashboard",
            "targets": [
                {
                    "os": "default",
                    "uri": "{{ DEPLOYMENT_DASHBOARD_URL }}"
                }
            ]
        },
        {
            "@type": "OpenUri", 
            "name": "Monitor Health",
            "targets": [
                {
                    "os": "default",
                    "uri": "{{ HEALTH_DASHBOARD_URL }}"
                }
            ]
        }
    ]
}
EOF
}

# Teams webhook JSON template for deployment complete
teams_deployment_complete() {
    cat << 'EOF'
{
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions", 
    "themeColor": "28a745",
    "summary": "MOBIUS dhash Deployment Complete",
    "sections": [
        {
            "activityTitle": "✅ MOBIUS dhash Deployment Complete",
            "activitySubtitle": "Production deployment of {{ RELEASE_TAG }} completed successfully",
            "facts": [
                {
                    "name": "Environment", 
                    "value": "Production"
                },
                {
                    "name": "Release Tag",
                    "value": "{{ RELEASE_TAG }}"
                },
                {
                    "name": "Completion Time",
                    "value": "{{ COMPLETION_TIME }}"
                },
                {
                    "name": "Duration",
                    "value": "{{ DEPLOY_DURATION }}"
                },
                {
                    "name": "Status",
                    "value": "✅ Successful"
                }
            ],
            "markdown": true
        },
        {
            "activityTitle": "📊 Current Metrics",
            "facts": [
                {
                    "name": "Response Time P95",
                    "value": "{{ RESPONSE_TIME_P95 }}ms"
                },
                {
                    "name": "Error Rate", 
                    "value": "{{ ERROR_RATE }}%"
                },
                {
                    "name": "CPU Usage",
                    "value": "{{ CPU_USAGE }}%"
                },
                {
                    "name": "Memory Usage",
                    "value": "{{ MEMORY_USAGE }}%"
                }
            ]
        }
    ],
    "potentialAction": [
        {
            "@type": "OpenUri",
            "name": "View Monitoring Dashboard",
            "targets": [
                {
                    "os": "default", 
                    "uri": "{{ MONITORING_DASHBOARD_URL }}"
                }
            ]
        }
    ]
}
EOF
}

# Teams webhook JSON template for rollback
teams_rollback_initiated() {
    cat << 'EOF'
{
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "themeColor": "d73a49", 
    "summary": "URGENT: MOBIUS dhash Rollback Initiated",
    "sections": [
        {
            "activityTitle": "🚨 EMERGENCY ROLLBACK INITIATED",
            "activitySubtitle": "Production rollback in progress for {{ RELEASE_TAG }}",
            "facts": [
                {
                    "name": "Environment",
                    "value": "Production"
                },
                {
                    "name": "Trigger Reason", 
                    "value": "{{ ROLLBACK_REASON }}"
                },
                {
                    "name": "Initiated Time",
                    "value": "{{ ROLLBACK_START_TIME }}"
                },
                {
                    "name": "Expected Duration",
                    "value": "{{ ROLLBACK_DURATION }}"
                },
                {
                    "name": "Operator",
                    "value": "{{ DEPLOY_LEAD }}"
                }
            ],
            "markdown": true
        }
    ],
    "potentialAction": [
        {
            "@type": "OpenUri",
            "name": "Join War Room",
            "targets": [
                {
                    "os": "default",
                    "uri": "{{ WAR_ROOM_URL }}"
                }
            ]
        },
        {
            "@type": "OpenUri",
            "name": "View Incident",
            "targets": [
                {
                    "os": "default",
                    "uri": "{{ INCIDENT_URL }}"
                }
            ]
        }
    ]
}
EOF
}

# =============================================================================
# USAGE FUNCTIONS
# =============================================================================

show_usage() {
    cat << 'EOF'
MOBIUS dhash Notification Templates

Usage: source notification_templates.sh

Available Functions:
  slack_pre_deployment     - T-30 pre-deployment notification
  slack_deployment_starting - T-15 deployment starting soon  
  slack_deployment_started  - T+0 deployment started
  slack_deployment_complete - T+15 deployment complete
  slack_monitoring_update   - T+30 monitoring update
  slack_monitoring_complete - T+60 monitoring complete
  slack_rollback_initiated  - Emergency rollback notification
  
  teams_deployment_started  - Teams webhook for deployment started
  teams_deployment_complete - Teams webhook for deployment complete  
  teams_rollback_initiated  - Teams webhook for rollback

Example Usage:
  # Generate Slack notification
  slack_deployment_started | sed "s/{{ RELEASE_TAG }}/v1.2.3/g"
  
  # Send to Slack webhook
  curl -X POST -H 'Content-type: application/json' \
    --data "$(slack_deployment_started)" \
    "$SLACK_WEBHOOK_URL"
    
  # Send to Teams webhook  
  curl -X POST -H 'Content-type: application/json' \
    --data "$(teams_deployment_started)" \
    "$TEAMS_WEBHOOK_URL"

Variable Substitution:
  Use sed, envsubst, or template engines to replace {{ VARIABLE }} placeholders
  
  Example with envsubst:
  export RELEASE_TAG="v1.2.3"
  slack_deployment_started | envsubst
EOF
}

# Show usage if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    show_usage
fi