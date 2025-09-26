# MOBIUS Deployment Workflow

This document describes the GitHub Actions deployment workflow integrated with the notification system.

## Overview

The deployment workflow (`.github/workflows/deploy.yml`) provides automated deployment with comprehensive notifications to Slack, Teams, and email.

## Features

- **Multi-service notifications**: Slack, Microsoft Teams, and email support
- **Template-based messaging**: Consistent, customizable notification formats
- **Deployment lifecycle tracking**: Start, success, and failure notifications
- **Pull request integration**: Automatic artifact links in PR comments
- **Flexible configuration**: Easy to adapt for different environments

## Setup

### 1. Configure Webhooks

Add these secrets to your GitHub repository:

- `SLACK_WEBHOOK`: Your Slack webhook URL
- `TEAMS_WEBHOOK`: Your Microsoft Teams webhook URL

### 2. Template Customization

Templates are located in `templates/notifications/`:

- `deploy_started.json` - Slack/Teams notification for deployment start
- `deploy_completed.json` - Slack/Teams notification for successful deployment
- `deploy_failed.json` - Slack/Teams notification for failed deployment
- `deploy_started.txt` - Email template for deployment start
- `deploy_completed.txt` - Email template for successful deployment
- `deploy_failed.txt` - Email template for failed deployment

### 3. Deployment Configuration

Edit the "Deploy (placeholder)" step in `.github/workflows/deploy.yml` to include your actual deployment commands.

## Usage

The workflow automatically triggers on:

- Pushes to the `main` branch
- Tag pushes (e.g., `v1.0.0`)
- Manual workflow dispatch

## Workflow Options

Two deployment workflow files are provided:

### Option 1: Full Control (deploy.yml)
The main workflow provides complete control over the deployment data and notification process. Use this if you need custom data manipulation or complex deployment logic.

### Option 2: Simplified (deploy-simple.yml)
Uses the `deploy-notify.js` wrapper script for cleaner, more maintainable workflows. This is recommended for most use cases as it reduces boilerplate and keeps workflows DRY.

## Wrapper Script Usage

The `scripts/deploy/deploy-notify.js` wrapper script provides a simplified interface:

```bash
node scripts/deploy/deploy-notify.js start    # Notify deployment started
node scripts/deploy/deploy-notify.js success  # Notify deployment completed
node scripts/deploy/deploy-notify.js failure  # Notify deployment failed
```

The wrapper automatically handles:
- Creating deployment data from environment variables
- Selecting appropriate templates and services
- Cleanup of temporary files

## Email Notifications

Email content is generated in the `notifications_out/` directory. Integrate these files with your SMTP/alerting pipeline for automatic email delivery.

## Template Variables

The following variables are available in templates:

- `{{release}}` - Git ref name (branch/tag)
- `{{pr}}` - Pull request number (0 if not a PR)
- `{{env}}` - Environment (production)
- `{{lead}}` - GitHub actor (user who triggered the deployment)
- `{{timestamp}}` - ISO timestamp
- `{{duration}}` - Run attempt number (for completed deployments)
- `{{failure}}` - True if deployment failed

## Manual Usage

You can use the notification system manually in two ways:

### Direct Script Usage
```bash
# Create deployment data
cat > deploy.json << EOF
{
  "release": "v1.2.3",
  "pr": 42,
  "env": "production", 
  "lead": "username",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

# Send notifications
node scripts/deploy/notify.js --service slack,teams,email --template deploy_started --data-file ./deploy.json
```

### Wrapper Script Usage (Recommended)
```bash
# Set environment variables
export GITHUB_REF_NAME="v1.2.3"
export GITHUB_ACTOR="username"
export DEPLOY_ENV="production"

# Send notifications using wrapper
node scripts/deploy/deploy-notify.js start
node scripts/deploy/deploy-notify.js success
node scripts/deploy/deploy-notify.js failure
```

## Troubleshooting

- **Webhook failures**: Check that webhook URLs are correctly configured in repository secrets
- **Template errors**: Verify JSON syntax in template files
- **Missing templates**: Ensure all template files exist in `templates/notifications/`
- **Email delivery**: Check `notifications_out/` directory for generated email files