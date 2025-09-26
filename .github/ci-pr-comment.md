# PR Status — Automated CI summary
PR: #{{PR_NUMBER}} — {{PR_TITLE}}
Branch: `{{BRANCH}}`  • Target: `{{TARGET_BRANCH}}`  • Release: {{RELEASE_TAG}}

## Status
- Overall: **{{CI_STATUS}}**
- Matrix:
  - Ubuntu: {{UBUNTU_STATUS}}  
  - macOS: {{MACOS_STATUS}}  
  - Windows: {{WINDOWS_STATUS}}  

## Artifacts (click to download)
- Premerge artifacts: [{{ARTIFACT_LINK_PREMERGE}}]({{ARTIFACT_LINK_PREMERGE}})
- Backups: [{{LATEST_BACKUP}}]({{LATEST_BACKUP_URL}})  (sha256: `{{LATEST_BACKUP_SHA256}}`)
- Deploy dry-run log: [deploy-dryrun.log]({{ARTIFACT_URL_DEPLOY_DRYRUN}})
- Migration dry-run log: [migrate-dryrun.log]({{ARTIFACT_URL_MIGRATE_DRYRUN}})
- Smoke tests: [postdeploy-smoketests.log]({{ARTIFACT_URL_SMOKE}})

## Quality Gates Summary
- Audio (LUFS): {{LUFS_RESULT}} (target: {{LUFS_TARGET}} ±{{LUFS_TOLERANCE}})
- Video (SSIM): {{SSIM_RESULT}} (threshold: {{SSIM_THRESHOLD}})
- Performance (p95): {{P95_RESULT}} ms (threshold: {{P95_THRESHOLD}} ms)
- Error rate: {{ERROR_RATE}}% (threshold: {{ERROR_RATE_THRESHOLD}}%)

## Checks & next steps
- Golden Preview Checks: {{GOLDEN_CHECK_STATUS}}
- If all checks pass and you have 2 approvals (incl. Ops/SRE): proceed with rebase-and-merge

```bash
gh pr merge --repo {{OWNER}}/{{REPO}} --head {{BRANCH}} --merge-method rebase --delete-branch
```

- Deploy operator run (example):

```bash
export RELEASE_TAG="{{RELEASE_TAG}}"
./scripts/deploy_dhash.sh --env production --tag "$RELEASE_TAG"
./scripts/monitor_dhash.sh --env production --duration 3600
```

## Helpful links
- Runbook: DEPLOYMENT_OPERATIONS_GUIDE.md
- Cheat sheet: DEPLOYMENT_CHEAT_SHEET.md
- Notification templates: NOTIFICATION_TEMPLATES.md

If CI failed — attach failing logs and re-run the failing workflow. Contact @ops for assistance.