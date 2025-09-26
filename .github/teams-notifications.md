# Microsoft Teams notification templates — Adaptive Card JSON + human text

Placeholders:
{{RELEASE_TAG}}, {{PR_NUMBER}}, {{DEPLOY_LEAD}}, {{ENV}}, {{DASHBOARD_URL}}, {{ARTIFACT_URL}}

## Human templates

### T-0 (Start)
Title: MOBIUS Deploy Started — {{RELEASE_TAG}}
Body:
```
Release: {{RELEASE_TAG}}
Env: {{ENV}}
PR: {{PR_URL}}
Deploy lead: {{DEPLOY_LEAD}}
Logs: {{ARTIFACT_URL}}
Dashboard: {{DASHBOARD_URL}}
```

### T+60 (Complete)
Title: MOBIUS Deploy Complete — {{RELEASE_TAG}}
Body:
```
Deployment stable after 60 minutes. No action required.
```

## Adaptive Card example (T-0)
```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    { "type": "TextBlock", "size": "Large", "weight": "Bolder", "text": "🚀 MOBIUS Deploy Started" },
    {
      "type": "FactSet",
      "facts": [
        { "title": "Release", "value": "{{RELEASE_TAG}}" },
        { "title": "Env", "value": "{{ENV}}" },
        { "title": "PR", "value": "{{PR_URL}}" },
        { "title": "Lead", "value": "{{DEPLOY_LEAD}}" }
      ]
    },
    {
      "type": "TextBlock",
      "text": "[View Dashboard]({{DASHBOARD_URL}}) • [Logs]({{ARTIFACT_URL}})",
      "wrap": true
    }
  ],
  "actions": [
    { "type": "Action.OpenUrl", "title": "Open Dashboard", "url": "{{DASHBOARD_URL}}" },
    { "type": "Action.OpenUrl", "title": "Open Runbook", "url": "{{RUNBOOK_URL}}" }
  ]
}
```

## Sending example (curl)
```bash
curl -H "Content-Type: application/json" -d '@adaptive_card.json' {{TEAMS_WEBHOOK}}
```

## Security note
Store Teams webhooks in GitHub Secrets and reference them in workflows.