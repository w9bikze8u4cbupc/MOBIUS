# Notification script examples — usage and patterns

This file shows CLI examples for `node .github/scripts/send-notification.js` and simple curl fallbacks.

## Usage patterns (assumes a send-notification.js CLI exists)
```bash
# Slack + Teams, deployment started
node .github/scripts/send-notification.js \
  --service slack,teams \
  --template deployment-started \
  --release {{RELEASE_TAG}} \
  --pr {{PR_NUMBER}} \
  --env production \
  --lead "{{DEPLOY_LEAD}}"

# Slack only, deploy complete
node .github/scripts/send-notification.js \
  --service slack \
  --template deployment-complete \
  --release {{RELEASE_TAG}} \
  --env production

# Dry-run (prints payloads to stdout, does not post)
node .github/scripts/send-notification.js --template deployment-started --dry-run
```

## Minimal curl-based Slack example (quick test)
```bash
PAYLOAD=$(jq -n --arg r "{{RELEASE_TAG}}" --arg env "{{ENV}}" \
  '{blocks: [{type:"section", text:{type:"mrkdwn", text:":rocket: Deploy started - release: \($r) (env: \($env))"}}]}')
curl -X POST -H 'Content-type: application/json' --data "$PAYLOAD" {{SLACK_WEBHOOK_URL}}
```

## Minimal curl-based Teams example (quick test)
```bash
curl -H "Content-Type: application/json" -d @adaptive_card.json {{TEAMS_WEBHOOK}}
```

## Sample send-notification CLI flags
- `--service` (slack|teams|email|all)
- `--template` (deployment-started|deployment-complete|deployment-failed|rollback)
- `--release` (vX.Y.Z)
- `--pr` (#123)
- `--env` (staging|production)
- `--lead` ("Jane Doe")
- `--dry-run` (prints payloads)
- `--webhook` (override default webhook for testing)

## Integration tips
In GitHub Actions, pass secrets as inputs:
```yaml
SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
TEAMS_WEBHOOK: ${{ secrets.TEAMS_WEBHOOK }}
```
- Use the `--dry-run` mode in premerge CI to validate payload formatting without sending messages.
- Include artifact links and dashboard links in the payload to speed triage.