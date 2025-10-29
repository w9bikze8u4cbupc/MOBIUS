# Launch Ops Update – April 12, 2025

## Staging Posture
- Staging reflects readiness uplift configuration with preview worker autoscaling enabled.
- Outstanding infra ticket **CR-2025-119** is tracked for firewall alignment; mitigation window secured.

## Deploy Plan
- **Window:** 2025-04-15 01:00–03:00 UTC
- **Change ticket:** PW-2025-0415
- **Target branch:** `release/pw-r42`
- **Rollback:** Revert to `release/pw-r41` snapshot and disable autoscaling guardrails if parity drifts.

## On-call Coverage
- Primary: Dana Ortiz (launch-ops)
- Secondary: Alex Singh (platform engineering)
- Pager escalation documented with readiness uplift command center.

## Notes
- Cross-referenced with the April 12 stand-up agenda and readiness delta register for audit continuity.
