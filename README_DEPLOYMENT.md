# Deployment Framework - Quickstart

Run:
  ./scripts/deploy/premerge_orchestration.sh --env staging
  ./scripts/deploy/deploy_dryrun.sh --env staging
  MONITOR_DURATION=3600 AUTO_ROLLBACK=true ./scripts/deploy/monitor.sh --env production &
