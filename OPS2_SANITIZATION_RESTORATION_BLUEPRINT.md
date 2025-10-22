# OPS2 Sanitization Restoration Blueprint

This blueprint defines the restoration plan for OPS2 sanitization safeguards with a focus on DOMPurify reintroduction, regression automation, evidence packaging, and deployment gating hooks.

## DOMPurify Implementation Path
- Reinstate `dompurify` at version `3.0.3` in `client/package.json` and lock via `package-lock.json` regeneration.
- Wrap all user-generated HTML render paths (`src/components/PreviewRenderer.tsx`, `src/components/PreviewSandbox.tsx`) with a shared sanitizer helper that enforces `{ USE_PROFILES: { html: true } }`.
- Add unit coverage asserting sanitizer invocation for preview payloads, and snapshot tests to capture expected sanitized output for high-risk payloads (script tags, inline event handlers, CSS expressions).
- Document sanitizer configuration and escalation flow in `PREVIEW_WORKER_TROUBLESHOOTING_GUIDE.md` under a new “Sanitization” section.

## Dual-Platform Regression Scripts
- Extend `scripts/verify-preview-worker-deployment.sh` and `.ps1` with a `--sanitization-suite` flag that executes the sanitization regression matrix.
- Matrix inputs:
  - `payloads/sanitization/script-injection.json`
  - `payloads/sanitization/style-injection.json`
  - `payloads/sanitization/attribute-poison.json`
- Emit structured JSON results to `artifacts/sanitization/regression-report.json` and mirror to PowerShell equivalent path.
- Gate failures with non-zero exit codes to prevent promotion.

## Evidence Packaging
- Capture DOMPurify version, helper checksum, regression reports, and CI job URL into an OPS2 evidence bundle (`evidence/ops2-sanitization/`).
- Sign the bundle with the OPS2 service key and upload to the immutable audit bucket with retention matching Phase F policies.
- Record bundle metadata (hash, timestamp, author) in the deployment ledger entry `OPS2-Restore-001`.

## Deployment Hooks
- Inject a pre-deploy hook in the CI workflow (`.github/workflows/preview-worker-build-push.yml`) that requires the latest OPS2 evidence bundle digest.
- Add a post-deploy verification step invoking the `--sanitization-suite` regression for the deployed environment and compare results to pre-deploy baseline.
- Notify the OPS2 on-call channel via webhook with the regression diff and evidence bundle link upon completion.
