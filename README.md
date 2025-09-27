# MOBIUS Games Tutorial Generator

A pipeline for generating game tutorial videos from structured game rules.

## New: Deployment Notification System

This repository now includes a robust deployment notification system with:

- **Zero-dependency Node.js CLI** (`scripts/deploy/notify.js`) for sending notifications
- **CI-friendly wrapper** (`scripts/deploy/deploy-notify.js`) with automatic data generation  
- **Multi-service support**: Slack, Teams, and Email
- **Template-driven notifications** with variable substitution
- **Exponential backoff retry logic** for reliable delivery
- **Complete GitHub Actions integration**

### Quick Start

```bash
# Make scripts executable
chmod +x scripts/deploy/notify.js scripts/deploy/deploy-notify.js

# Test with dry run
node scripts/deploy/deploy-notify.js start --dry-run --environment production

# Send real notifications (requires webhook environment variables)
SLACK_WEBHOOK="https://hooks.slack.com/..." \
node scripts/deploy/deploy-notify.js success --duration "5m 30s"
```

See [docs/notify-cli.md](docs/notify-cli.md) for complete documentation.
