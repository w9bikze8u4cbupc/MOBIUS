# MOBIUS 2.0 Persistence and Remotion Implementation Tasks (v1)

**Status:** Proposed execution sequence. Do not begin these tasks solely from this document; implementation requires a follow-up request and normal review/PR workflow.

## Delivery rules

- Execute Task 1 completely before wiring any backend Remotion path.
- Keep PRs small and coherent. Do not combine data-store migration, renderer selection, a large UI rewrite, and LLM changes.
- Use local/static fixtures and mocked renderer/LLM/TTS boundaries. Do not make paid or external API requests in tests.
- Preserve the existing FFmpeg renderer as the default and a tested rollback path until an explicit promotion decision.
- Add exact dependency versions only after confirming package compatibility; inspect the lockfile and CI support before committing them.

## Phase 0 — Establish contracts and seams

- [ ] 0.1 Capture a baseline test report for current persistence, render-config, executor, storyboard-renderer, real-MP4/FFprobe, packaging, and CI smoke tests.
- [ ] 0.2 Add proposed versioned JSON contracts under `docs/spec/` for the canonical project record and renderer-neutral render-job input. Define compatibility, schema versioning, IDs, revisions, required asset descriptors, error codes, and public/private fields.
- [ ] 0.3 Add contract fixtures for: legacy persisted project, renderable persisted project, incomplete project, missing required image, missing required audio, and a minimal deterministic tutorial scene document.
- [ ] 0.4 Define the server-owned renderer selection policy and the success/failure semantics for packaging, artifact publication, and status exposure. Document the intended FFmpeg default and Remotion rollback setting.

**Exit criteria:** contracts validate their fixtures, no implementation behavior changes, and reviewers agree on the project ID/revision and asset-resolver boundaries.

## Phase 1 — Task 1: persistence repository and migration

- [ ] 1.1 Inventory all callers of `src/api/db.js`, `/save-project`, `/load-project/:id`, `getProjectState`, and `setProjectState`. Mark production versus test-only use before replacing any interface.
- [ ] 1.2 Implement an injected asynchronous `ProjectRepository` interface and a local `JsonProjectRepository`. Remove application reliance on ignored SQL strings while retaining a narrowly scoped compatibility shim only if an unconverted caller requires it.
- [ ] 1.3 Implement canonical record normalization and legacy `{ projects, nextId }` migration. Normalize IDs to opaque strings at service/render boundaries while preserving the legacy response ID shape during the compatibility window.
- [ ] 1.4 Implement serialized, atomic JSON persistence: same-directory temporary write, flush, promotion, and typed error handling. Define last-known-good backup/recovery behavior. Do not silently reset a corrupt data file.
- [ ] 1.5 Add isolated temporary-directory repository tests for create/find, restart durability, legacy migration, unsupported schema/corruption, duplicate/invalid IDs, failed write promotion, and deterministic ID behavior.
- [ ] 1.6 Introduce project DTO validation, input-size limits, stable errors, and public response mapping. Update `/save-project` and `/load-project/:id` to use the service/repository while preserving the existing success envelope.
- [ ] 1.7 Apply one explicit gateway authentication/authorization policy to save and load. Remove inconsistent route-local authentication only after proving the shared middleware protects both routes. Ensure errors disclose neither raw store details nor filesystem paths.
- [ ] 1.8 Refactor app/server construction enough to configure a temporary repository and authentication test configuration without starting the production listener.
- [ ] 1.9 Add real HTTP integration coverage against the registered Express routes: save, load by returned ID, reinitialize/restart repository, and load again. Include malformed payload, unauthenticated/unauthorized, not-found, and persistence-failure paths. Delete or replace the copied-handler test in `tests/api/save-project.test.ts` once equivalent real-route coverage exists.

**Exit criteria:** a canonical saved project is durable and readable through the actual API after reinitialization; legacy clients still receive the documented success response; persistence tests cannot touch the default developer data store.

## Phase 2 — Task 1: connect persisted project state to rendering

- [ ] 2.1 Implement a repository-backed `RenderProject` read model that validates ingestion/storyboard manifests, project revision, logical asset bindings, audio tracks, and renderability.
- [ ] 2.2 Implement an allowlisted `AssetResolver` that maps logical IDs/storage keys to renderer-readable paths. It must reject traversal, out-of-root assets, unbound IDs, and missing required media; it must not trust a client-supplied path.
- [ ] 2.3 Update `buildRenderJobConfig` to retain required scene visual references, overlays, captions/narration, audio descriptors, asset fingerprints, and contract version rather than reducing the data to IDs/durations only.
- [ ] 2.4 Replace production use of `projectStateStore` in `/api/render-job-config` and the project-ID branch of `/api/render` with the repository-backed read model. Retain a test-only Map helper only if necessary and document its non-authoritative status.
- [ ] 2.5 Decide and implement the direct `config` request policy: remove it from public use or validate its contract, bind it to an authorized project/revision, and reject an asset/config bypass.
- [ ] 2.6 Update render-job status/manifest output to remove internal config and output filesystem paths. Make artifact-packaging failure a documented non-success terminal state or a fully valid degraded state, with matching queue behavior.
- [ ] 2.7 Add integration tests that persist a complete project, request `/api/render-job-config` by the returned project ID, and enqueue a dry-run render. Assert the same project/revision and resolved required assets reach the renderer adapter. Add missing/incomplete/unresolved-asset rejection tests.
- [ ] 2.8 Run existing render-config, queue, executor, dry-run, storyboard renderer, and operator smoke tests. Update snapshots/fixtures only for intentionally versioned contract changes.

**Exit criteria:** persisted state, not process memory, is authoritative for project-based rendering; restart does not disconnect a renderable project; the FFmpeg path receives a complete validated config or fails explicitly.

## Phase 3 — Task 2: build the isolated Remotion package

- [ ] 3.1 Confirm Node, React, TypeScript/build tooling, CI runner, browser/runtime, and license compatibility for a single exact Remotion version family. Record the decision and add pinned dependencies to the new package only.
- [ ] 3.2 Create `renderers/remotion/` with its package manifest, composition root, configuration, source layout, licensed deterministic font assets, and local test fixtures. Do not add it to the CRA client unless a later explicit decision requires that integration.
- [ ] 3.3 Implement schema validation and conversion from the renderer-neutral contract to `MobiusTutorialInput`. Calculate contiguous integer frames from FPS and declared durations using a documented rounding rule.
- [ ] 3.4 Implement `MobiusTutorial`, `TutorialScene`, theme/border, safe-area split layout, title/narration/subtitle display, aspect-ratio-safe image panel, and controlled `fade`/`none` transitions.
- [ ] 3.5 Implement scene audio with deterministic offsets and trim behavior. Validate local dummy MP3 duration in fixtures; reject missing required audio/media outside explicit test mode.
- [ ] 3.6 Add unit/component tests for frame calculations, scene sequencing, long/narrow text, theme defaults, optional vs required media, audio offsets, and contract rejection. Use hardcoded JSON and local dummy assets only.
- [ ] 3.7 Add a mocked render-entry-point test verifying renderer invocation parameters, deterministic output metadata, progress conversion, and error handling without launching a browser renderer.

**Exit criteria:** the isolated package validates and composes a deterministic tutorial scene with local mock audio/image fixtures; no backend API behavior or renderer default changes yet.

## Phase 4 — Task 2: backend adapter and controlled rollout

- [ ] 4.1 Refactor `src/api/renderExecutor.js` into an internal renderer registry while preserving the public queue/job/artifact contract and the existing FFmpeg storyboard backend behavior.
- [ ] 4.2 Implement the `RemotionRenderer` adapter. It must receive only a validated prepared request, stage/resolve approved assets, invoke the Remotion rendering API, stream bounded progress, and return the standard result/artifact metadata.
- [ ] 4.3 Add server-owned `RENDER_BACKEND` allowlisting with `ffmpeg-storyboard` as the initial default. Preserve legacy command/entrypoint configuration only through a documented, tested compatibility path; never translate request data into a shell command.
- [ ] 4.4 Add adapter tests with an injected/mock Remotion render API for bad contracts, unresolved assets, progress, renderer errors, output verification, and packaging failures.
- [ ] 4.5 Add a deterministic offline Remotion MP4 smoke test using the repository fixture. Validate stream presence, dimensions, FPS, duration tolerance, audio presence, and artifact manifest metadata. Define CI prerequisites/conditional policy explicitly.
- [ ] 4.6 Run the same fixture through FFmpeg and Remotion. Compare contract identity, timeline duration tolerance, artifact publication, and required audio/image presence; keep visual comparison bounded to stable assertions appropriate for differing engines.
- [ ] 4.7 Add operational documentation: renderer-selection environment variables, static asset/font requirements, CI/browser prerequisites, monitoring fields, failure diagnosis, and rollback to `ffmpeg-storyboard`.
- [ ] 4.8 Enable Remotion only in an approved non-production/staging policy. Collect evidence before requesting a separate change to the default renderer.

**Exit criteria:** a renderable persisted project can produce a standard job/artifact result via the Remotion adapter using only local fixture assets; FFmpeg remains default and can be restored with configuration alone.

## Final validation checklist

- [ ] Run targeted repository/API integration tests for Phase 1 and Phase 2.
- [ ] Run renderer-neutral contract validation and all Remotion unit/adapter tests.
- [ ] Run existing FFmpeg storyboard dry-run and real-MP4/FFprobe tests where platform prerequisites are installed; report platform-specific conditional results explicitly.
- [ ] Run package-level lint/type/build checks for each affected package and the project’s relevant CI smoke command.
- [ ] Confirm no test invoked paid/external LLM, TTS, image, or metadata APIs.
- [ ] Confirm `/save-project` legacy response compatibility, load/render identity alignment, no internal paths in public responses, artifact integrity, and FFmpeg default/rollback behavior.
- [ ] Review the final diff as separate Task 1 and Task 2 PR-sized units; do not merge a default-renderer switch with initial Remotion adoption.
