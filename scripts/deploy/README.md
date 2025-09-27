# Deployment Notification Tools

This directory contains improved deployment notification scripts with retry mechanisms and reliable cleanup.

## Scripts

### `notify.js`
Zero-dependency Node 18+ CLI to post templates to Slack/Teams or write email files.

**Features:**
- Retry mechanism with exponential backoff (default 3 attempts)
- Support for Slack, Teams, and Email notifications
- Template substitution with `{{variable}}` syntax
- Configurable retry count and webhook URLs

**Exit codes:**
- `0`: Success (or dry-run)
- `1`: Fatal usage/template error  
- `2`: One or more sends failed (after retries)

**Usage:**
```bash
node notify.js --service <slack|teams|email>[,...] --template <name> [--template-dir <dir>] [--data '{"k":"v"}' | --data-file <file>] [--webhook-url <url>] [--dry-run] [--retries <n>]
```

### `deploy-notify.js`
Wrapper around `notify.js` that creates temporary payload files and ensures reliable cleanup.

**Features:**
- Automatic payload generation with deployment metadata
- Reliable temporary file cleanup in finally block
- Support for deployment phases: start, success, failure
- Environment variable integration

**Usage:**
```bash
node deploy-notify.js <start|success|failure> [--env <env>] [--pr <n>] [--release <v>] [--lead <name>] [--duration <dur>] [--dry-run] [--services slack,teams,email] [--clean]
```

## Environment Variables

- `SLACK_WEBHOOK`: Slack webhook URL
- `TEAMS_WEBHOOK`: Teams webhook URL  
- `DEPLOY_ENV`: Deployment environment (default: production)
- `PR_NUMBER`: Pull request number
- `RELEASE`: Release version
- `GITHUB_REF_NAME`: Git reference name (used as release fallback)
- `DEPLOY_LEAD`: Deployment lead name
- `GITHUB_ACTOR`: GitHub actor (used as lead fallback)

## Templates

Templates are stored in `templates/notifications/` and support variable substitution:

- `deploy_started.json` / `deploy_started.txt` - Deployment start notifications
- `deploy_completed.json` / `deploy_completed.txt` - Deployment success notifications  
- `deploy_failed.json` / `deploy_failed.txt` - Deployment failure notifications

## Examples

```bash
# Test dry-run
node scripts/deploy/deploy-notify.js start --dry-run

# Email-only notification
node scripts/deploy/deploy-notify.js start --services email

# All services with webhook URLs
SLACK_WEBHOOK=https://hooks.slack.com/your/webhook \
TEAMS_WEBHOOK=https://outlook.office.com/your/webhook \
node scripts/deploy/deploy-notify.js success --duration "5m 30s"

# Test retry mechanism
node scripts/deploy/notify.js --service slack --template deploy_started \
  --data '{"release":"v1.0.0","env":"test"}' \
  --webhook-url https://invalid-url.test --retries 2
```

## Retry Mechanism

- **Base delay**: 500ms
- **Backoff factor**: 2x (exponential)
- **Jitter**: 0-200ms random addition
- **Retryable conditions**: Network errors, non-2xx HTTP responses
- **Default retries**: 3 attempts

## File Cleanup

The `deploy-notify.js` wrapper ensures temporary files are cleaned up:
- Temporary payload files (`deploy_*.json`) are removed in a `finally` block
- Use `--clean` flag to remove previous deploy files before execution
- Output files are excluded via `.gitignore`