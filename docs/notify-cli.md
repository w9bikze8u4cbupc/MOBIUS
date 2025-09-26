# notify.js — Deployment Notification CLI

A single-file, dependency-free Node.js CLI for sending deployment notifications to Slack, Teams, and email. Designed for CI/CD integration with secure webhook handling and flexible template support.

## Features

- **Zero Dependencies**: Pure Node.js (18+), no external packages
- **Multi-Service**: Send to Slack, Teams, and email in one command
- **Template System**: `.json` for Slack/Teams, `.txt` for email
- **Variable Substitution**: `{{release}}`, `{{pr}}`, `{{env}}`, etc.
- **Secure Configuration**: Webhook URLs via `SLACK_WEBHOOK` and `TEAMS_WEBHOOK` environment variables
- **Flexible Input**: `--data` JSON string or `--data-file` for JSON files
- **Dry-run Mode**: Test templates and configuration without sending real notifications
- **Email to File**: Outputs email content to timestamped files in `notifications_out/`

## Usage

### Basic Syntax

```bash
node scripts/deploy/notify.js --service <slack|teams|email>[,...] --template <name> [--data '{"key":"value"}' | --data-file <file>] [--dry-run]
```

### Examples

#### Dry-run Slack notification
```bash
node scripts/deploy/notify.js --service slack --template slack_deploy_started --data '{"release":"v1.2.3","pr":123}' --dry-run
```

#### Multi-service with data file
```bash
SLACK_WEBHOOK="https://hooks.slack.com/..." \
TEAMS_WEBHOOK="https://outlook.office.com/webhook/..." \
node scripts/deploy/notify.js --service slack,teams --template deploy_started --data-file ./deploy.json
```

#### Email output to file
```bash
node scripts/deploy/notify.js --service email --template deploy_started --data-file ./deploy.json
# Output: notifications_out/email_2025-04-05T12-34-56Z.txt
```

## Templates

Templates are stored in `templates/notifications/` by default. The tool automatically selects the correct file extension based on the service:

- **Slack/Teams**: `.json` files containing webhook payload
- **Email**: `.txt` files with email content

### Common Variables

- `{{release}}` - Release version (e.g., "v1.2.3")
- `{{pr}}` - Pull request number
- `{{env}}` - Environment name (e.g., "production", "staging")
- `{{lead}}` - Deployment operator/lead
- `{{duration}}` - Deployment duration (for completion notifications)
- `{{timestamp}}` - Auto-generated ISO timestamp

### Example Slack Template (slack_deploy_started.json)

```json
{
  "text": "Deployment started: {{release}} (PR #{{pr}})",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": ":rocket: *Deployment started* for `{{release}}` (PR #{{pr}})"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Environment: `{{env}}` | Operator: {{lead}}"
        }
      ]
    }
  ]
}
```

### Example Teams Template (teams_deploy_started.json)

```json
{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "content": {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.2",
        "body": [
          {
            "type": "TextBlock",
            "size": "Medium",
            "weight": "Bolder",
            "text": "🚀 Deployment started: {{release}}"
          },
          {
            "type": "TextBlock",
            "text": "PR: #{{pr}} | Environment: {{env}} | Operator: {{lead}}",
            "wrap": true
          }
        ]
      }
    }
  ]
}
```

### Example Email Template (email_deploy_started.txt)

```
Deployment Started: {{release}}

PR: #{{pr}}
Environment: {{env}}
Operator: {{lead}}

Deployment initiated at {{timestamp}}.

This is an automated notification from the deployment pipeline.
```

## Integration

### GitHub Actions

```yaml
- name: Notify deployment started
  env:
    SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
    TEAMS_WEBHOOK: ${{ secrets.TEAMS_WEBHOOK }}
  run: |
    node scripts/deploy/notify.js --service slack,teams --template deploy_started --data '{"release":"${{ github.ref_name }}","pr":${{ github.event.pull_request.number }},"env":"production","lead":"${{ github.actor }}"}'
```

### Shell Scripts

```bash
# In your deployment script
node scripts/deploy/notify.js --service slack --template deploy_started --data-file ./deploy.json
```

### Manual Deployment

```bash
# Create a deploy.json file with deployment details
echo '{"release":"v1.2.3","pr":123,"env":"production","lead":"jane.doe"}' > deploy.json

# Send notification
node scripts/deploy/notify.js --service slack,teams,email --template deploy_started --data-file deploy.json
```

## Troubleshooting

### Template Not Found

Ensure the template file exists in `templates/notifications/` with the correct extension (`.json` for Slack/Teams, `.txt` for email).

### Webhook URL Not Set

Set the `SLACK_WEBHOOK` and `TEAMS_WEBHOOK` environment variables or use `--webhook-url` for testing.

### JSON Parse Error

Ensure the `--data` string is valid JSON or the `--data-file` contains valid JSON.

### Dry-run Mode

Use `--dry-run` to test templates and configuration without sending real notifications.

## Security

- **No Secrets in Repo**: Webhook URLs are passed via environment variables or `--webhook-url` (for testing only).
- **Template Validation**: Templates are validated for correct JSON structure before sending.
- **Error Handling**: Comprehensive error handling with clear messages and non-zero exit codes for CI integration.

## Exit Codes

- `0` - Success
- `1` - Fatal error (e.g., missing arguments, template not found)
- `2` - Notification send failed (e.g., webhook error, invalid JSON)

## Customization

### Template Directory

Use `--template-dir` to specify a custom template directory.

### Webhook URL

Use `--webhook-url` to override webhook URLs for testing.

### Data File

Use `--data-file` to load data from a JSON file.

## Contributing

### Add New Services

Extend `handleService` in `notify.js` to support new notification services.

### Add New Template Types

Modify `extMap` in `notify.js` to support new template file extensions.

### Improve Error Handling

Add more specific error messages and handling for edge cases.

## License

MIT