Monitoring & telemetry to watch post-release

Key signals:
- Frontend errors (Sentry or console error rate spike)
- Uncaught exceptions in API calls that reference tutorial feature
- Increase in frontend bundle size (build step should catch; still monitor)
- User reports of missing UI or accidental debug messages

Dashboards / Alerts:
- Error count > baseline + 25% in 1 hour → page on-call
- Any high-severity error mentioning "TutorialOrchestrator" or env helper → immediate triage

Logs:
- Check server-side logs for any unexpected reads/writes to tutorial flags
- Check client console errors in staging & production

Roll-forward/rollback window: monitor closely for 24–72 hours after merge.