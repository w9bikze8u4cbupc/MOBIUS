# OPS2 Sanitization Restoration Plan

## Objective
Restore deterministic HTML sanitization in the Preview Worker surfaces using `DOMPurify`, ensuring parity across Node.js rendering and React client previews once registry access is re-enabled.

## Patch Outline
- **New Utility**: Introduce `src/utils/sanitizer.ts` exporting `sanitizeHtml(raw: string, config?: DOMPurify.Config): string` with a locked-down default profile (`ALLOWED_TAGS`, `ALLOWED_ATTR` aligned to support bold, italics, links, and code blocks only).
- **Server Integration**: Replace ad-hoc escaping inside `src/services/rendering/htmlRenderer.ts` with the new sanitizer. Enforce the sanitizer before persisting or emitting HTML payloads.
- **Client Integration**: Wrap any `dangerouslySetInnerHTML` usage in `client/src/App.js` with the same sanitizer via a lightweight adapter (`client/src/utils/sanitize.ts` importing the shared sanitizer through the existing bundler alias or a small bridge module compiled via Vite/Webpack alias `@shared/sanitizer`).
- **Configuration Lock**: Persist sanitizer configuration JSON at `config/sanitizer-profile.json` to allow checksum validation and audit trails.

## Implementation Steps
1. **Library Install**
   ```bash
   npm install dompurify jsdom --workspace=src
   npm install dompurify --workspace=client
   ```
2. **Shared Wrapper**
   - Create `src/utils/sanitizer.ts` that hydrates DOMPurify with a server-side JSDOM instance and exports `sanitizeHtml` plus an idempotent `getSanitizerDigest()` (SHA-256 of the profile) for evidence logging.
   - Export the same API via `client/src/utils/sanitize.ts`, delegating to DOMPurify initialized in the browser.
3. **Usage Updates**
   - Apply the sanitizer in `src/api/controllers/previewController.ts` before returning HTML responses.
   - Ensure all templates or markdown renderers pass through `sanitizeHtml`.
4. **Deterministic Logging**
   - Emit structured logs `{ event: "sanitizer.applied", digest, inputBytes, outputBytes }` to satisfy the fail-fast policy.

## Regression Test Suite
### Bash (`scripts/test-sanitizer.sh`)
```bash
#!/usr/bin/env bash
set -euo pipefail
node ./tests/sanitizer/run.js --fixture ./tests/sanitizer/fixtures/xss-basic.json
node ./tests/sanitizer/run.js --fixture ./tests/sanitizer/fixtures/markdown-safe.json
```
- Fails if sanitized output deviates from checked-in goldens under `tests/sanitizer/goldens/*.html`.

### PowerShell (`scripts/test-sanitizer.ps1`)
```powershell
#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"
node ./tests/sanitizer/run.js --fixture ./tests/sanitizer/fixtures/xss-basic.json
node ./tests/sanitizer/run.js --fixture ./tests/sanitizer/fixtures/markdown-safe.json
```
- Mirrors the bash script and streams JSON logs for deterministic review.

### Node Test Harness
- Implement `tests/sanitizer/run.js` to load fixture payloads, run them through `sanitizeHtml`, and compare against the goldens.
- Output a machine-readable summary (`sanitizer-regression-report.json`) and append entries to `logs/sanitizer-regressions.ndjson`.

## Evidence Packaging
- Publish `evidence/ops2/sanitizer-manifest.json` containing:
  - Sanitizer profile checksum
  - Test script versions (git commit, file hash)
  - Pass/fail results with timestamps
- Generate `evidence/ops2/sanitizer-manifest.json.sha256`.
- Archive regression outputs in `evidence/ops2/sanitizer-regression-artifacts.zip` (tests, logs, digests).

## Deployment Playbook Hook
- Update the deployment checklist to reference the sanitizer test scripts.
- Require both bash and PowerShell scripts to pass before merge approval when registry access is restored.
