# Guarded dhash Rollout - Pre-Merge Checklist

## Status: Ready for Guarded Rebase-and-Merge

**MERGE_NOW approved with guarded rollout** — rebase-and-merge after all gates pass.

## Required Artifacts Attached ✅
- [ ] `backups/*.zip` + matching `.sha256` files
- [ ] `deploy/migrate/monitor` logs (dry-run outputs)
- [ ] Smoke-test logs (`postdeploy-smoketests.log`)
- [ ] `premerge_artifacts/` directory with CI run links
- [ ] `monitor_logs/` directory with baseline metrics
- [ ] Test logging outputs (`test_logging.log`)

## CI and Quality Gates ✅
- [ ] **Premerge GitHub Actions passed** for all platforms (`.github/workflows/premerge.yml`)
- [ ] All platform-specific tests green (Linux, macOS, Windows)
- [ ] Golden baseline checks passed
- [ ] Audio compliance verified
- [ ] Container format validation complete

## Branch Protection & Reviews ✅
- [ ] **Branch protection enabled**: requires premerge CI contexts + 2 approvers (≥1 Ops/SRE)
- [ ] **Deploy operator sign-off**: @ops approval obtained
- [ ] **Media engineering review**: @media-eng validation complete
- [ ] Required reviewers assigned (Ops/SRE team)

## Security & Backup Verification ✅
- [ ] **Latest backup verified locally/CI**: `sha256sum -c "${LATEST_BACKUP}.sha256"`
- [ ] **Notification secrets configured** in GitHub Actions secrets (no webhooks/keys in repo)
- [ ] Rollback procedures tested and documented
- [ ] Quality gates thresholds configured appropriately

## Deployment Strategy ✅
- [ ] **Guarded rollout planned**: T+60 monitoring with auto-rollback
- [ ] Production deployment script ready (`./quick-deploy.sh --env production`)
- [ ] Dry-run validated in staging environment
- [ ] Notification channels configured and tested

## Post-Merge Actions (for Deploy Operator)
- [ ] Execute production deploy with monitoring
- [ ] Confirm T+60 monitoring activates automatically  
- [ ] Collect 24-72h telemetry for threshold tuning
- [ ] Update artifact retention policy if needed
- [ ] Create incident report if auto-rollback triggers

---

**Merge Instructions**: Use rebase-and-merge for linear history. Do not merge until ALL checklist items are complete and @ops sign-off is present.

**Deploy Command**: `./quick-deploy.sh --env production` (includes automatic T+60 monitoring)

**Emergency Rollback**: `./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force`