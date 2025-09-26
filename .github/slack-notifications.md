# Slack notification templates — human + Block Kit JSON

Placeholders:
- {{RELEASE_TAG}}, {{PR_NUMBER}}, {{DEPLOY_LEAD}}, {{ENV}}, {{DEPLOY_URL}}, {{DASHBOARD_URL}}, {{ARTIFACT_URL}}

## Human-readable templates

### T-30 (Deployment starting soon)
Channel: #deployments
Message:
```
:hourglass_flowing_sand: Deployment starting in 30 minutes
Release: {{RELEASE_TAG}}  • Env: {{ENV}}
PR: <{{PR_URL}}|#{{PR_NUMBER}} - {{PR_TITLE}}>
Deploy lead: {{DEPLOY_LEAD}}
Checklist: pre-merge artifacts attached, backups verified, QA assigned.
Runbook: DEPLOYMENT_CHEAT_SHEET.md
```

### T-0 (Go-live)
Channel: #deployments
Message:
```
:rocket: Deploy started — {{RELEASE_TAG}} -> {{ENV}}
PR: <{{PR_URL}}|#{{PR_NUMBER}}>
Deploy lead: {{DEPLOY_LEAD}}
Logs: {{ARTIFACT_URL}}
Dashboard: {{DASHBOARD_URL}}
```

### T+15 (Early verification)
Channel: #deployments
Message:
```
:mag_right: T+15 verification
Health: {{HEALTH_STATUS}}
p95: {{P95_MS}} ms
Errors: {{ERROR_RATE}}%
If any metric exceeds threshold, follow rollback runbook.
```

### T+60 (Complete)
Channel: #deployments
Message (success):
```
:white_check_mark: Deployment complete and stable after 60 minutes
Release: {{RELEASE_TAG}}
```
If failure/rollback occurred: `:warning: Deployment rolled back — see incident: {{INCIDENT_URL}}`

## Block Kit JSON examples

### T-0 (deploy started) — replace {{SLACK_WEBHOOK_URL}} and placeholders before sending
```json
{
  "blocks": [
    { "type": "header", "text": { "type": "plain_text", "text": "🚀 MOBIUS Deploy Started" } },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Release:*\n{{RELEASE_TAG}}" },
        { "type": "mrkdwn", "text": "*Env:*\n{{ENV}}" }
      ]
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*PR:* <{{PR_URL}}|#{{PR_NUMBER}}>  •  *Lead:* {{DEPLOY_LEAD}}\n*Logs:* <{{ARTIFACT_URL}}|deploy-dryrun.log>" }
    },
    {
      "type": "actions",
      "elements": [
        { "type": "button", "text": { "type": "plain_text", "text": "View Dashboard" }, "url": "{{DASHBOARD_URL}}" },
        { "type": "button", "text": { "type": "plain_text", "text": "Open Runbook" }, "url": "{{RUNBOOK_URL}}" }
      ]
    }
  ]
}
```

## Sending via curl (example)
```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"blocks": [...JSON BLOCK ABOVE... ]}' \
  {{SLACK_WEBHOOK_URL}}
```

## Failure alert (short)
```
:x: Deployment failed — investigation required
Attach: latest artifact link, failing logs, suggested next step (rollback or hotfix)
```

## Tips
- Use notify_on flags in monitor script to trigger Slack messages on threshold breaches.
- Rotate and secure webhooks; do not store them in repo plaintext (use secrets).