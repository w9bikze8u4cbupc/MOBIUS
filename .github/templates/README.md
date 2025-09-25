# MOBIUS Deployment & PR Templates

This directory contains ready-to-use templates and scripts for the MOBIUS video generation pipeline deployment workflow.

## 📋 Available Artifacts

### 1. PR Checklist (`../pull_request_template.md`)
**Purpose**: Standardized checklist for PR reviews, automatically appears in every PR description.

**Features**:
- Code quality & standards checks
- Video pipeline specific validations
- Cross-platform testing requirements
- Audio compliance verification
- Performance impact assessment

### 2. CI PR Comment Template (`ci-pr-comment.md`)
**Purpose**: Template for automated GitHub Actions to post PR status updates.

**Usage in Workflow**:
```yaml
- name: Post CI Results
  uses: actions/github-script@v6
  with:
    script: |
      const template = require('./github/templates/ci-pr-comment.md');
      // Replace placeholders with actual values
      const comment = template
        .replace('{{UBUNTU_STATUS}}', 'UBUNTU_STATUS}}', '✅ Passed')
        .replace('{{PREVIEW_VIDEO_URL}}', artifactUrl);
      // Post comment...
```

### 3. Branch Protection Setup (`scripts/branch-protection-setup.sh`)
**Purpose**: One-liner script to configure GitHub branch protection rules.

**Usage**:
```bash
# Use defaults (w9bikze8u4cbupc/MOBIUS main)
./github/scripts/branch-protection-setup.sh

# Custom repo/branch
./github/scripts/branch-protection-setup.sh myorg/myrepo develop
```

**Requirements**: GitHub CLI (`gh`) installed and authenticated

### 4. Deploy Cheat Sheet (`deploy-cheatsheet.md`)
**Purpose**: Quick reference for deployment operations and troubleshooting.

**Sections**:
- Quick deploy commands
- Critical file paths
- Emergency recovery procedures
- Environment requirements
- Common deploy scenarios

### 5. Slack Notifications (`templates/slack-notifications.json`)
**Purpose**: Rich Slack message templates for deployment notifications.

**Templates Included**:
- Deployment start (T-30)
- Deployment issues/failures
- Deployment success (T+60)
- Weekly summary reports

**Usage with Slack Webhook**:
```javascript
const template = require('./slack-notifications.json');
const message = template.deploymentStart
  .replace('{{RELEASE_TAG}}', 'v1.2.3')
  .replace('{{DEPLOY_LEAD}}', '@ops-team');

await fetch(SLACK_WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(message)
});
```

### 6. Teams Notifications (`templates/teams-notifications.json`)
**Purpose**: Microsoft Teams adaptive cards for deployment notifications.

**Templates Included**:
- Deployment start/progress
- Error alerts with troubleshooting
- Success confirmations with metrics
- Weekly performance reports
- Maintenance notifications

## 🔧 Template Variables

### Common Placeholders
Replace these placeholders with actual values:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{RELEASE_TAG}}` | Git tag/version | `v1.2.3` |
| `{{DEPLOY_LEAD}}` | Person responsible | `@ops-team` |
| `{{PR_NUMBER}}` | Pull request number | `123` |
| `{{PR_URL}}` | Pull request URL | `https://github.com/...` |
| `{{WORKFLOW_URL}}` | GitHub Actions run URL | `https://github.com/.../actions/runs/...` |
| `{{BRANCH_NAME}}` | Git branch | `main`, `feature/new-game` |

### Video Pipeline Specific
| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{LUFS_VALUE}}` | Audio loudness | `-23.1 LUFS` |
| `{{PEAK_VALUE}}` | Audio true peak | `-1.2 dBTP` |
| `{{RENDER_SPEED}}` | Rendering performance | `2.3x realtime` |
| `{{VIDEO_COUNT}}` | Generated videos | `3 previews` |
| `{{MEMORY_PEAK}}` | Peak memory usage | `1.2 GB` |
| `{{GOLDEN_TEST_STATUS}}` | Golden test results | `✅ All passed` |

### CI/CD Specific
| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{UBUNTU_STATUS}}` | Ubuntu build status | `✅ Passed`, `❌ Failed` |
| `{{MACOS_STATUS}}` | macOS build status | `✅ Passed` |
| `{{WINDOWS_STATUS}}` | Windows build status | `⚠️ Warnings` |
| `{{ARTIFACTS_URL}}` | Build artifacts URL | GitHub Actions download link |
| `{{BUILD_NUMBER}}` | CI build number | `42` |

## 🚀 Integration Examples

### GitHub Actions Workflow
```yaml
name: Post PR Status
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]

jobs:
  post-status:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Generate PR Comment
        run: |
          # Load template and replace placeholders
          sed 's/{{UBUNTU_STATUS}}/✅ Passed/g; s/{{BUILD_NUMBER}}/${{ github.run_number }}/g' \
            .github/templates/ci-pr-comment.md > comment.md
            
      - name: Post Comment
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const comment = fs.readFileSync('comment.md', 'utf8');
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo, 
              issue_number: context.issue.number,
              body: comment
            });
```

### Slack Integration
```javascript
// Example Slack notification sender
async function sendDeploymentNotification(status, data) {
  const fs = require('fs');
  const templates = JSON.parse(fs.readFileSync('.github/templates/slack-notifications.json'));
  
  let template;
  switch(status) {
    case 'start': template = templates.deploymentStart; break;
    case 'success': template = templates.deploymentSuccess; break;
    case 'failure': template = templates.deploymentIssue; break;
  }
  
  // Replace placeholders
  const message = JSON.stringify(template)
    .replace(/\{\{RELEASE_TAG\}\}/g, data.releaseTag)
    .replace(/\{\{DEPLOY_LEAD\}\}/g, data.deployLead)
    .replace(/\{\{LUFS_VALUE\}\}/g, data.lufsValue);
    
  await sendToSlack(JSON.parse(message));
}
```

## 📚 Additional Resources

- **GitHub Branch Protection**: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches
- **Slack Block Kit**: https://api.slack.com/block-kit
- **Teams Adaptive Cards**: https://docs.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/cards-reference
- **GitHub Actions**: https://docs.github.com/en/actions

---
*Templates generated for MOBIUS video generation pipeline • Last updated: 2024*