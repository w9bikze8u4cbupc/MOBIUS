# Readiness Delta Register

**Readiness posture:** 720 / 1000 — pending validation of inbound artifacts.

This ledger tracks the acknowledgement and polling cadence for every external
stream. Operators now have a single intake path at `ops/evidence-intake/` and
should retire any references to the legacy `evidence/` directory.

| Stream | External Owner | Last Acknowledgement (PT) | Last Poll (PT) | Next Follow-up (PT) | Guardrails | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Payments Gateway Uplift | Riley Chen (Acme Pay) | 2024-05-20 09:05 | 2024-05-20 12:30 | 2024-05-21 09:00 | Slack `#acme-pay-integrations`, email `payments@acmepay.com` — async only between 20:00-06:00 PT | Artifact: merchant routing diff. Intake template: [`ops/evidence-intake/payments-gateway.md`](evidence-intake/payments-gateway.md). Ticket PAY-4821. |
| Messaging Relay Hardening | Priya Desai (SignalBridge) | 2024-05-20 08:40 | 2024-05-20 13:15 | 2024-05-21 08:30 | Slack `#signalbridge-sre` with CC to `ops@signalbridge.io`. Phone escalation allowed after two missed cadences. | Artifact: signed load-test bundle. Intake template: [`ops/evidence-intake/messaging-relay.md`](evidence-intake/messaging-relay.md). Ticket MSG-7719. |
| Identity Proofing Retrofit | Omar Lewis (TrueID) | 2024-05-20 10:20 | 2024-05-20 14:45 | 2024-05-21 10:00 | Email `omar.lewis@trueid.com` first; escalate in Teams `TrueID × Mobius` thread if >30m delay. | Artifact: verification policy diffs. Intake template: [`ops/evidence-intake/identity-proofing.md`](evidence-intake/identity-proofing.md). Ticket IDV-6394. |

### Operator Actions

- Log every acknowledgement or poll in this table immediately after it occurs.
- Deposit artifacts only via the stream templates under `ops/evidence-intake/`.
- Update the readiness score once validation is complete for each artifact set.

### Directory Consolidation Note

The former `evidence/` directory has been decommissioned. All historical
references in runbooks, stand-up notes, and communications now point to
`ops/evidence-intake/` to ensure a single authoritative intake path.
