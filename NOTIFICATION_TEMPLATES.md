# MOBIUS dhash Notification Templates

This document contains ready-to-use notification templates for MOBIUS dhash deployment communications across Slack, email, and other channels.

## Deployment Communication Templates

### Deployment Start {#deployment-start}

#### Slack Message
```
🚀 **DEPLOYMENT STARTING**

**Environment:** Production  
**Release:** {{ RELEASE_TAG }}  
**Deploy Lead:** {{ @DEPLOY_LEAD }}  
**Start Time:** {{ TIMESTAMP }}  
**Expected Duration:** 15-20 minutes  
**Monitoring Period:** 60 minutes post-deploy  

**Artifacts:**
- Deploy log: `logs/deploy-production-{{ DATE }}.log`
- Backup: `backups/dhash-production-backup-{{ TIMESTAMP }}.zip`

**Next Updates:**  
✅ Deployment complete (~T+15min)  
📊 Monitoring summary (~T+60min)

cc: @here
```

#### Email Template
```
Subject: [DEPLOYMENT] MOBIUS dhash Production Deployment Starting - {{ RELEASE_TAG }}

Team,

A production deployment is starting for the MOBIUS dhash system.

DEPLOYMENT DETAILS:
- Environment: Production
- Release Tag: {{ RELEASE_TAG }}
- Deploy Lead: {{ DEPLOY_LEAD_EMAIL }}
- Start Time: {{ TIMESTAMP }}
- Expected Duration: 15-20 minutes

MONITORING:
- Active monitoring for 60 minutes post-deployment
- Quality gates as per quality-gates-config.json
- Automatic rollback on critical failures

ARTIFACTS:
- Deployment log: logs/deploy-production-{{ DATE }}.log
- System backup: backups/dhash-production-backup-{{ TIMESTAMP }}.zip
- Monitor logs: monitor_logs/monitor-production-{{ TIMESTAMP }}.log

COMMUNICATION:
- Slack: #deployments channel for updates
- Emergency: {{ DEPLOY_LEAD_PHONE }}

You will receive updates at deployment completion and monitoring summary.

Best regards,
MOBIUS Ops Team
```

#### Teams Message
```json
{
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions",
  "themeColor": "0076D7",
  "summary": "MOBIUS dhash Deployment Starting",
  "sections": [{
    "activityTitle": "🚀 MOBIUS dhash Deployment Starting",
    "activitySubtitle": "Release {{ RELEASE_TAG }} to Production",
    "facts": [{
      "name": "Environment",
      "value": "Production"
    }, {
      "name": "Release Tag", 
      "value": "{{ RELEASE_TAG }}"
    }, {
      "name": "Deploy Lead",
      "value": "{{ DEPLOY_LEAD }}"
    }, {
      "name": "Start Time",
      "value": "{{ TIMESTAMP }}"
    }, {
      "name": "Expected Duration",
      "value": "15-20 minutes"
    }],
    "markdown": true
  }],
  "potentialAction": [{
    "@type": "OpenUri",
    "name": "View Deployment Dashboard",
    "targets": [{
      "os": "default",
      "uri": "https://dashboard.mobius.example.com/deployments"
    }]
  }]
}
```

### Deployment Complete {#deployment-complete}

#### Slack Message
```
✅ **DEPLOYMENT COMPLETE**

**Environment:** Production  
**Release:** {{ RELEASE_TAG }}  
**Deploy Lead:** {{ @DEPLOY_LEAD }}  
**Completion Time:** {{ TIMESTAMP }}  
**Duration:** {{ DEPLOY_DURATION }}  
**Status:** Successful ✅

**Post-Deploy Status:**
✅ Application started successfully  
✅ Health checks passing  
✅ Initial smoke tests passed  
📊 Monitoring active (60 minutes remaining)  

**Key Metrics:**
- Response Time P95: {{ RESPONSE_TIME_P95 }}ms
- Error Rate: {{ ERROR_RATE }}%
- CPU Usage: {{ CPU_USAGE }}%
- Memory Usage: {{ MEMORY_USAGE }}%

**Artifacts:**
- Deployment log: `logs/deploy-production-{{ DATE }}.log`
- Monitor log: `monitor_logs/monitor-production-{{ TIMESTAMP }}.log`

**Next Steps:**
📊 Continue monitoring for {{ REMAINING_MONITOR_TIME }} minutes  
📈 Full monitoring summary at {{ MONITORING_END_TIME }}

Great job team! 🎉
```

#### Email Template
```
Subject: [SUCCESS] MOBIUS dhash Production Deployment Complete - {{ RELEASE_TAG }}

Team,

The MOBIUS dhash production deployment has completed successfully.

DEPLOYMENT SUMMARY:
- Environment: Production
- Release Tag: {{ RELEASE_TAG }}
- Deploy Lead: {{ DEPLOY_LEAD_EMAIL }}
- Completion Time: {{ TIMESTAMP }}
- Total Duration: {{ DEPLOY_DURATION }}
- Status: ✅ SUCCESSFUL

POST-DEPLOYMENT STATUS:
✅ Application startup: Successful
✅ Health endpoint: Responding (200 OK)
✅ Database connectivity: Verified
✅ External integrations: Functional
✅ Initial smoke tests: All passed

CURRENT METRICS:
- Response Time P95: {{ RESPONSE_TIME_P95 }}ms (threshold: 2000ms)
- Error Rate: {{ ERROR_RATE }}% (threshold: 5%)
- CPU Usage: {{ CPU_USAGE }}% (threshold: 80%)
- Memory Usage: {{ MEMORY_USAGE }}% (threshold: 90%)

MONITORING:
- Active monitoring continues for {{ REMAINING_MONITOR_TIME }} minutes
- Quality gates being monitored per quality-gates-config.json
- Full monitoring summary will be sent at {{ MONITORING_END_TIME }}

ARTIFACTS:
- Deployment log: logs/deploy-production-{{ DATE }}.log
- Monitoring log: monitor_logs/monitor-production-{{ TIMESTAMP }}.log
- System backup: backups/dhash-production-backup-{{ TIMESTAMP }}.zip

Thank you for your support during this deployment.

Best regards,
MOBIUS Ops Team
```

### Deployment Failed {#deployment-failed}

#### Slack Message
```
❌ **DEPLOYMENT FAILED**

**Environment:** Production  
**Release:** {{ RELEASE_TAG }}  
**Deploy Lead:** {{ @DEPLOY_LEAD }}  
**Failure Time:** {{ TIMESTAMP }}  
**Duration:** {{ DEPLOY_DURATION }}  
**Status:** Failed ❌

**Failure Details:**
**Error:** {{ ERROR_MESSAGE }}  
**Stage:** {{ FAILED_STAGE }}  
**Exit Code:** {{ EXIT_CODE }}

**Current Status:**
🔄 Automatic rollback initiated  
💾 Backup available: `{{ BACKUP_FILE }}`  
📋 Investigating failure cause  

**Immediate Actions:**
1. ✅ Rollback to previous version initiated
2. 🔍 Failure analysis in progress  
3. 📞 Engineering team notified
4. 📊 System monitoring active

**Impact:**
- Service Status: {{ SERVICE_STATUS }}
- User Impact: {{ USER_IMPACT }}
- Expected Resolution: {{ RESOLUTION_ETA }}

**Artifacts:**
- Failure log: `logs/deploy-production-{{ DATE }}.log`
- Error details: `logs/error-{{ TIMESTAMP }}.log`

@channel - Engineering team investigating
```

#### Email Template  
```
Subject: [URGENT] MOBIUS dhash Production Deployment Failed - {{ RELEASE_TAG }}

Team,

The MOBIUS dhash production deployment has failed and rollback procedures have been initiated.

FAILURE SUMMARY:
- Environment: Production
- Release Tag: {{ RELEASE_TAG }}
- Deploy Lead: {{ DEPLOY_LEAD_EMAIL }}
- Failure Time: {{ TIMESTAMP }}
- Failure Duration: {{ DEPLOY_DURATION }}
- Status: ❌ FAILED

FAILURE DETAILS:
- Error Message: {{ ERROR_MESSAGE }}
- Failed Stage: {{ FAILED_STAGE }}
- Exit Code: {{ EXIT_CODE }}
- Log Location: logs/deploy-production-{{ DATE }}.log

IMMEDIATE RESPONSE:
✅ Automatic rollback initiated
✅ Previous version being restored
✅ Engineering team notified
✅ System monitoring intensified
✅ Incident response team activated

CURRENT IMPACT:
- Service Status: {{ SERVICE_STATUS }}
- User Impact: {{ USER_IMPACT }}
- Expected Resolution: {{ RESOLUTION_ETA }}

ROLLBACK STATUS:
- Backup Used: {{ BACKUP_FILE }}
- Rollback ETA: {{ ROLLBACK_ETA }}
- Service Restoration ETA: {{ SERVICE_RESTORE_ETA }}

NEXT STEPS:
1. Complete rollback to previous stable version
2. Restore full service functionality
3. Conduct failure analysis
4. Implement fix for failed deployment
5. Reschedule deployment with fixes

COMMUNICATION:
- Real-time updates: Slack #incidents channel
- Engineering lead: {{ ENG_LEAD_EMAIL }}
- Emergency contact: {{ EMERGENCY_PHONE }}

We apologize for any service disruption and are working to restore normal operations as quickly as possible.

Best regards,
MOBIUS Incident Response Team
```

### Rollback Initiated {#rollback-initiated}

#### Slack Message
```
🔄 **ROLLBACK INITIATED**

**Environment:** Production  
**Trigger:** {{ ROLLBACK_TRIGGER }}  
**Operator:** {{ @DEPLOY_LEAD }}  
**Start Time:** {{ TIMESTAMP }}  
**Expected Duration:** 5-10 minutes  

**Rollback Details:**
📦 Backup: `{{ BACKUP_FILE }}`  
🔐 Integrity: {{ BACKUP_INTEGRITY_STATUS }}  
⏰ Created: {{ BACKUP_CREATION_TIME }}  
📋 Method: {{ ROLLBACK_METHOD }}

**Current Status:**
🛑 Production services stopping  
💾 Restoring from backup  
🔄 Service restart in progress  

**Reason for Rollback:**
{{ ROLLBACK_REASON }}

**Quality Gate Violations:**
{{ QUALITY_GATE_VIOLATIONS }}

**Monitoring:**
📊 Rollback monitoring active  
🏥 Health checks every 30 seconds  
⚠️ Alert thresholds increased sensitivity  

**ETA:** Service restoration in {{ RESTORATION_ETA }} minutes

@channel - All hands on deck for rollback support
```

#### Email Template
```
Subject: [URGENT] MOBIUS dhash Production Rollback Initiated

Team,

A production rollback has been initiated for the MOBIUS dhash system due to quality gate violations or service issues.

ROLLBACK DETAILS:
- Environment: Production
- Trigger: {{ ROLLBACK_TRIGGER }}
- Operator: {{ DEPLOY_LEAD_EMAIL }}
- Start Time: {{ TIMESTAMP }}
- Expected Duration: 5-10 minutes

BACKUP INFORMATION:
- Backup File: {{ BACKUP_FILE }}
- Backup Integrity: {{ BACKUP_INTEGRITY_STATUS }}
- Backup Created: {{ BACKUP_CREATION_TIME }}
- Backup Verification: SHA256 checksum verified

ROLLBACK REASON:
{{ ROLLBACK_REASON }}

QUALITY GATE VIOLATIONS:
{{ QUALITY_GATE_VIOLATIONS }}

CURRENT STATUS:
🛑 Production services: Stopping
💾 Data restoration: In progress
🔄 Service restart: Pending
🏥 Health monitoring: Active

EXPECTED TIMELINE:
- Service shutdown: Complete
- Backup restoration: {{ RESTORE_ETA }}
- Service restart: {{ RESTART_ETA }}
- Health verification: {{ VERIFICATION_ETA }}
- Full service restoration: {{ FULL_RESTORE_ETA }}

INCIDENT RESPONSE:
- Operations team: Executing rollback
- Engineering team: Investigating root cause
- Management: Notified of incident
- Customer support: Prepared for user inquiries

POST-ROLLBACK:
- Extended monitoring period (3 hours)
- Incident analysis and report
- Fix development for next deployment attempt
- Process review and improvements

We will provide updates every 10 minutes until service is fully restored.

Best regards,
MOBIUS Incident Response Team
```

## Monitoring Alert Templates

### High Error Rate Alert

#### Slack Alert
```
⚠️ **QUALITY GATE VIOLATION: High Error Rate**

**Environment:** Production  
**Metric:** Error Rate  
**Current:** {{ CURRENT_ERROR_RATE }}%  
**Threshold:** {{ ERROR_RATE_THRESHOLD }}%  
**Duration:** {{ VIOLATION_DURATION }}  

**Status:** {{ ALERT_STATUS }}  
**Severity:** {{ SEVERITY_LEVEL }}  

**Actions Required:**
1. 🔍 Investigate error patterns
2. 📊 Check dependent services  
3. 🚨 Prepare for potential rollback

**Monitoring Dashboard:** {{ DASHBOARD_URL }}

@{{ DEPLOY_LEAD }} @sre-team
```

### Performance Degradation Alert

#### Slack Alert
```
🐌 **QUALITY GATE VIOLATION: Performance Degradation**

**Environment:** Production  
**Metric:** Response Time P95  
**Current:** {{ CURRENT_P95 }}ms  
**Threshold:** {{ P95_THRESHOLD }}ms  
**Duration:** {{ VIOLATION_DURATION }}  

**Additional Metrics:**
- P99: {{ CURRENT_P99 }}ms
- Error Rate: {{ ERROR_RATE }}%
- CPU: {{ CPU_USAGE }}%
- Memory: {{ MEMORY_USAGE }}%

**Actions Required:**
1. 🔍 Check system resources
2. 📊 Analyze performance trends
3. ⚠️ Consider scaling or rollback

@{{ DEPLOY_LEAD }} @performance-team
```

### Service Health Alert

#### Slack Alert  
```
🚨 **CRITICAL: Service Health Check Failed**

**Environment:** Production  
**Check:** {{ HEALTH_CHECK_NAME }}  
**Status:** {{ HEALTH_STATUS }}  
**Failures:** {{ CONSECUTIVE_FAILURES }}/{{ MAX_FAILURES }}  
**Last Success:** {{ LAST_SUCCESS_TIME }}  

**Response Required:** IMMEDIATE  
**Auto-Rollback:** {{ AUTO_ROLLBACK_STATUS }}  

**Emergency Contacts:**
- Deploy Lead: @{{ DEPLOY_LEAD }}
- SRE On-call: @sre-oncall  
- Engineering: @eng-oncall

**Runbook:** {{ RUNBOOK_URL }}

@channel
```

## Scheduled Maintenance Templates

### Maintenance Window Announcement

#### Slack Message
```
🔧 **SCHEDULED MAINTENANCE WINDOW**

**Date:** {{ MAINTENANCE_DATE }}  
**Time:** {{ MAINTENANCE_TIME }} ({{ TIMEZONE }})  
**Duration:** {{ EXPECTED_DURATION }}  
**Impact:** {{ IMPACT_DESCRIPTION }}

**Maintenance Tasks:**
{{ MAINTENANCE_TASKS }}

**Preparation:**
- [ ] Change request approved: {{ CHANGE_REQUEST_ID }}
- [ ] Rollback plan reviewed and tested
- [ ] Team assignments confirmed
- [ ] Communication plan activated

**Team Assignments:**
- Lead: {{ MAINTENANCE_LEAD }}
- Ops: {{ OPS_TEAM }}
- Engineering: {{ ENG_TEAM }}
- Communications: {{ COMMS_LEAD }}

**Communication Schedule:**
- T-24h: Final reminder and confirmation
- T-1h: Maintenance starting soon
- T+0: Maintenance started  
- T+30min: Progress update
- Complete: Maintenance completed

Users will be notified via status page and email.
```

### Maintenance Complete

#### Slack Message
```
✅ **MAINTENANCE COMPLETE**

**Completed:** {{ COMPLETION_TIME }}  
**Duration:** {{ ACTUAL_DURATION }}  
**Status:** {{ MAINTENANCE_STATUS }}

**Tasks Completed:**
{{ COMPLETED_TASKS }}

**Post-Maintenance Verification:**
✅ All services online  
✅ Health checks passing  
✅ Performance within normal range  
✅ User functionality verified

**Monitoring:**
Extended monitoring active for {{ EXTENDED_MONITOR_DURATION }}

Thank you for your patience during the maintenance window.
```

## Template Variable Reference

### Standard Variables
- `{{ RELEASE_TAG }}` - Release version (e.g., v1.2.3)
- `{{ @DEPLOY_LEAD }}` - Slack handle of deploy operator
- `{{ DEPLOY_LEAD_EMAIL }}` - Email of deploy operator
- `{{ TIMESTAMP }}` - Current timestamp in ISO 8601 format
- `{{ DATE }}` - Current date in YYYY-MM-DD format
- `{{ ENVIRONMENT }}` - Target environment (staging/production)

### Deployment Variables
- `{{ DEPLOY_DURATION }}` - Time taken for deployment
- `{{ BACKUP_FILE }}` - Path to backup file
- `{{ EXIT_CODE }}` - Script exit code
- `{{ ERROR_MESSAGE }}` - Error message from failed deployment
- `{{ FAILED_STAGE }}` - Stage where deployment failed

### Monitoring Variables  
- `{{ RESPONSE_TIME_P95 }}` - 95th percentile response time
- `{{ RESPONSE_TIME_P99 }}` - 99th percentile response time  
- `{{ ERROR_RATE }}` - Current error rate percentage
- `{{ CPU_USAGE }}` - Current CPU usage percentage
- `{{ MEMORY_USAGE }}` - Current memory usage percentage

### Alert Variables
- `{{ ALERT_STATUS }}` - Current alert status
- `{{ SEVERITY_LEVEL }}` - Alert severity (warning/critical)
- `{{ VIOLATION_DURATION }}` - How long threshold has been exceeded
- `{{ THRESHOLD }}` - The configured threshold value

## Usage Instructions

### Slack Notifications
1. Copy the appropriate template
2. Replace `{{ VARIABLE }}` placeholders with actual values
3. Post to relevant channel (#deployments, #alerts, #incidents)
4. Use @channel sparingly (critical alerts only)

### Email Notifications
1. Use templates as base for email composition
2. Update subject line with appropriate priority indicators
3. Include all relevant stakeholders in recipients
4. Attach logs and artifacts when appropriate

### Teams Notifications  
1. Use JSON templates for webhook integrations
2. Test webhook formatting before production use
3. Include action buttons for relevant dashboards
4. Customize theme colors by severity (blue=info, yellow=warning, red=critical)

### Automation Integration
Templates can be integrated with deployment scripts using:
- Environment variable substitution
- Template engines (Jinja2, Mustache, etc.)
- CI/CD webhook integrations
- Custom notification scripts

## Customization Guidelines

1. **Maintain Consistency:** Use standard format across all notifications
2. **Include Context:** Always provide environment, time, and operator info
3. **Actionable Information:** Include next steps and contact information
4. **Appropriate Urgency:** Match notification urgency to actual severity
5. **Clear Status:** Use clear success/failure indicators and status updates

---

**Document Version:** 1.0  
**Last Updated:** 2024-01-01  
**Template Format:** Slack/Email/Teams compatible  
**Variable Format:** `{{ VARIABLE_NAME }}`