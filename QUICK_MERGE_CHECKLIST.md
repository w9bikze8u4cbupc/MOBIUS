# Quick Merge Checklist — MOBIUS DHash / Media Pipeline (TL;DR)

**For Reviewers:** Essential gates before approval. Full checklist: [PR_MERGE_CHECKLIST.md](./PR_MERGE_CHECKLIST.md)

## Core Requirements ✅

### CI & Build
- [ ] **All platforms green:** Ubuntu/macOS/Windows CI passes ([CI link])
- [ ] **Tests pass:** `npm test` ✅
- [ ] **Golden files:** SSIM ≥ 0.995, audio ±1 dB via `npm run golden:check` ✅

### Code Quality
- [ ] **Lint clean:** ESLint/Prettier applied ✅
- [ ] **No regressions:** Existing functionality unaffected ✅
- [ ] **Documentation updated** if APIs/workflows changed ✅

### Data Safety (if applicable)
- [ ] **Migration dry-run:** Artifacts attached if data changes ✅
- [ ] **Backup plan:** Documented for data-affecting changes ✅
- [ ] **Rollback tested:** `scripts/rollback_dhash.sh` verified ✅

### Approvals
- [ ] **2+ approvals required** ✅
- [ ] **Ops approval** for deployment-impacting PRs ✅
- [ ] **All review comments addressed** ✅

---

## Quick Commands

```bash
# Validate golden files
npm run golden:check

# Individual game validation  
npm run golden:check:sushi && npm run golden:check:loveletter

# Test suite
npm test

# JUnit reporting (if needed)
npm run golden:check-with-junit
```

## Artifact Requirements
- [ ] **CI artifacts uploaded** via GitHub Actions
- [ ] **Preview renders attached** (if media changes)
- [ ] **Migration logs attached** (if applicable)
- [ ] **SHA256 checksums** for backups (production deploys)

## Final Merge Steps
1. [ ] **Branch up-to-date** with target
2. [ ] **No force-pushes** after final approval
3. [ ] **Merge strategy confirmed:** rebase-and-merge (preferred)
4. [ ] **Labels applied:** `media/pipeline`, `ci-ready`, etc.

---

## Emergency Contacts & Runbooks
- **Rollback:** `scripts/rollback_dhash.sh`
- **Health checks:** `/health`, `/metrics/dhash`
- **Incident response:** Collect artifacts + notify on-call

**⚠️ For deployment-impacting PRs:** Verify backup creation and maintenance window scheduling before merge.