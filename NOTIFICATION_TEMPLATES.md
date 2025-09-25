# MOBIUS Deployment Notification Templates

## Slack/Teams Deployment Messages

### T-30: Pre-deployment Notification

**Slack:**
```
🚀 **MOBIUS Deployment Starting** - T-30 minutes
Repository: `w9bikze8u4cbupc/MOBIUS`
Release: `RELEASE_TAG`
Environment: `PRODUCTION`

**Pre-flight checklist:**
✅ Dependencies installed (`npm ci`)  
🔄 Tests running (`npm test`)
🔄 Golden baselines checking
🔄 FFmpeg verification

📊 **Status Dashboard:** <GITHUB_ACTIONS_URL>
🔗 **PR:** <PR_LINK>
👤 **Deploy Lead:** <@DEPLOY_LEAD>

#mobius #deployment #pre-flight
```

**Teams:**
```
🚀 **MOBIUS Deployment Starting** - T-30 minutes

**Release Details:**
- Repository: w9bikze8u4cbupc/MOBIUS  
- Release: RELEASE_TAG
- Environment: PRODUCTION

**Pre-flight checklist:**
- ✅ Dependencies installed (npm ci)
- 🔄 Tests running (npm test)  
- 🔄 Golden baselines checking
- 🔄 FFmpeg verification

**Links:**
- [Status Dashboard](GITHUB_ACTIONS_URL)
- [Pull Request](PR_LINK)

**Deploy Lead:** @DEPLOY_LEAD
```

### T-5: Final Validation Notification

**Slack:**
```
⚡ **MOBIUS Deployment** - T-5 minutes - Final validation
Repository: `w9bikze8u4cbupc/MOBIUS`

**Validation Status:**
✅ Client build completed (`cd client && npm run build`)
✅ Render pipeline tested (`npm run render:proxy`)  
✅ Audio compliance verified
✅ Artifacts generated

**Multi-platform CI:**
🐧 Linux: PASSING
🍎 macOS: PASSING  
🪟 Windows: PASSING

**Ready for deployment** ✅
👤 **Deploy Lead:** <@DEPLOY_LEAD>

#mobius #deployment #go-live
```

**Teams:**
```
⚡ **MOBIUS Deployment** - T-5 minutes - Final validation

**Validation Status:**
- ✅ Client build completed (cd client && npm run build)
- ✅ Render pipeline tested (npm run render:proxy)
- ✅ Audio compliance verified  
- ✅ Artifacts generated

**Multi-platform CI:**
- 🐧 Linux: PASSING
- 🍎 macOS: PASSING
- 🪟 Windows: PASSING

**Status:** Ready for deployment ✅

**Deploy Lead:** @DEPLOY_LEAD
```

### T-0: Deployment Go-Live

**Slack:**
```
🎬 **MOBIUS DEPLOYMENT LIVE** - T-0
Repository: `w9bikze8u4cbupc/MOBIUS`
Release: `RELEASE_TAG`

**Deployment initiated:**
🔄 Push to main branch completed
🔄 GitHub Actions workflows triggered
🔄 Multi-platform builds running (Ubuntu, macOS, Windows)

**Monitoring:**
📊 CI Dashboard: <GITHUB_ACTIONS_URL>
📈 Artifact uploads: IN PROGRESS
🔍 Quality gates: MONITORING

**Next check:** T+15 minutes
👤 **Deploy Lead:** <@DEPLOY_LEAD>

#mobius #deployment #live
```

**Teams:**
```
🎬 **MOBIUS DEPLOYMENT LIVE** - T-0

**Deployment Details:**
- Repository: w9bikze8u4cbupc/MOBIUS
- Release: RELEASE_TAG

**Status:**
- 🔄 Push to main branch completed
- 🔄 GitHub Actions workflows triggered  
- 🔄 Multi-platform builds running (Ubuntu, macOS, Windows)

**Monitoring:**
- [CI Dashboard](GITHUB_ACTIONS_URL)
- Artifact uploads: IN PROGRESS
- Quality gates: MONITORING

**Next check:** T+15 minutes
**Deploy Lead:** @DEPLOY_LEAD
```

### T+15: Post-deployment Verification

**Slack:**
```
✅ **MOBIUS Deployment** - T+15 - Post-deploy verification
Repository: `w9bikze8u4cbupc/MOBIUS`

**Platform Status:**
🐧 Ubuntu: ✅ PASSED (artifacts uploaded)
🍎 macOS: ✅ PASSED (artifacts uploaded)  
🪟 Windows: ✅ PASSED (artifacts uploaded)

**Quality Gates:**
🎵 Audio compliance: ✅ PASSED
🎬 Video quality (SSIM ≥0.995): ✅ PASSED
🎯 Golden baseline comparison: ✅ PASSED

**Artifacts:**
📁 Preview videos: GENERATED
📊 Quality reports: AVAILABLE
🔍 JUnit test results: PASSED

👤 **Deploy Lead:** <@DEPLOY_LEAD>

#mobius #deployment #success
```

**Teams:**
```
✅ **MOBIUS Deployment** - T+15 - Post-deploy verification

**Platform Status:**
- 🐧 Ubuntu: ✅ PASSED (artifacts uploaded)
- 🍎 macOS: ✅ PASSED (artifacts uploaded)
- 🪟 Windows: ✅ PASSED (artifacts uploaded)

**Quality Gates:**
- 🎵 Audio compliance: ✅ PASSED
- 🎬 Video quality (SSIM ≥0.995): ✅ PASSED  
- 🎯 Golden baseline comparison: ✅ PASSED

**Artifacts:**
- 📁 Preview videos: GENERATED
- 📊 Quality reports: AVAILABLE
- 🔍 JUnit test results: PASSED

**Deploy Lead:** @DEPLOY_LEAD
```

### T+60: Final Status & Monitoring

**Slack:**
```
🎯 **MOBIUS Deployment Complete** - T+60 - Final status
Repository: `w9bikze8u4cbupc/MOBIUS`
Release: `RELEASE_TAG` 

**Final Status:** 🟢 **SUCCESSFUL**

**Summary:**
✅ All platforms deployed successfully
✅ Quality gates passed across all environments
✅ Artifacts retained and accessible
✅ No regression issues detected
✅ Golden baselines up to date

**Post-deployment actions:**
📈 Monitoring active for delayed failures
🔄 Baseline validation complete
📁 Artifact retention: 90 days
📊 Performance metrics: STABLE

**Deployment complete.** System ready for operations.
👤 **Deploy Lead:** <@DEPLOY_LEAD>

#mobius #deployment #complete
```

**Teams:**
```
🎯 **MOBIUS Deployment Complete** - T+60 - Final status

**Release:** RELEASE_TAG
**Final Status:** 🟢 SUCCESSFUL

**Summary:**
- ✅ All platforms deployed successfully
- ✅ Quality gates passed across all environments
- ✅ Artifacts retained and accessible
- ✅ No regression issues detected  
- ✅ Golden baselines up to date

**Post-deployment actions:**
- 📈 Monitoring active for delayed failures
- 🔄 Baseline validation complete
- 📁 Artifact retention: 90 days
- 📊 Performance metrics: STABLE

**Status:** Deployment complete. System ready for operations.

**Deploy Lead:** @DEPLOY_LEAD
```

## Error/Incident Templates

### Deployment Failure Alert

**Slack:**
```
🚨 **MOBIUS DEPLOYMENT FAILURE** 
Repository: `w9bikze8u4cbupc/MOBIUS`
Release: `RELEASE_TAG`

**Failed Stage:** `STAGE_NAME`
**Platform:** `PLATFORM` (Ubuntu/macOS/Windows)
**Error:** `ERROR_MESSAGE`

**Immediate Actions:**
1️⃣ Deployment halted
2️⃣ Rollback initiated  
3️⃣ Incident response team notified

**Investigation:**
🔍 Logs: <GITHUB_ACTIONS_LOG_URL>
📊 Artifacts: <ARTIFACT_URL>
🎯 Error Details: <ERROR_DETAILS>

**War Room:** <TEAMS_CHANNEL_OR_MEET_LINK>
🚨 **All hands:** <@ops-team>

#mobius #incident #deployment-failure
```

### Recovery Complete

**Slack:**
```
✅ **MOBIUS Recovery Complete**
Repository: `w9bikze8u4cbupc/MOBIUS`

**Recovery Status:** 🟢 **RESOLVED**

**Actions Taken:**
🔄 Rollback completed successfully
🔍 Root cause identified: `ROOT_CAUSE`
🔧 Fix applied: `FIX_DESCRIPTION`
✅ Re-deployment successful

**System Status:**
🟢 All platforms operational
🟢 Quality gates passing
🟢 Artifacts generated successfully

**Post-mortem:** Scheduled within 24 hours
👤 **Incident Commander:** <@INCIDENT_COMMANDER>

#mobius #recovery #resolved
```

## Template Placeholders

Replace these placeholders with actual values:

- `RELEASE_TAG` - Git tag or commit hash
- `GITHUB_ACTIONS_URL` - Link to GitHub Actions dashboard
- `PR_LINK` - Link to the pull request  
- `@DEPLOY_LEAD` - Slack/Teams handle of deployment lead
- `@ops-team` - Operations team notification group
- `PLATFORM` - ubuntu-latest, macos-latest, or windows-latest
- `STAGE_NAME` - Specific build/deployment stage that failed
- `ERROR_MESSAGE` - Brief error description
- `ROOT_CAUSE` - Identified cause of failure
- `FIX_DESCRIPTION` - Description of applied fix
- `@INCIDENT_COMMANDER` - Incident response lead

---
*MOBIUS Deployment Notification Templates*  
*Last updated: September 2024*