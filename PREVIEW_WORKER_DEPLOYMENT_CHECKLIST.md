# Preview Worker Deployment Checklist

This checklist ensures each Preview Worker release captures observability and security outcomes while keeping planning artifacts up to date.
Complete every item before declaring the release done.

## 1. Pre-Deployment Validation
- [ ] Image tag updated and manifests reviewed (`k8s/preview-worker/`)
- [ ] Test suites executed (`npm run test:preview-payloads`, `npm test`, `npm run lint --if-present`)
- [ ] Kubernetes dry-run validation completed (`kubectl apply --dry-run=client -f k8s/preview-worker/`)
- [ ] Secrets and config verified (no plaintext credentials committed)

## 2. Deployment Execution
- [ ] Manifests applied to target environment (`kubectl apply -n preview-worker -f k8s/preview-worker/`)
- [ ] Smoke tests executed (health check, job submission, metrics endpoint)
- [ ] Alerts and dashboards monitored during rollout window

## 3. Observability & Security Logging
- [ ] Generate a Phase H director log using `docs/director_logs/phase_h_template.md`
  - Capture latency (P95/P99), error rates, and cache hit ratios
  - Document notable alerts/incidents and mitigation status
- [ ] Summarize current security posture (vulnerability scans, access audits)
- [ ] Attach supporting dashboards or query links to the log entry

## 4. Planning Feedback Loop
- [ ] File or update planning tickets for any observability or security findings
- [ ] Link director log outcomes to backlog items or retrospectives
- [ ] Assign owners and due dates for remediation tasks before closing the release

## 5. Reporting Cadence
- [ ] Schedule/update the weekly director log event in project management tooling (e.g., recurring Jira ticket, Asana task)
  - Reference `docs/director_logs/phase_h_template.md` in the task description for consistency
  - Include checklist items for metric collection and security review sign-off
- [ ] Confirm upcoming cadence instances have assigned owners

## 6. Release Sign-off
- [ ] Stakeholders acknowledge the director log and remediation assignments
- [ ] Release artifacts archived (logs, dashboards, runbook links)
- [ ] Post-release monitoring window completed without regressions

Once all items are checked, record the completion date and link this checklist in the project management record for traceability.
