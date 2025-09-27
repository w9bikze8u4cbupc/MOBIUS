# Deployment Notification CLI

This document describes the deployment notification system that provides robust, template-driven notifications for Slack, Teams, and email with retry logic and CI integration.

## Overview

The notification system consists of two main components:

1. **`notify.js`** - Zero-dependency Node.js notification CLI with exponential backoff retry logic
2. **`deploy-notify.js`** - CI-friendly wrapper that generates deployment data automatically

## Quick Start

### Basic Usage

```bash
# Make scripts executable
chmod +x scripts/deploy/notify.js scripts/deploy/deploy-notify.js

# Dry run to test templates
node scripts/deploy/deploy-notify.js start --dry-run

# Send real notifications
SLACK_WEBHOOK="https://hooks.slack.com/..." \
TEAMS_WEBHOOK="https://outlook.office.com/..." \
node scripts/deploy/deploy-notify.js success --duration "5m 30s"
```

### Environment Variables

The system recognizes these environment variables for webhook URLs:

- `SLACK_WEBHOOK` - Slack incoming webhook URL
- `TEAMS_WEBHOOK` - Microsoft Teams incoming webhook URL

## Tools

### notify.js - Core Notification Engine

Zero-dependency CLI for sending notifications with retry logic.

#### Usage
```bash
node scripts/deploy/notify.js [phase] [options]
```

#### Arguments
- `phase` - Deployment phase: `start`, `success`, or `failure`

#### Options
- `--services LIST` - Comma-separated services: `slack,teams,email` (default: all)
- `--data JSON` - JSON data for template substitution  
- `--data-file PATH` - File containing JSON data for template substitution
- `--template-dir PATH` - Directory containing templates (default: `templates/notifications`)
- `--webhook-url URL` - Override webhook URL for all services
- `--output-dir PATH` - Directory for email output files (default: `notifications_out`)
- `--retries N` - Maximum retry attempts (default: 3)
- `--timeout MS` - Request timeout in milliseconds (default: 10000)
- `--dry-run` - Show what would be sent without making network calls

#### Exit Codes
- `0` - Success
- `1` - Usage/template error  
- `2` - Send failure

#### Examples

```bash
# Dry run with custom data
node scripts/deploy/notify.js start --dry-run --data '{"release":"v1.0.0","env":"prod"}'

# Send to Slack only with data file
node scripts/deploy/notify.js success --services slack --data-file deploy.json

# Email notification with custom output directory
node scripts/deploy/notify.js failure --services email --output-dir ./logs/
```

### deploy-notify.js - CI Wrapper

CI-friendly wrapper that automatically generates deployment data and calls notify.js.

#### Usage
```bash
node scripts/deploy/deploy-notify.js <phase> [options]
```

#### Phases
- `start` - Deployment started
- `success` - Deployment completed successfully  
- `failure` - Deployment failed

#### Options
- `--services LIST` - Comma-separated services: `slack,teams,email`
- `--template-dir PATH` - Directory containing templates
- `--output-dir PATH` - Directory for email output files  
- `--webhook-url URL` - Override webhook URL for all services
- `--data-file PATH` - Additional JSON data file to merge
- `--dry-run` - Show what would be sent without making calls
- `--duration TIME` - Deployment duration (e.g., "5m 30s", "2h 15m")
- `--environment ENV` - Target environment (e.g., "production", "staging")
- `--release VERSION` - Release version (e.g., "v1.0.0", "1.2.3-rc1")
- `--pull-request ID` - Pull request number or URL
- `--lead NAME` - Deployment lead/person responsible

#### Automatic Data Generation

The wrapper automatically generates these data fields:

- `timestamp` - Current ISO timestamp
- `timestampFormatted` - Human-readable timestamp
- `phase` - Deployment phase
- `environment` - From `--environment` or CI environment variables
- `release` - From `--release` or git/CI environment variables  
- `pullRequest` - From `--pull-request` or CI environment variables
- `lead` - From `--lead` or git/CI environment variables
- `duration` - From `--duration` (for success/failure phases)
- `repository` - From git remote or CI environment variables
- `branch` - From git or CI environment variables
- `commitHash` - From git or CI environment variables

#### Examples

```bash
# Start notification with auto-generated data
node scripts/deploy/deploy-notify.js start --environment production --release v1.2.0

# Success notification with duration
node scripts/deploy/deploy-notify.js success --duration "3m 45s" --lead "John Doe"

# Failure notification (dry run)
node scripts/deploy/deploy-notify.js failure --dry-run

# Use custom data file
node scripts/deploy/deploy-notify.js start --data-file custom-deploy.json
```

## Templates

Templates are stored in `templates/notifications/` with the naming convention:

- `{service}_deploy_{phase}.json` for Slack/Teams
- `{service}_deploy_{phase}.txt` for Email

### Template Variables

Templates support `{{variable}}` syntax for substitution. Common variables include:

- `{{repository}}` - Repository name
- `{{environment}}` - Target environment
- `{{release}}` - Release version
- `{{branch}}` - Git branch
- `{{commitHash}}` - Short commit hash
- `{{lead}}` - Deployment lead
- `{{duration}}` - Deployment duration
- `{{timestamp}}` - ISO timestamp
- `{{timestampFormatted}}` - Human-readable timestamp

### Slack Templates

Slack templates use the [Block Kit format](https://api.slack.com/block-kit):

```json
{
  "text": "🚀 Deployment Started",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Deployment Started* 🚀\\n\\n*Repository:* {{repository}}\\n*Environment:* {{environment}}"
      }
    }
  ]
}
```

### Teams Templates

Teams templates use the [MessageCard format](https://docs.microsoft.com/en-us/outlook/actionable-messages/message-card-reference):

```json
{
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions",
  "themeColor": "0076D7",
  "summary": "Deployment Started",
  "sections": [
    {
      "activityTitle": "🚀 Deployment Started",
      "facts": [
        {"name": "Repository", "value": "{{repository}}"},
        {"name": "Environment", "value": "{{environment}}"}
      ]
    }
  ]
}
```

### Email Templates

Email templates are plain text with variable substitution:

```text
🚀 DEPLOYMENT STARTED

Repository: {{repository}}
Environment: {{environment}}
Release: {{release}}

Started at: {{timestampFormatted}}
```

## CI/CD Integration

### GitHub Actions

See `.github/workflows/deploy.yml` for a complete example workflow that includes:

- Start/success/failure notifications
- Duration calculation
- PR comments
- Artifact upload for email notifications

#### Basic Integration

```yaml
- name: Send deployment start notification
  env:
    SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
    TEAMS_WEBHOOK: ${{ secrets.TEAMS_WEBHOOK }}
  run: |
    node scripts/deploy/deploy-notify.js start \
      --environment "${{ env.ENVIRONMENT }}" \
      --release "${{ env.RELEASE_VERSION }}" \
      --lead "${{ github.actor }}"
```

### Other CI Systems

The tools work with any CI system that can run Node.js. Use environment variables for configuration:

```bash
export SLACK_WEBHOOK="https://hooks.slack.com/..."
export TEAMS_WEBHOOK="https://outlook.office.com/..."
node scripts/deploy/deploy-notify.js start --environment production
```

## Configuration

### Retry Logic

The system uses exponential backoff with jitter for reliable delivery:

- Default: 3 retry attempts
- Base delay: 1 second
- Max delay: 30 seconds
- Jitter factor: 10%
- Request timeout: 10 seconds

Customize with options:
```bash
node scripts/deploy/notify.js start --retries 5 --timeout 15000
```

### Output Directory

Email notifications are written to `notifications_out/` by default. The directory is automatically created and files are named with timestamps:

```
notifications_out/
├── email_deploy_start_2024-01-15T10-30-00-123Z.txt
├── email_deploy_success_2024-01-15T10-35-00-456Z.txt
└── email_deploy_failure_2024-01-15T10-40-00-789Z.txt
```

## Security Considerations

1. **Never commit webhook URLs** - Use repository/organization secrets in CI
2. **Use `--dry-run`** during template development to avoid spamming channels
3. **Webhook validation** - The system validates HTTP responses and provides detailed error messages
4. **Timeout protection** - Requests timeout after 10 seconds by default to prevent hanging

## Troubleshooting

### Common Issues

**Template not found**
```
Error: Template not found: templates/notifications/slack_deploy_start.json
```
- Ensure template files exist with correct naming convention
- Check `--template-dir` path is correct

**Webhook failures**
```
[slack] All 3 attempts failed. Last error: HTTP 400: Invalid payload
```
- Verify webhook URL is correct and active
- Test template with `--dry-run` to check JSON validity
- Check webhook permissions and channel settings

**Variable substitution**
- Missing variables remain as `{{variable}}` in output
- Add missing data via `--data` or `--data-file`
- Use `--dry-run` to preview substitution results

### Testing

Test the complete system:

```bash
# Test all services with dry run
node scripts/deploy/deploy-notify.js start --dry-run --services slack,teams,email

# Test specific service with real data
node scripts/deploy/deploy-notify.js success --services slack --duration "2m 30s"

# Validate JSON templates
cat templates/notifications/slack_deploy_start.json | jq '.'
```

## Extension

### Adding New Services

1. Create templates following naming convention
2. Add service to valid services list in `notify.js`
3. Implement sending logic in `sendNotifications()` function

### Custom Templates

Create custom templates in any directory:

```bash
node scripts/deploy/notify.js start --template-dir ./custom-templates/ --data-file ./custom-data.json
```

### Custom Data Fields

Add custom fields via data files:

```json
{
  "customField": "custom value",
  "buildNumber": "12345",
  "deploymentUrl": "https://app.example.com"
}
```

Use in templates:
```text
Build: {{buildNumber}}
URL: {{deploymentUrl}}
```