# Deployment Runbook

Purpose: Step-by-step runbook for guarded MOBIUS deployments.

Essentials:
- Ensure PR has required artifacts and approvals.
- Run premerge_orchestration.sh and attach artifacts to PR.
- Deploy operator responsibilities: execute deploy, start monitor, watch T+60 window.
