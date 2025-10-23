# Evidence Intake Runbook

All artifact handling now flows through `ops/evidence-intake/`. The legacy
`evidence/` directory has been removed from circulation to prevent duplication.

1. Check the [Readiness Delta Register](readiness-delta-register.md) for the latest
   acknowledgement/poll timestamps and guardrails.
2. Open the stream-specific template under `ops/evidence-intake/` and log the
   "Received on" and "Validated by" fields immediately when artifacts arrive.
3. Follow the checklist inside each template and record steps in the validation
   log.
4. Update the register and readiness score once validation completes; note any
   deviations in the template's Notes section.
5. If a cadence is missed twice, send the prepared message in
   [`ops/missed-cadence-escalation-template.md`](missed-cadence-escalation-template.md)
   after adjusting the timestamps.
