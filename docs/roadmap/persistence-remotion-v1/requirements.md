# MOBIUS 2.0 Persistence and Remotion Requirements (v1)

**Status:** Proposed implementation specification
**Date:** 2026-06-18
**Scope:** Strategic Task 1 (persistence and render-state alignment) and Task 2 (additive Remotion renderer). This document is planning only; it does not authorize implementation.

## 1. Verified baseline

The current checkout already contains `src/api/db.js`. It is a synchronous, file-backed JSON shim that accepts SQL-shaped calls but always appends to an in-memory `projects` array and rewrites `data/projects.json`. It is not SQLite. `POST /save-project` and `GET /load-project/:id` use that shim.

Render configuration is not loaded from that persisted project. `src/api/renderJobConfig.js` instead reads a process-local `projectStateStore` Map. No production writer connects `/save-project` to that Map, so a saved project cannot reliably be rendered by project ID and render state is lost at restart. The default renderer remains `scripts/render-storyboard-ffmpeg.mjs`; the repository has no Remotion dependency, composition, or configuration.

The implementation must correct those verified gaps. It must not create a second `db.js`, replace FFmpeg immediately, or treat a placeholder render as proof that source images, audio, or captions are connected.

## 2. Goals and non-goals

### Goals

1. Make project persistence durable, validated, and usable as the single source of truth for render-project configuration.
2. Preserve the existing `/save-project` and `/load-project/:id` compatibility surface while replacing the SQL-shaped persistence coupling with an explicit repository interface.
3. Add Remotion as a selectable renderer beside the current FFmpeg renderer, using a deterministic, versioned scene input contract.
4. Deliver a base MOBIUS tutorial composition with themed framing, a readable left text/subtitle area, a right media area, and synchronized pre-generated audio.
5. Prove both paths with isolated test fixtures and no paid LLM, TTS, image-search, or external API calls.

### Non-goals

- Task 1 does not require moving production storage to a remote database or introducing multi-region/multi-process coordination.
- Task 2 does not remove `scripts/render-storyboard-ffmpeg.mjs`, alter the existing legacy CLI, or make Remotion the production default in its first PR.
- This scope does not implement the separate structured-LLM-output task, regenerate existing ingestion results, or redesign the React SPA.
- The system must not silently create placeholder images, silence, or default scene text for a production-ready render when required source assets are absent.

## 3. Task 1 requirements: project persistence and render state

### R1. Canonical project aggregate

- Define one versioned canonical project record owned by a `ProjectRepository` boundary. It must contain the existing project fields (`name`, `metadata`, `components`, `images`, `script`, and `audio`) plus render-relevant metadata: ingestion manifest reference/data, storyboard manifest reference/data, logical asset bindings, audio-track metadata, lifecycle/completeness state, schema version, revision, and timestamps.
- Project IDs are opaque at all API and renderer boundaries. For the initial migration, existing numeric JSON-store IDs may remain externally compatible, but every internal lookup must normalize them to a string before use. The same normalized ID must identify persistence, render-config generation, jobs, and artifacts.
- Existing records in `data/projects.json` must remain readable. A schema migration/recovery path must be deterministic, idempotent, and tested. It must neither discard malformed records silently nor overwrite the source file before a successful migration/recovery decision.
- The approved record and render-input data shapes must be published as versioned JSON contracts in `docs/spec/` before implementation code depends on them.

### R2. Explicit durable repository behavior

- Replace application use of SQL-looking `db.run()`/`db.get()` calls with explicit repository operations such as create, find-by-id, update/render-state persistence, and validation. The initial implementation may keep the local JSON file store behind that interface.
- A successful write must survive process restart. JSON writes must be serialized within the process and crash-safe: write a complete temporary file, flush it, and atomically promote it only after the complete record set is available. Failure must leave the prior committed store readable.
- Store initialization must surface corrupt or unsupported data through a recoverable, observable error state; it must not log a warning and silently start an empty store. The procedure must preserve the offending file for operator recovery.
- The repository must support dependency injection or an equivalent test seam so endpoint tests never write a developer's default `data/projects.json`.

### R3. API behavior and compatibility

- `POST /save-project` must validate request shape, reject invalid JSON-compatible structured fields, enforce defined size limits, return a stable project ID, and return no server filesystem paths or implementation internals.
- Existing clients using the documented legacy fields must continue to receive `{ status: "success", projectId }` on success during the compatibility period. Any new canonical fields must be additive and documented.
- `GET /load-project/:id` must load the canonical project record, return normalized public data, distinguish validation, authentication/authorization, not-found, and persistence failures with stable error codes, and never expose raw store errors or file paths.
- Save and load routes must use one deliberate authentication and authorization policy consistent with the protected API routes. Project ownership/tenant context must be represented before cross-user access is possible; a legacy duplicate API-key check must not be the accidental authorization model.
- A project saved with render manifests and asset bindings must be retrievable after restart and must be able to generate the same render-job configuration by its returned project ID. A partial project must return a precise incomplete-project response rather than generating a placeholder render.

### R4. Persistence-to-render boundary

- `buildRenderJobConfig` and `/api/render-job-config` must load render state from the repository through a narrow read model, not from the process-local Map. The Map may be retained temporarily only as a test fixture or explicitly documented cache; it cannot be authoritative.
- `POST /api/render` must use that same canonical read model when building a config by project ID. Directly supplied configs must either be removed from the public route or validated against the versioned render contract and authorized project identity; they must not bypass project-completeness and asset validation.
- Logical component/page IDs, narration/audio references, captions, and scene overlays must resolve through an allowlisted asset resolver to renderer-readable local files. The render configuration must retain the information needed by the renderer; it must not reduce scenes to IDs and durations only.
- Render-job requests, artifacts, and logs must reference a project ID and immutable project/config revision so a completed artifact can be traced to its source record without exposing absolute paths.

### R5. Task 1 verification

- Add an end-to-end HTTP integration test using the actual exported Express application/route registration, an isolated temporary store, and no copied route handler. It must save a project, load it by returned ID, restart or reinitialize the repository, and confirm durable normalized data.
- Add integration coverage showing a persisted complete project generates a render-job config by the same ID, while an incomplete/missing project returns the documented error. Include authentication and invalid-payload cases.
- Add repository tests for migration, corrupt-store handling, failed atomic write behavior, concurrent/sequenced saves, and legacy-record compatibility.

## 4. Task 2 requirements: additive Remotion integration

### R6. Dedicated renderer package and compatibility

- Introduce Remotion in a dedicated renderer subproject, not inside the browser SPA. The package must own its composition root, renderer entry point, typed input validation, styles, bundled/static assets, and package manifest. It must use one exact, mutually compatible Remotion package version set and a React version supported by that set.
- The implementation must record the selected toolchain versions and lockfile changes. Dependency selection must be verified against the package's supported Node/React environment before installation; open version ranges are not acceptable.
- The backend must invoke Remotion through a renderer adapter/registry. The selection must be server-controlled through an allowlisted backend setting or internal job option; client input cannot execute arbitrary commands or choose arbitrary entry points.

### R7. MOBIUS tutorial composition

- Provide a `MobiusTutorial` composition whose input is a validated, deterministic scene document. Each scene must declare its duration, visual content/asset reference, narration or subtitle text, optional audio track, theme data, and transition data. Durations must resolve to integer frame counts using the chosen FPS.
- The base scene layout must include: an accessible themed background or border; a left column for title, narration/subtitles, and safe-area-aware text; a right column for an image or other approved visual; and a mobile/long-text-safe overflow strategy. Text must be clean plain text from the input, not raw Markdown.
- Typography must use a licensed, bundled or otherwise deterministic modern font (the intended style is Nunito or an approved equivalent). Rendering must not depend on a host-installed font.
- Image layout must preserve aspect ratio, crop predictably, provide an intentional fallback only for explicitly optional media, and fail validation for required unresolved media.
- Each scene's audio track must begin at the declared scene frame, be trimmed/extended deterministically to its scene duration, and remain synchronized with visuals and subtitles. Audio duration metadata must be validated before render; placeholder/silent audio is permitted only in an explicit test fixture mode.

### R8. Rendering contract, artifacts, and coexistence

- Define a renderer-neutral, versioned render input contract and a Remotion-specific validated composition input. The adapter must materialize or resolve only authorized local asset paths and include asset fingerprints/revisions for reproducibility.
- Remotion output must use the existing render-job lifecycle and artifact publication conventions: validated config, job ID, progress reporting, MP4 output, packaging manifest, and public artifact paths. It must not expose server-local config/output paths in status responses.
- FFmpeg storyboard rendering remains available and remains the default until Remotion passes agreed parity and operational checks. Existing `RENDERER_COMMAND`/`RENDERER_ENTRYPOINT` escape hatches must be documented, constrained, and regression-tested during adapter refactoring.
- A feature flag or renderer selection policy must permit staged Remotion enablement and immediate rollback to FFmpeg without data migration or artifact contract changes.

### R9. Task 2 verification and operational constraints

- Unit tests must render component behavior and validate frame/timing calculations with hardcoded scenes, local dummy images, and generated/checked-in dummy audio only. No test may call OpenAI, Anthropic, ElevenLabs, BoardGameGeek, Google, or another paid/external service.
- Adapter tests must mock the Remotion render API/process boundary and verify validated inputs, rejected unresolved assets, progress translation, error propagation, and artifact metadata.
- A deterministic renderer smoke test must produce or inspect a short fixture MP4 when the platform supports the required rendering runtime. It must validate video/audio streams, expected duration tolerance, and text/image layout evidence appropriate to the test level. Platform prerequisites and any conditional test policy must be explicit rather than silently skipped.
- Existing FFmpeg unit, dry-run, real-MP4/FFprobe, artifact packaging, and golden/contract checks must remain green. The initial Remotion PR must include a rollback runbook and a comparison fixture that can be rendered by both backends.

## 5. Acceptance criteria

Task 1 is accepted when a saved canonical project is durable across restart, retrievable through the real API, authoritative for render config generation, and covered by endpoint-level integration tests without breaking legacy clients.

Task 2 is accepted for its initial additive milestone when a validated mock tutorial input renders through the Remotion adapter into the standard job/artifact flow with the required split layout and synchronized local audio; FFmpeg remains selectable and the default; all new tests are offline and all existing rendering regressions remain green.
