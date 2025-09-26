# Email Notification Templates

## Deployment Started

**Subject**: [MOBIUS] Deployment Started - {{environment}}

```
MOBIUS Deployment Started
=========================

Environment: {{environment}}
Deploy Operator: {{deploy_operator}}
Git Commit: {{git_commit}}
Git Branch: {{git_branch}}
Started At: {{timestamp}}

Deployment artifacts will be available at:
{{artifacts_url}}

Estimated completion time: 30-45 minutes

You will receive another notification when the deployment completes.

---
MOBIUS Deployment Framework
```

## Deployment Success

**Subject**: [MOBIUS] ✅ Deployment Successful - {{environment}}

```
MOBIUS Deployment Successful
============================

Environment: {{environment}}
Deploy Operator: {{deploy_operator}}
Duration: {{duration}}
Git Commit: {{git_commit}}
Git Branch: {{git_branch}}
Completed At: {{timestamp}}

The deployment has completed successfully and all health checks are passing.

System Status:
- Health checks: ✅ Passing
- Performance: ✅ Within normal range
- Error rates: ✅ Below threshold
- Monitoring: ✅ Active (60 minutes)

Artifacts and logs available at:
{{artifacts_url}}

Next scheduled maintenance: [Add next maintenance window]

---
MOBIUS Deployment Framework
```

## Deployment Failed

**Subject**: [MOBIUS] ❌ Deployment Failed - {{environment}}

```
MOBIUS Deployment Failed
========================

Environment: {{environment}}
Deploy Operator: {{deploy_operator}}
Duration: {{duration}}
Git Commit: {{git_commit}}
Failed At: {{timestamp}}

Error Details:
{{error_message}}

Action Required:
1. Review failure logs at: {{artifacts_url}}
2. Investigate root cause
3. Fix identified issues
4. Re-run pre-merge validation
5. Consider rollback if system is unstable

Failure logs and artifacts available at:
{{artifacts_url}}

Escalation contacts:
- SRE On-call: @sre-oncall
- Engineering Lead: @eng-lead

---
MOBIUS Deployment Framework
```

## Rollback Initiated

**Subject**: [MOBIUS] 🚨 URGENT: Rollback Initiated - {{environment}}

```
MOBIUS ROLLBACK INITIATED
=========================

URGENT: System rollback has been initiated

Environment: {{environment}}
Rollback Operator: {{deploy_operator}}
Backup Used: {{backup_file}}
Reason: {{rollback_reason}}
Initiated At: {{timestamp}}

Current Status: Rollback in progress

Expected Resolution Time: 15-30 minutes

Do NOT attempt any manual interventions unless specifically requested by the operations team.

You will receive another notification when the rollback completes.

Escalation contacts:
- Deploy Operator: {{deploy_operator}}
- SRE On-call: @sre-oncall

---
MOBIUS Deployment Framework
```

## Rollback Complete

**Subject**: [MOBIUS] ✅ Rollback Complete - {{environment}}

```
MOBIUS Rollback Complete
========================

System rollback has been completed successfully.

Environment: {{environment}}
Duration: {{duration}}
Backup Used: {{backup_file}}
System Status: {{system_status}}
Health Checks: {{health_check_status}}
Completed At: {{timestamp}}

The system has been restored to a stable state and is operational.

Post-Rollback Status:
- System health: ✅ Stable
- Core functionality: ✅ Restored
- Performance: ✅ Normal
- Error rates: ✅ Baseline

Actions Completed:
1. ✅ System restored from verified backup
2. ✅ Health checks passing (3 consecutive)
3. ✅ Smoke tests successful
4. ✅ Monitoring active and stable

Next Steps:
1. Root cause analysis will be conducted
2. Incident report will be generated
3. Process improvements will be identified
4. Updated deployment scheduled after fixes

Incident tracking: [Add incident ticket if applicable]

---
MOBIUS Deployment Framework
```

## Monitoring Alert

**Subject**: [MOBIUS] ⚠️ Monitoring Alert - {{environment}}

```
MOBIUS Monitoring Alert
=======================

Alert Type: {{alert_type}}
Environment: {{environment}}
Alert Time: {{timestamp}}

Threshold Breached:
{{threshold_details}}

Current Metrics:
{{current_metrics}}

Auto-rollback Status: {{auto_rollback_status}}

Action Required:
1. Investigate the alert condition immediately
2. Check system logs and performance metrics
3. Consider manual intervention if needed
4. Monitor for automatic rollback triggers

If auto-rollback is enabled, the system will automatically rollback if:
- 3 consecutive health check failures occur
- Success rate drops below 70%
- Error rate exceeds 5%
- Latency consistently exceeds 5000ms

Monitoring dashboard: {{monitoring_url}}

Contact immediately if manual intervention needed:
- SRE On-call: @sre-oncall
- Deploy Operator: {{deploy_operator}}

---
MOBIUS Deployment Framework
```

## Pre-deployment Notification

**Subject**: [MOBIUS] Scheduled Deployment - {{environment}} - {{scheduled_time}}

```
MOBIUS Scheduled Deployment
===========================

This is a notification of a scheduled deployment for MOBIUS.

Environment: {{environment}}
Scheduled Time: {{scheduled_time}}
Estimated Duration: {{estimated_duration}}
Deploy Operator: {{deploy_operator}}
Git Branch: {{git_branch}}
Git Commit: {{git_commit}}

Pre-deployment Checklist Completed:
✅ All pre-merge validation checks passed
✅ Required approvals obtained (≥2 reviewers, ≥1 Ops/SRE)
✅ Deploy operator sign-off received
✅ Backup files verified
✅ Maintenance window scheduled

Expected Impact:
- Service availability: {{expected_availability}}
- User impact: {{user_impact_description}}
- Rollback plan: Automated rollback available if issues detected

You will receive notifications at:
- Deployment start
- Deployment completion or failure
- Any rollback events

If you have concerns about this deployment, contact:
- Deploy Operator: {{deploy_operator}}
- Engineering Lead: @eng-lead

---
MOBIUS Deployment Framework
```

## Usage Instructions

### Variable Replacement

Replace template variables before sending:
- `{{environment}}` - staging/production
- `{{deploy_operator}}` - Person executing deployment
- `{{timestamp}}` - Current timestamp
- `{{git_commit}}` - Git commit hash
- `{{git_branch}}` - Git branch name
- `{{duration}}` - Deployment/rollback duration
- `{{artifacts_url}}` - Link to artifacts
- `{{error_message}}` - Error details (for failures)
- `{{backup_file}}` - Backup filename used
- `{{rollback_reason}}` - Reason for rollback
- `{{system_status}}` - Current system status
- `{{health_check_status}}` - Health check results

### Recipient Lists

**Deployment Events:**
- Engineering team
- Operations team
- Product team
- Stakeholders

**Rollback/Alert Events:**
- Engineering team (immediate)
- Operations team (immediate)
- Management (within 15 minutes)
- Stakeholders (within 30 minutes)