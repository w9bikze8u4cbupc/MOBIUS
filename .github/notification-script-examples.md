# Notification Script Examples

Pre-filled CLI examples to run the send-notification.js script using --dry-run or live webhooks.

## Dry Run Examples

### Deploy Started (Slack)
```bash
node github/scripts/send-notification.js \
  --service slack \
  --template deployment-started \
  --release v1.2.3 \
  --pr 123 \
  --env production \
  --lead "Jane Doe" \
  --dry-run
```

### Deploy Started (Teams)
```bash
node github/scripts/send-notification.js \
  --service teams \
  --template deployment-started \
  --release v1.2.3 \
  --pr 123 \
  --env production \
  --lead "Jane Doe" \
  --dry-run
```

### Deploy Complete (Both services)
```bash
node github/scripts/send-notification.js \
  --service slack,teams \
  --template deployment-complete \
  --release v1.2.3 \
  --pr 123 \
  --env production \
  --lead "Jane Doe" \
  --dry-run
```

## Live Examples (requires environment variables)

### Setup
```bash
export SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
export TEAMS_WEBHOOK="https://outlook.office.com/webhook/YOUR-TEAMS-WEBHOOK-URL"
```

### Deploy Started (Both services)
```bash
node github/scripts/send-notification.js \
  --service slack,teams \
  --template deployment-started \
  --release v1.2.3 \
  --pr 123 \
  --env production \
  --lead "Jane Doe"
```

### Deploy Complete (Both services)
```bash
node github/scripts/send-notification.js \
  --service slack,teams \
  --template deployment-complete \
  --release v1.2.3 \
  --pr 123 \
  --env production \
  --lead "Jane Doe"
```