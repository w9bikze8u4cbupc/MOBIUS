# OPS2 Sanitization Restoration Blueprint

## Objective
Restore DOMPurify-backed sanitization for preview surfaces while ensuring regression coverage and deployment coordination across platforms.

## Scope & Deliverables
- Reinstate DOMPurify helper implementation within the preview worker client and server renderers.
- Provide dual-platform regression automation (web + worker) validating sanitization paths and encoding fallbacks.
- Package evidence artifacts (test logs, coverage deltas, sanitized payload comparisons) for OPS2 sign-off.
- Wire deployment hooks so sanitization checks run during staging and production pushes.

## Workstreams
1. **DOMPurify Helper Reinstatement**
   - Rehydrate the shared sanitizer module with DOMPurify 3.x pinned dependencies.
   - Re-enable integration points in rendering pipelines and add guardrails for future upgrades.
2. **Regression Automation**
   - Extend existing preview payload test suites to assert sanitized output across browser and worker runtimes.
   - Add CI jobs for both Node.js and browser-based harnesses, reporting into OPS2 dashboards.
3. **Evidence Packaging**
   - Capture before/after payload diffs and attach DOMPurify configuration manifests.
   - Archive automation run logs with checksums for traceability.
4. **Deployment Hooks**
   - Insert sanitization smoke tests into pre-deploy scripts and GitHub Actions workflows.
   - Notify OPS2 duty channel on success/failure with links to archived artifacts.

## Timeline & Ownership
- **DRI**: OPS2 lead (Nguyen)
- **Kickoff**: Immediately upon approval of this blueprint
- **Target Completion**: Within the current sprint window (5 business days)
- **Checkpoints**: Daily stand-up sync, mid-sprint validation review, final OPS2 acceptance meeting
