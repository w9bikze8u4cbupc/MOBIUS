# Slack Notifications Templates

Contains T-30, T-0, T+15, T+60 examples with Block Kit JSON.

## T-0 Deploy Started Example

See the Slack Block Kit JSON example in the `slack_deploy_started.json` file for the complete template structure.

## Usage
```bash
# Test notification (dry run)
node github/scripts/send-notification.js \
  --service slack \
  --template deployment-started \
  --release v1.2.3 \
  --pr 123 \
  --env production \
  --lead "Jane Doe" \
  --dry-run

# Live notification (requires SLACK_WEBHOOK environment variable)
export SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
node github/scripts/send-notification.js \
  --service slack \
  --template deployment-started \
  --release v1.2.3 \
  --pr 123 \
  --env production \
  --lead "Jane Doe"
```

## Timeline Templates
- **T-30:** Preparation notification
- **T-0:** Deploy started (using deployment-started template)
- **T+15:** Early verification check
- **T+60:** Deploy complete (using deployment-complete template)