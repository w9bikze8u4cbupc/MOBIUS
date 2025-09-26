# MOBIUS Deployment Notification Templates

This directory contains templates for deployment notifications across various communication channels.

## Available Templates

- **Slack**: `slack_templates.json` - Slack message templates for deployment events
- **Microsoft Teams**: `teams_templates.json` - Teams message templates for deployment events  
- **Email**: `email_templates.md` - Email templates for stakeholder notifications

## Usage

These templates can be integrated with your notification systems or used as copy/paste templates for manual notifications.

### Template Variables

All templates support the following variables:
- `{{environment}}` - Target environment (staging/production)
- `{{timestamp}}` - Deployment timestamp
- `{{git_commit}}` - Git commit hash
- `{{git_branch}}` - Git branch name
- `{{deploy_operator}}` - Person executing deployment
- `{{status}}` - Deployment status (success/failed/in-progress)
- `{{duration}}` - Deployment duration
- `{{artifacts_url}}` - Link to deployment artifacts

## Integration Examples

### Bash Integration
```bash
# Replace template variables
sed -e "s/{{environment}}/$ENV/g" \
    -e "s/{{timestamp}}/$(date)/g" \
    -e "s/{{git_commit}}/$(git rev-parse HEAD)/g" \
    notifications/slack_templates.json
```

### Node.js Integration
```javascript
const template = fs.readFileSync('notifications/slack_templates.json', 'utf8');
const message = template
  .replace('{{environment}}', process.env.ENV)
  .replace('{{timestamp}}', new Date().toISOString())
  .replace('{{git_commit}}', gitCommit);
```