# PR Status — Automated CI summary

**PR:** #123 — Implement deployment templates  
**Branch:** `feature/dhash-production-ready`  •  **Target:** `main`  •  **Release:** v1.2.3

## Status
- **Overall:** **SUCCESS**
- **Matrix:**
  - Ubuntu: PASS
  - macOS: PASS
  - Windows: PASS

## Artifacts (click to download)
- Premerge artifacts: [premerge_artifacts](https://ci.example/artifacts/premerge_artifacts_123)
- Backups: [dhash_v1.2.3.zip](https://ci.example/artifacts/backups/dhash_v1.2.3.zip)  (sha256: `abcdef123456...`)
- Deploy dry-run log: [deploy-dryrun.log](https://ci.example/artifacts/deploy-dryrun.log)
- Migration dry-run log: [migrate-dryrun.log](https://ci.example/artifacts/migrate-dryrun.log)
- Smoke tests: [postdeploy-smoketests.log](https://ci.example/artifacts/postdeploy-smoketests.log)

## Quality Gates Summary
- Audio (LUFS): PASS (target: -23.0 ±1.0 dB)
- Video (SSIM): PASS (0.997 >= 0.995)
- Performance (p95): 120 ms (threshold: 200 ms)
- Error rate: 0.02% (threshold: 0.1%)

## Checks & next steps
- premerge-validation: PASS
- If all checks pass and you have 2 approvals (incl. Ops/SRE): proceed with rebase-and-merge

## Merge command:
```bash
gh pr merge --repo w9bikze8u4cbupc/MOBIUS --head feature/dhash-production-ready --merge-method rebase --delete-branch
```

## Deploy operator run (example):
```bash
export RELEASE_TAG="v1.2.3"
./scripts/deploy_dhash.sh --env production --tag "$RELEASE_TAG"
./scripts/monitor_dhash.sh --env production --duration 3600
```

## Helpful links
- Runbook: DEPLOYMENT_OPERATIONS_GUIDE.md
- Cheat sheet: DEPLOYMENT_CHEAT_SHEET.md
- Notification templates: NOTIFICATION_TEMPLATES.md