# Teams Notifications Templates

Contains T-0 and T+60 Adaptive Card JSON examples.

## T-0 Deploy Started Example

See the Teams Adaptive Card JSON example in the `teams_deploy_started.json` file for the complete template structure.

## Usage
```bash
# Test notification (dry run)
node github/scripts/send-notification.js \
  --service teams \
  --template deployment-started \
  --release v1.2.3 \
  --pr 123 \
  --env production \
  --lead "Jane Doe" \
  --dry-run

# Live notification (requires TEAMS_WEBHOOK environment variable)
export TEAMS_WEBHOOK="https://outlook.office.com/webhook/YOUR-TEAMS-WEBHOOK-URL"
node github/scripts/send-notification.js \
  --service teams \
  --template deployment-started \
  --release v1.2.3 \
  --pr 123 \
  --env production \
  --lead "Jane Doe"
```

## Timeline Templates
- **T-0:** Deploy started (using deployment-started template)
- **T+60:** Deploy complete (using deployment-complete template)