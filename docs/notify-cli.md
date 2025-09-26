# Notification CLI Tool

The `scripts/deploy/notify.js` tool is a zero-dependency Node.js CLI for sending deployment notifications to Slack, Teams, and email services.

## Quick Start

1. **Make executable**: The script is already executable (`chmod +x scripts/deploy/notify.js`)

2. **Set environment variables** for webhook URLs:
   ```bash
   export SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
   export TEAMS_WEBHOOK="https://outlook.office.com/webhook/YOUR/WEBHOOK/URL"
   ```

3. **Run with dry-run** to test templates:
   ```bash
   node scripts/deploy/notify.js --service slack --template slack_deploy_started --data '{"release":"v1.2.3","pr":123}' --dry-run
   ```

## Features

- **Zero dependencies**: Pure Node.js, no external packages required
- **Multi-service**: Send to Slack, Teams, and email in one command
- **Template system**: JSON templates for Slack/Teams, TXT templates for email
- **Variable substitution**: `{{variable}}` syntax for dynamic content
- **Dry-run mode**: Test templates without sending real notifications
- **Flexible data input**: Via `--data` JSON string or `--data-file` JSON file
- **Email to file**: Email content saved to timestamped files in `notifications_out/`

## Templates

Templates are stored in `templates/notifications/`:

- **Slack/Teams**: `.json` files with webhook payload format
- **Email**: `.txt` files with plain text content

### Provided Templates

- `slack_deploy_started.json` / `teams_deploy_started.json` / `email_deploy_started.txt`
- `slack_deploy_completed.json` / `teams_deploy_completed.json` / `email_deploy_completed.txt`

### Template Variables

Common variables supported:
- `{{release}}` - Release version (e.g., "v1.2.3")
- `{{pr}}` - Pull request number
- `{{env}}` - Environment name (e.g., "production", "staging")
- `{{lead}}` - Deployment operator/lead
- `{{duration}}` - Deployment duration (for completed deployments)
- `{{timestamp}}` - Automatically added ISO timestamp

## Usage Examples

### Single Service (Slack)
```bash
node scripts/deploy/notify.js \
  --service slack \
  --template slack_deploy_started \
  --data '{"release":"v1.2.3","pr":123,"env":"production","lead":"DevOps"}' \
  --dry-run
```

### Multi-Service with Data File
```bash
# Create deploy.json with deployment data
echo '{"release":"v1.2.3","pr":123,"env":"production","lead":"DevOps Team"}' > deploy.json

# Send to all services
SLACK_WEBHOOK="https://hooks.slack.com/..." \
TEAMS_WEBHOOK="https://outlook.office.com/webhook/..." \
node scripts/deploy/notify.js \
  --service slack,teams,email \
  --template deploy_started \
  --data-file ./deploy.json
```

### Email Only (No Webhooks Required)
```bash
node scripts/deploy/notify.js \
  --service email \
  --template email_deploy_started \
  --data-file ./deploy.json
# Output: notifications_out/email_2025-04-05T12-34-56Z.txt
```

## Integration Examples

### GitHub Actions
```yaml
- name: Send deployment notification
  run: |
    node scripts/deploy/notify.js \
      --service slack,email \
      --template deploy_started \
      --data '{"release":"${{ github.ref_name }}","pr":"${{ github.event.number }}","env":"production","lead":"${{ github.actor }}"}'
  env:
    SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
```

### Shell Script
```bash
#!/bin/bash
DEPLOY_DATA="{\"release\":\"$1\",\"pr\":\"$2\",\"env\":\"$3\",\"lead\":\"$(git config user.name)\"}"

# Start notification
node scripts/deploy/notify.js \
  --service slack,teams \
  --template deploy_started \
  --data "$DEPLOY_DATA"

# ... deployment logic ...

# Completion notification  
node scripts/deploy/notify.js \
  --service slack,teams,email \
  --template deploy_completed \
  --data "$DEPLOY_DATA"
```

## Command Line Options

```
Usage: node notify.js [options]

Options:
  -s, --service <service>      Service(s) to send to: slack, teams, email (comma-separated)
  -t, --template <template>    Template name (without extension)
  -d, --data <json>           JSON data for template substitution
  -f, --data-file <file>      File containing JSON data for template substitution
  -w, --webhook-url <url>     Override webhook URL (for testing)
      --dry-run               Test mode - don't send actual notifications
  -h, --help                  Show this help
```

## Environment Variables

- `SLACK_WEBHOOK`: Slack webhook URL
- `TEAMS_WEBHOOK`: Microsoft Teams webhook URL

## Output

- **Slack/Teams**: HTTP POST to webhook URLs
- **Email**: Text files in `notifications_out/` with timestamp format: `email_2025-04-05T12-34-56Z.txt`
- **Console**: Rich formatted output with emojis and status indicators
- **Exit codes**: 0 for success, 1 for errors