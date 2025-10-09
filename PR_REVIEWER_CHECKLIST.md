# PR Reviewer Checklist Comment for Phase F

## Compact Copy/Paste PR Reviewer Checklist

Use this as the top-level PR comment for reviewers:

```
## Reviewer checklist — Phase F (Image Matcher + Preview)

- [ ] PR body explains user-visible behavior and includes test instructions.
- [ ] Files changed: confirm only intended files under client/src and src/api/handlers and .github/workflows.
- [ ] CI: unit tests pass locally (jest + supertest) and CI workflow file is present if this PR includes CI changes.
- [ ] Preview endpoint: POST /api/preview supports dryRun=true and writes to DATA_DIR in staging.
- [ ] Metrics: preview_requests_total, preview_failures_total, preview_duration_ms registered.
- [ ] Scripts: verify-phase-f.sh and verify-phase-f.ps1 present and executable; smoke tests referenced in SMOKE_TESTS.md.
- [ ] Logging: structured JSON with requestId; no secrets logged.
- [ ] Security: no hardcoded tokens or secrets in PR.
- [ ] Documentation: MONITORING_AND_ROLLBACK.md and runbook updated.
- [ ] Manual verify (Ops): ensure DATA_DIR writable, set PREVIEW_MAX_CONCURRENCY=1 and PREVIEW_QUEUE_MAX=20 for initial tests.

/cc @developer @ops @team-lead
```

## How to Use

1. Copy the entire checklist above
2. Paste it as a comment on the PR
3. Tag the appropriate reviewers
4. Reviewers can check off items as they complete their review

## Tips for Reviewers

- Focus on the acceptance criteria listed in the PR description
- Verify that all new functionality is covered by tests
- Check that documentation is updated to reflect new features
- Ensure security best practices are followed
- Validate that the implementation matches the design described in the PR