# Branch Protection Rollback Plan

## Overview
This document provides step-by-step instructions for rolling back branch protection changes if issues occur after updating required status check contexts.

## When to Rollback
Consider rolling back if you experience:
- ✅ **False positives**: PRs blocked by non-existent or incorrectly named check-runs
- ✅ **CI failures**: Matrix jobs not running or reporting under different names
- ✅ **Workflow disruption**: Team unable to merge legitimate PRs
- ✅ **Emergency hotfixes**: Critical fixes blocked by protection rules

## Quick Rollback (Emergency)

### Option 1: Use Backup Files (Recommended)
If you used the `update-branch-protection-contexts.*` scripts, backup files were automatically created:

**Bash:**
```bash
# Find your backup file (most recent)
ls -la /tmp/branch-protection-backup/

# Set variables
export OWNER="your-org"
export REPO="your-repo"  
export BRANCH="main"
BACKUP_FILE="/tmp/branch-protection-backup/protection-backup-YYYYMMDD-HHMMSS.json"

# Restore from backup
curl -X PUT \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/$OWNER/$REPO/branches/$BRANCH/protection" \
  --data-binary @"$BACKUP_FILE"
```

**PowerShell:**
```powershell
# Find your backup file (most recent)
Get-ChildItem "$env:TEMP\branch-protection-backup\" | Sort-Object LastWriteTime -Descending

# Set variables
$Owner = "your-org"
$Repo = "your-repo"
$Branch = "main"
$BackupFile = "$env:TEMP\branch-protection-backup\protection-backup-YYYYMMDD-HHMMSS.json"

$headers = @{
    Authorization = "token $env:GITHUB_TOKEN"
    Accept = "application/vnd.github+json"
}

# Restore from backup
Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection" -Headers $headers -Body (Get-Content $BackupFile -Raw) -ContentType "application/json"
```

### Option 2: Disable Required Status Checks (Emergency Only)
If no backup is available and you need immediate access:

**Bash:**
```bash
# Create minimal protection (removes required status checks)
cat > /tmp/emergency-protection.json << 'EOF'
{
  "required_status_checks": null,
  "enforce_admins": {
    "enabled": true
  },
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "restrictions": null
}
EOF

curl -X PUT \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/$OWNER/$REPO/branches/$BRANCH/protection" \
  --data-binary @/tmp/emergency-protection.json
```

**PowerShell:**
```powershell
# Create minimal protection (removes required status checks)
$emergencyProtection = @{
    required_status_checks = $null
    enforce_admins = @{
        enabled = $true
    }
    required_pull_request_reviews = @{
        required_approving_review_count = 1
        dismiss_stale_reviews = $true
        require_code_owner_reviews = $false
    }
    restrictions = $null
}

Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection" -Headers $headers -Body ($emergencyProtection | ConvertTo-Json -Depth 20) -ContentType "application/json"
```

## Verification After Rollback

### 1. Confirm Protection Status
```bash
# Check current protection
curl -sS -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$OWNER/$REPO/branches/$BRANCH/protection" \
  | jq '.required_status_checks.contexts // []'
```

```powershell
# Check current protection
$protection = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection" -Headers $headers
$protection.required_status_checks.contexts
```

### 2. Test PR Merge
- Create a test PR or use an existing one
- Verify that legitimate PRs can now merge
- Confirm CI still runs (even if not required)

### 3. Monitor Team Access
- Notify team that rollback is complete
- Confirm no one is blocked from merging
- Document any ongoing issues

## Root Cause Analysis

After rollback, investigate the original issue:

### 1. Check Actual CI Check-Run Names
Create a test PR and examine the actual check-run names:
```bash
# Get check-runs for a specific commit
curl -sS -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$OWNER/$REPO/commits/COMMIT_SHA/check-runs" \
  | jq '.check_runs[] | select(.app.slug == "github-actions") | .name'
```

### 2. Compare Expected vs Actual
- **Expected**: What you configured in `required_status_checks.contexts`
- **Actual**: What GitHub Actions actually reports
- **Common mismatches**:
  - Job names vs workflow names
  - Matrix parameter formatting
  - Workflow file name changes

### 3. Common Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| `CI / build-and-qa (ubuntu-latest)` not found | Matrix job name format changed | Update contexts to match actual format |
| Workflow renamed | CI workflow file renamed | Update contexts with new workflow name |
| Job name changed | Job ID in workflow changed | Update contexts with new job name |
| Multiple workflows | Multiple CI workflows running | Include all required workflow check-runs |

## Re-applying Protection (After Fix)

Once you've identified and fixed the root cause:

### 1. Update Context Names
Edit the `NEW_CONTEXTS` in your update script with the correct names:

```bash
# In update-branch-protection-contexts.sh
NEW_CONTEXTS='[
  "Correct Check Run Name 1",
  "Correct Check Run Name 2",
  "Correct Check Run Name 3"
]'
```

### 2. Test in Preview Mode
Run the update script to generate preview JSON, but don't apply yet:
```bash
# Review the preview carefully
./scripts/update-branch-protection-contexts.sh
# When prompted, choose "no" to review the preview
```

### 3. Apply Gradually
Consider applying protection during low-activity periods:
- Off-hours or weekends
- After team notification
- With team standing by to verify

### 4. Monitor Closely
After re-applying:
- Watch for 24-48 hours
- Monitor team Slack/communication channels
- Check PR merge success rates
- Be ready to rollback again if needed

## Prevention for Next Time

### 1. Use the Capture Workflow
Ensure `.github/workflows/capture-check-runs.yml` is in place to automatically detect check-run names.

### 2. Test on Feature Branch First
- Create protection rules on a test branch first
- Verify check-run names match
- Only then apply to main/production branches

### 3. Gradual Rollout
- Start with non-critical repositories
- Apply to one repository at a time
- Wait for stability before proceeding

### 4. Team Communication
- Announce changes in advance
- Provide rollback contact information
- Document the change in team channels

## Emergency Contacts

When rollback is needed:
1. **Immediate**: Use this document for self-service rollback
2. **If stuck**: Contact repository administrators
3. **If urgent**: Escalate to platform/DevOps team

## Files and Artifacts

Keep these files for troubleshooting:
- `/tmp/branch-protection-backup/protection-backup-*.json` (backup files)
- `/tmp/branch-protection-preview.json` (preview of changes)
- `/tmp/branch-protection-applied-*.json` (applied configuration)
- GitHub Actions logs from failed CI runs
- Screenshots of error messages

---

**Remember**: It's better to rollback quickly and investigate than to leave the team blocked. Branch protection can always be re-applied once the issue is understood and resolved.