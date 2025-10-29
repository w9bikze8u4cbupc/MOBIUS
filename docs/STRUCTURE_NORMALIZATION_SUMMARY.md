# Structure Normalization Summary

## Documentation Consolidation
- Migrated legacy deployment and troubleshooting guides into the new `docs/` directory:
  - `PHASE_F_PREVIEW_WORKER_COMPLETE_DEPLOYMENT_READY.md`
  - `PHASE_F_PREVIEW_WORKER_DEPLOYMENT_READY.md`
  - `PREVIEW_WORKER_DEPLOYMENT_GUIDE.md`
  - `PREVIEW_WORKER_DEPLOYMENT_READINESS_SUMMARY.md`
  - `PREVIEW_WORKER_PRE_COMMIT_CHECKLIST.md`
  - `PREVIEW_WORKER_TROUBLESHOOTING_GUIDE.md`
  - `STRICTER_PROTECTION_ROLLBACK_PLAN.md`
- Added a root-level `CHANGELOG.md` to track sprint increments going forward.

## Application Layout Updates
- Standardized UI assets under `apps/board-game-video-generator/` to align with the multi-app structure introduced this sprint.
- Created `apps/api-gateway/` for the Node gateway and `services/ingest-py/` for the FastAPI ingest service skeleton.

## Next Steps
- Audit the relocated documents to ensure internal links (if any) still resolve correctly.
- Extend the changelog with dated entries as new sprints complete.
