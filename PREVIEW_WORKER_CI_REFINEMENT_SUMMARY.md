# Preview Workflow CI Refinement Recap

## Canonical Preview Normalization
- Preview artifact normalized to `out/preview_with_audio.mp4`.
- Preview rendering executed from repository root via `npm --prefix client run render:preview`.

## Audio Verification Simplification
- Removed redundant EBUR128 invocations.
- True peak (`peak=true`) configuration enforced for audio loudness checks.

## Artifact Path Consistency
- Artifact manifest limited to a single `out/preview_with_audio.mp4` entry with trailing newline.

## Cross-Platform Stability
- Windows jobs migrated to PowerShell Core (`pwsh`).
- Path and working directory parity confirmed across Linux, macOS, and Windows runners.

## CI Workflow Hardening
- Added guarded exits for missing preview outputs (e.g., `if [ -f client/out/preview.mp4 ]`).
- Introduced explicit copy normalization to avoid preview mismatches.

## Branch Status
- Commit `08c52ab` ("Refine preview rendering pipeline in CI") validated and ready to merge pending golden baseline confirmation.

## Outcome
- CI preview path stabilized across operating systems.
- Audio analysis unified and deterministic.
- Artifact manifest now reproducible and golden-comparison ready.

## Next Steps
- Remove placeholder comments.
- Verify artifact duplication cleanup.
- Begin Phase PR-18 – Golden Validation Matrix integration.
