# Email Notification Templates

## Deployment Started
**Subject:** dhash Deployment Started - {{environment}}

**Body:**
```
🚀 dhash Deployment Started

Environment: {{environment}}
Operator: {{operator}}
Deployment ID: {{deployment_id}}
Timestamp: {{timestamp}}

The dhash service is being deployed to {{environment}}. Monitoring will begin automatically after deployment completion.

---
dhash Deployment System
```

## Quality Gate Alert
**Subject:** ⚠️ dhash Quality Gate Violation - {{environment}}

**Body:**
```
⚠️ dhash Quality Gate Violation

Environment: {{environment}}
Gate: {{gate_name}}
Threshold: {{threshold}}
Actual Value: {{actual_value}}
Timestamp: {{timestamp}}

Details: {{message}}

Action Required: Monitor the situation. Auto-rollback will trigger if conditions persist.

Monitoring Dashboard: {{monitoring_url}}
Logs: {{logs_url}}

---
dhash Monitoring System
```

## Auto-rollback Triggered
**Subject:** 🚨 CRITICAL: dhash Auto-rollback Triggered - {{environment}}

**Body:**
```
🚨 CRITICAL ALERT: dhash Auto-rollback Triggered

Environment: {{environment}}
Reason: {{reason}}
Backup File: {{backup_file}}
Deployment ID: {{deployment_id}}
Timestamp: {{timestamp}}

An automatic rollback has been initiated due to quality gate failure.

IMMEDIATE ACTION REQUIRED:
1. Verify rollback completion
2. Investigate root cause
3. Create incident report

Rollback Status: {{rollback_status}}
Logs: {{logs_url}}
Incident Creation: {{incident_url}}

---
dhash Auto-rollback System
```

## Deployment Success  
**Subject:** ✅ dhash Deployment Successful - {{environment}}

**Body:**
```
✅ dhash Deployment Successful

Environment: {{environment}}
Duration: {{duration}}
Completed: {{timestamp}}

All quality gates passed during the monitoring period. Deployment is considered successful.

Summary:
- Health checks: Passed
- Performance gates: Passed
- Error rates: Within thresholds
- Queue metrics: Normal

No further action required.

---
dhash Deployment System
```

## Monitoring Started
**Subject:** 👁️ dhash Monitoring Started - {{environment}}

**Body:**
```
👁️ dhash Monitoring Started

Environment: {{environment}}
Window: {{monitoring_minutes}} minutes
Active Gates: {{active_gates_count}}
Timestamp: {{timestamp}}

Post-deployment monitoring has begun. The system will automatically evaluate quality gates and trigger rollback if thresholds are exceeded.

Quality Gates:
{{#each quality_gates}}
- {{name}}: {{threshold}} ({{status}})
{{/each}}

Monitoring will complete at: {{end_time}}

Dashboard: {{monitoring_url}}
Logs: {{logs_url}}

---
dhash Monitoring System
```

## Rollback Success
**Subject:** ✅ dhash Rollback Completed - {{environment}}

**Body:**
```
✅ dhash Rollback Completed Successfully

Environment: {{environment}}
Backup Used: {{backup_file}}
Duration: {{rollback_duration}}
Completed: {{timestamp}}

The automatic rollback has completed successfully. Service has been restored to previous working state.

Post-rollback validation:
- Health checks: {{health_status}}
- Smoke tests: {{smoke_test_status}}
- Service availability: {{availability_status}}

Next Steps:
1. Monitor service stability
2. Investigate deployment failure cause
3. Update deployment plans if needed

Service is now stable and operating normally.

---
dhash Rollback System
```

## Rollback Failure
**Subject:** 🚨 URGENT: dhash Rollback FAILED - {{environment}}

**Body:**
```
🚨 URGENT: dhash Rollback FAILED

Environment: {{environment}}
Backup Attempted: {{backup_file}}
Error: {{error_message}}
Timestamp: {{timestamp}}

CRITICAL: Automatic rollback has FAILED. Manual intervention is immediately required.

IMMEDIATE ACTIONS REQUIRED:
1. Check service status manually
2. Attempt manual rollback if possible
3. Escalate to senior operations team
4. Create critical incident
5. Consider service degradation announcement

Current Status: {{service_status}}
Error Details: {{error_details}}

Emergency Contacts:
- On-call Engineer: {{oncall_contact}}
- Operations Lead: {{ops_lead_contact}}
- Escalation: {{escalation_contact}}

Manual Rollback Command:
{{manual_rollback_command}}

---
dhash Emergency Response System
```