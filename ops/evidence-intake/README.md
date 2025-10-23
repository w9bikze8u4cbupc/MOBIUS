# Evidence Intake Hub

This directory holds intake templates for every external dependency stream tied to the 720/1000 readiness posture. Each stream has a dedicated file with pre-created drop zones so operators can document artifacts the moment they arrive.

## Usage

1. When evidence arrives, open the relevant stream file.
2. Record the delivery metadata under **Received on** and the validation metadata under **Validated by**.
3. Link or attach the actual artifact in the same section so the audit trail stays co-located with the register in `ops/readiness-delta-register.md`.
4. Update the register status column to reflect any new risk posture.

## Git Hygiene Check

The repository `.gitignore` excludes build outputs, secrets, and binary clutter but does **not** block typical evidence formats (PDF, CSV, DOCX, PNG). Evidence files stored here will therefore be tracked without needing ignore rule updates.
