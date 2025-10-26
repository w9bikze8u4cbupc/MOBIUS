# Reviewer checklist to paste in PR comment

- [ ] Run unit tests in CI / locally: `npm ci && npm test`
- [ ] Run scripts/verify-phase-f.sh locally against the dev server (or let CI run it).
- [ ] POST a dry-run preview to /api/preview and confirm 202 + artifact saved.
- [ ] Check logs for preview_request and response with requestId.
- [ ] Confirm preview_requests_total increment (metrics).
- [ ] Confirm docs updated (docs/api/preview.md, runbook snippet).