# Notification Templates - MOBIUS dhash Production

## Pre-deployment Announcement

### Slack/Teams Template
```
🚀 **MOBIUS dhash Production Deployment - [RELEASE_TAG]**

**Deploy Window**: [DATE] [TIME] UTC
**Deploy Lead**: @DEPLOY_LEAD
**Duration**: ~30 minutes

**What's Changing:**
- dhash functionality updates
- Quality improvements for video processing
- [Add specific changes from release notes]

**Pre-deployment Checklist:**
✅ CI passed on all platforms (Ubuntu/macOS/Windows)
✅ Premerge validation completed
✅ Backups verified and ready
✅ Quality gates passed (SSIM ≥0.995, audio compliance)
✅ Required approvals received (2+ including Ops/SRE)

**Rollback Plan**: Ready with latest backup `[BACKUP_FILE]`
**Monitor Window**: 60 minutes post-deployment

Please avoid heavy system usage during the deployment window.
Questions? Contact @DEPLOY_LEAD or @ops-oncall
```

### Email Template (Stakeholders)
```
Subject: [PRODUCTION] MOBIUS dhash Deployment - [RELEASE_TAG] - [DATE]

Hi Team,

We're deploying MOBIUS dhash [RELEASE_TAG] to production:

**Schedule:**
- Start: [DATE] [TIME] UTC
- Duration: ~30 minutes
- Lead: [DEPLOY_LEAD_NAME] ([DEPLOY_LEAD_EMAIL])

**Key Changes:**
- [List major features/fixes]
- Quality improvements for video processing pipeline
- Enhanced monitoring and rollback capabilities

**Validation Completed:**
✓ Multi-platform CI validation
✓ Quality gate compliance (SSIM, audio metrics)
✓ Backup integrity verification
✓ Required approvals from Ops/SRE team

**Rollback Strategy:**
Ready with automated rollback to latest stable backup
Expected rollback time: <10 minutes if needed

**Post-deployment:**
- 60-minute monitoring window
- Smoke tests will run automatically
- Performance metrics will be monitored

We'll send updates during the deployment. Contact [DEPLOY_LEAD_EMAIL] with questions.

Best,
MOBIUS Ops Team
```

## During Deployment Updates

### Progress Update Template
```
🔄 **MOBIUS dhash Deployment Progress - [TIMESTAMP]**

Status: [IN_PROGRESS/COMPLETED/ROLLBACK]
Progress: [X/Y] steps completed

**Current Step**: [STEP_DESCRIPTION]
**ETA**: [ESTIMATED_COMPLETION_TIME]

Latest metrics:
- Quality gates: ✅ Passing
- System health: ✅ Normal
- Error rate: [X.XX%]

Next update in 15 minutes or at completion.
```

### Issue Alert Template
```
⚠️ **MOBIUS dhash Deployment Alert - [TIMESTAMP]**

**Issue**: [BRIEF_DESCRIPTION]
**Severity**: [LOW/MEDIUM/HIGH/CRITICAL]
**Deploy Lead**: @DEPLOY_LEAD

**Current Status**: [INVESTIGATING/FIXING/ROLLING_BACK]
**Impact**: [DESCRIPTION_OF_IMPACT]

**Actions Taken**:
- [Action 1]
- [Action 2]
- [Action N]

**Next Steps**: [PLAN_DESCRIPTION]
**ETA**: [ESTIMATED_RESOLUTION_TIME]

Will update in 10 minutes or when resolved.
```

## Post-deployment Communication

### Success Notification
```
✅ **MOBIUS dhash Deployment Complete - [RELEASE_TAG]**

**Completed**: [TIMESTAMP] UTC
**Duration**: [ACTUAL_DURATION] minutes
**Deploy Lead**: @DEPLOY_LEAD

**Validation Results:**
✅ All quality gates passed
✅ Smoke tests successful  
✅ Performance metrics within normal range
✅ No errors detected in logs

**Post-deployment Monitoring:**
- 60-minute watch window active
- Automated monitoring in progress
- Performance dashboards updated

**What's New:**
- [Key features/improvements deployed]

System is stable and ready for normal operations.
Thanks for your patience during the deployment!
```

### Rollback Notification
```
🔄 **MOBIUS dhash Rollback Complete - [TIMESTAMP]**

**Trigger**: [REASON_FOR_ROLLBACK]
**Rollback Duration**: [DURATION] minutes
**Current Version**: [STABLE_VERSION] (rolled back from [FAILED_VERSION])

**System Status**:
✅ Rollback successful
✅ Services operational
✅ Quality gates passing
✅ Performance metrics normal

**Root Cause Analysis**: 
Investigation in progress. Updates will be shared in #ops-incidents

**Next Steps**:
- Monitoring extended for 2 hours
- RCA document to be published within 24h
- Re-deployment plan to be determined

All systems operational. No action required from users.
```

## Monitoring Window Updates

### T+30 Status
```
📊 **MOBIUS dhash T+30 Status - [TIMESTAMP]**

**Deployment**: [RELEASE_TAG] - 30 minutes post-deployment

**System Health**:
- API Response Time: [XXX]ms (target: <200ms)
- Error Rate: [X.XX]% (target: <0.1%)
- Quality Gates: ✅ All passing
- Resource Usage: [XX]% CPU, [XX]% Memory

**Metrics Trending**: ✅ Normal/Stable
**User Impact**: ✅ None detected

Continuing monitoring. Next update at T+60.
```

### Final Monitoring Report  
```
📈 **MOBIUS dhash Monitoring Complete - [RELEASE_TAG]**

**Monitoring Period**: 60 minutes post-deployment
**Final Status**: ✅ STABLE

**Final Metrics**:
- Average Response Time: [XXX]ms
- Total Error Rate: [X.XX]%
- Quality Gate Success Rate: [XX.X]%
- Resource Utilization: Normal

**Incident Count**: 0
**User Reports**: 0
**Performance**: Meeting all targets

✅ **Deployment officially marked as successful**

Monitoring returns to normal operations.
Great work team! 🎉
```

## Emergency Escalation Template

```
🚨 **URGENT: MOBIUS dhash Production Issue - [TIMESTAMP]**

**Severity**: CRITICAL
**Issue**: [CRITICAL_ISSUE_DESCRIPTION]
**System Impact**: [IMPACT_DESCRIPTION]

**Immediate Actions Required**:
@ops-oncall - Please respond immediately
@DEPLOY_LEAD - Deploy lead needed
@media-eng - Technical expertise required

**Current Status**: [STATUS]
**Rollback Available**: YES/NO
**ETA for Resolution**: [TIME_ESTIMATE]

**War Room**: [MEETING_LINK or LOCATION]
**Incident ID**: [INCIDENT_NUMBER]

This is a high-priority production issue requiring immediate attention.
```

## Template Placeholders Reference

Replace these placeholders before sending:

- `[RELEASE_TAG]` → Actual release version (e.g., v2.1.0)
- `[DATE]` → Deployment date (e.g., 2024-01-15)
- `[TIME]` → Deployment time (e.g., 14:00)
- `@DEPLOY_LEAD` → Actual deploy lead username
- `[DEPLOY_LEAD_NAME]` → Deploy lead full name
- `[DEPLOY_LEAD_EMAIL]` → Deploy lead email
- `[TIMESTAMP]` → Current timestamp
- `[BACKUP_FILE]` → Actual backup filename
- `[XXX]` → Actual metric values

---
*Templates last updated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")*