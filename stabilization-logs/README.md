# CI Stabilization Watch

## Overview
This directory contains monitoring logs for the 72-hour stabilization period following the branch protection rollout.

## Monitoring Period
- **Start:** 2024-10-04 (Branch protection applied)
- **Duration:** 72 hours
- **End:** 2024-10-07

## Monitored Contexts
The following six CI contexts are being tracked on every merge to main:

1. `build-and-qa (macos-latest)`
2. `build-and-qa (ubuntu-latest)` 
3. `build-and-qa (windows-latest)`
4. `Golden checks (macos-latest)`
5. `Golden checks (ubuntu-latest)`
6. `Golden checks (windows-latest)`

## Log Format
Daily log files are created in the format: `ci-health-YYYYMMDD.log`

Each entry contains:
- Timestamp (UTC)
- Commit SHA
- Workflow name and conclusion
- Status of each expected context (HEALTHY/MISSING/FLAKY)
- Any unexpected contexts (EXTRA)
- Anomaly detection result

## Anomaly Response
When anomalies are detected:
1. An issue is automatically created with label `ci-anomaly`
2. The issue includes detailed analysis and remediation steps
3. Manual investigation is triggered
4. Rollback procedures may be initiated if needed

## Success Criteria
- All six contexts must pass on every merge to main
- No flaky behavior or missing contexts
- No regressions in CI reliability
- Clean logs for the full 72-hour period

## Files
- `ci-health-YYYYMMDD.log` - Daily monitoring logs
- `README.md` - This documentation
- Logs are automatically committed by the stabilization-monitor workflow

---
*Monitoring active until 72-hour stabilization period completes*