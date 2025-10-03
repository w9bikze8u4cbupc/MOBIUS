Monitoring checklist (first 24–72 hours post-merge)

1) CI & Build
   - Monitor CI for unexpected failures on subsequent PRs

2) Error & Performance Monitoring
   - Watch Sentry / Datadog / NewRelic for new exceptions originating around TutorialOrchestrator
   - Ensure no spike of client-side errors tied to the change

3) Client logs / Console
   - Verify no debug logs leak into production
   - Check for repeated warnings or deprecation messages

4) UX Regression
   - Verify primary user journeys are intact (login, dashboard, tutorial flows)
   - Confirm lazy-loaded chunks still load normally

5) Rollback readiness
   - Ensure rollback PR procedure is documented and team knows how to trigger it quickly