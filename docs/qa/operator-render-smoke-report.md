# Operator Render Smoke Report

## Stack Under Test

| PR | Branch | Scope |
|---|---|---|
| #395 | `feature/real-scene-renderer-foundation` | Renderer + roadmap |
| #396 | `feature/wire-real-renderer-entrypoint` | Backend wiring |
| #397 | `feature/api-render-preview-dry-run-verification` | Dry-run integration |
| #398 | `feature/real-mp4-render-smoke-verification` | Real MP4 smoke (FFmpeg-gated) |
| #399 | `feature/ui-render-export-real-backend-path` | UI connection |
| This | `test/e2e-operator-render-smoke` | E2E operator validation |

## Smoke Method

Deterministic backend E2E test simulating the operator UI workflow:

1. Load fixture rulebook + BGG metadata (same as CI ingestion fixtures)
2. Run ingestion pipeline → produces ingestion manifest
3. Generate storyboard from ingestion → produces scene list
4. Build render job config (same path as UI "Generate config" button)
5. Enqueue render job (same path as UI "Start render" button)
6. Poll for completion (same path as UI status polling)
7. Assert renderer diagnostics are visible (same fields UI displays)
8. Assert persisted config is valid and consumable by the renderer

## Environment

- RENDERER_DRY_RUN=true (no FFmpeg required for operator path validation)
- Default storyboard renderer (no RENDERER_COMMAND/RENDERER_ENTRYPOINT)
- Real MP4 generation is validated separately in PR #398 tests (FFmpeg-gated)

## Commands

```bash
# Run operator smoke test
npx jest --ci --forceExit --testPathPattern="operator_render_smoke"

# Run full render test suite
npx jest --ci --forceExit --testPathPattern="operator_render_smoke|render_preview_dry_run|render_executor_storyboard|storyboard_ffmpeg_real_mp4|storyboard_ffmpeg_renderer"

# Run full non-Elite regression
npx jest --ci --forceExit --testPathIgnorePatterns="eliteVerifierSkeleton\.test\.mjs$"
```

## Result

- **Full operator render flow**: PASS
- **Renderer diagnostics visible**: PASS (isStoryboardRenderer, configPath, outputFilePath)
- **Config persistence**: PASS (written to job output dir, valid JSON, correct scenes)
- **Placeholder fallback**: PASS (incomplete config produces placeholder scene)
- **Artifact metadata**: PASS (resultPaths array available for UI display)
- **No RENDERER_COMMAND_NOT_CONFIGURED**: CONFIRMED

## Operator Experience (What the UI Shows)

After clicking "Start render" with project data:

1. **Status**: queued → running → completed
2. **Renderer**: "storyboard-ffmpeg (real)"
3. **Config path**: `/path/to/job-output/<jobId>-config.json`
4. **Output path**: `/path/to/job-output/<jobId>-preview.mp4`
5. **Artifacts**: list of files in output directory
6. **Error**: displayed inline if render fails

## Remaining Blockers for Professional Output

| Priority | Blocker | Impact |
|---|---|---|
| High | Real images not yet in render scenes | Visual quality |
| High | TTS audio not yet in render scenes | Narration |
| Medium | No text overlay styling/branding | Professional look |
| Medium | No transitions between scenes | Polish |
| Low | No thumbnail/poster generation | YouTube readiness |

## Next Step

Phase 3: Image pipeline reliability — ensure real component/BGG images are available as local assets that the renderer can composite into scenes.
