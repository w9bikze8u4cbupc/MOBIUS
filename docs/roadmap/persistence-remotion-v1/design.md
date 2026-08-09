# MOBIUS 2.0 Persistence and Remotion Design (v1)

**Status:** Proposed design for later implementation
**Companion:** `requirements.md` and `tasks.md` in this directory

## 1. Design drivers and current-state correction

This design starts from the checked-out code, not the historical assertion that `src/api/db.js` is absent. `db.js` exists, but it imitates `run/get` with an in-memory array persisted as one JSON file. `POST /save-project` stores a legacy shape, while render-config construction reads a separate `projectStateStore` Map. That separation is the core defect: persisted project identity and renderer project identity are not connected.

The current API path is:

```text
/save-project -> db.js JSON array
/load-project/:id -> db.js JSON array
/api/render-job-config -> renderJobConfig.projectStateStore Map
/api/render -> Map or unvalidated caller config -> renderQueue -> renderExecutor
renderExecutor -> scripts/render-storyboard-ffmpeg.mjs (default)
```

The current `buildRenderJobConfig` reduces storyboard content to basic IDs/types/durations, emits no audio assets, and cannot provide `renderPath` values for image IDs. The FFmpeg adapter then legitimately falls back to color scenes/silent audio. Remotion must be introduced only after this project-to-render-data boundary is made explicit.

## 2. Target architecture

```text
HTTP routes
  |-- Project service --------------------- ProjectRepository
  |       |                                      |-- JSON file store (initial backend)
  |       |                                      `-- future durable store implementation
  |       `-- Public Project DTO
  |
  |-- Render project loader -- canonical project read model
  |       |-- manifest validation
  |       `-- AssetResolver (logical ID -> authorized local asset descriptor)
  |
  `-- RenderJobService -- versioned renderer-neutral RenderJobConfig
          |-- RendererRegistry
          |     |-- FfmpegStoryboardRenderer (default, unchanged behavior contract)
          |     `-- RemotionRenderer (feature-flagged)
          `-- RenderQueue / artifact packager
```

The repository owns durable data; the project service owns payload validation and compatibility translation; the render project loader assembles the minimum immutable render view; and the renderer adapters own backend-specific conversion. No renderer reads the JSON store or HTTP request directly.

## 3. Task 1 design: canonical persistence and rendering identity

### 3.1 Repository interface

Introduce an asynchronous repository interface rather than passing pseudo-SQL to `db.js`:

```ts
interface ProjectRepository {
  create(input: CreateProjectInput): Promise<ProjectRecord>;
  findById(projectId: string): Promise<ProjectRecord | null>;
  updateRenderState(projectId: string, input: RenderStateInput): Promise<ProjectRecord>;
  getRenderProject(projectId: string): Promise<RenderProject | null>;
}
```

The initial `JsonProjectRepository` can remain file-backed, but callers cannot depend on JSON layout, SQL text, module-level arrays, or synchronous I/O. It receives its data path and clock/ID factory through construction options so endpoint integration tests use a temporary store.

For compatibility, the first record version retains current integer IDs on disk where feasible and normalizes them through `String(id)` at every public/render boundary. New code must regard IDs as opaque; later storage can switch generation without another renderer migration.

### 3.2 Canonical record and migration

A versioned project record will be formally defined in a proposed `docs/spec/project_record_contract_v1.0.0.json` before implementation. At a minimum it has:

```json
{
  "schemaVersion": "1.0.0",
  "id": "42",
  "revision": 3,
  "name": "Example game",
  "metadata": {},
  "components": [],
  "images": [],
  "script": "",
  "audio": "",
  "renderState": {
    "ingestionManifest": {},
    "storyboardManifest": {},
    "assetBindings": [],
    "audioTracks": [],
    "completeness": "draft|renderable"
  },
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

The exact contract must avoid arbitrary host paths and secrets. `assetBindings` use logical IDs, content hashes, roles, and controlled storage keys; the server-side `AssetResolver` maps them to local readable paths only at job preparation.

On startup, the repository recognizes the legacy `{ projects, nextId }` document, converts records in memory deterministically, and writes the upgraded document only through the atomic commit routine. Corrupt JSON, unknown schema versions, duplicate IDs, and illegal IDs produce a typed `PROJECT_STORE_UNAVAILABLE` state and preserve the source file. Recovery is an explicit operator action or documented backup restore, not a silent reset.

### 3.3 Atomic JSON-store strategy

A store write is serialized by an in-process mutex/queue. It writes the complete next document to a unique file in the same directory, flushes file content, optionally maintains a last-known-good backup, and renames/promotes only after a full valid document exists. Directory and file errors map to a typed persistence error. A read validates schema before returning a record.

This is deliberately a single-process local-store design. It does not claim safety for multiple Node processes sharing a file. Deployment documentation must either guarantee one writer or require a future database backend before horizontal scaling.

### 3.4 Routes and authorization

Route handlers use a Project service that accepts a validated DTO and maps errors to stable API codes. `/save-project` remains a compatibility facade and returns its legacy success envelope. `/load-project/:id` returns a public DTO with parsed values, never serialized internal state, absolute filenames, raw parser errors, or stack traces.

Authentication is applied consistently before both handlers using the existing gateway approach. Authorization is represented as an explicit policy input even if the initial deployment has a single tenant. The implementation must remove route-specific accidental behavior where load applies an extra ad hoc API-key check but save does not.

### 3.5 Persisted render read model

`getRenderProject(projectId)` returns a validated read model only if the project has required ingestion and storyboard manifests and each required logical asset can be resolved. `registerRenderJobConfigRoute` and `POST /api/render` receive this loader through dependency injection. The global `projectStateStore` is removed as production authority; it may survive briefly as a test helper with a deprecation boundary.

The job builder creates an immutable render config that preserves overlays, captions, resolved audio descriptors, image references, FPS, resolution, configuration contract version, project revision, and asset fingerprints. A request with an incomplete project fails with a specific 400/404-family error. If direct `config` submission remains, a schema validator and project-identity authorization check run before queuing it.

## 4. Task 2 design: additive Remotion renderer

### 4.1 Package placement and ownership

Create an independent package at `renderers/remotion/` (the repository is not currently an npm workspace). It has its own exact dependency manifest and lockfile strategy, composition root, renderer entry point, TypeScript configuration if used, source code, test fixtures, and static assets. This avoids coupling a server-rendered video runtime to the CRA client, which currently has its own React 19 package.

Proposed structure:

```text
renderers/remotion/
  package.json
  remotion.config.ts
  src/
    index.ts
    Root.tsx
    contracts.ts
    compositions/MobiusTutorial.tsx
    components/TutorialScene.tsx
    components/SplitLayout.tsx
    theme.ts
    render.ts
  public/fonts/                 # licensed, versioned font files
  test-fixtures/
```

The implementation selects one compatible exact Remotion version family only after its supported Node/React pairing is confirmed. The package uses Remotion bundler/renderer APIs through `render.ts`; backend code does not spawn arbitrary shell commands.

### 4.2 Input model and adaptation

The backend's renderer-neutral job config is the source of truth. `RemotionRenderer` validates it, resolves authorized asset descriptors, calculates all timing, and produces a narrower `MobiusTutorialInput`:

```ts
interface MobiusTutorialInput {
  projectId: string;
  projectRevision: number;
  contractVersion: string;
  fps: number;
  width: number;
  height: number;
  theme: { background: string; border: string; accent: string };
  scenes: Array<{
    id: string;
    fromFrame: number;
    durationInFrames: number;
    title?: string;
    narrationText: string;
    subtitleText?: string;
    image: { src: string; required: boolean; fingerprint: string } | null;
    audio: { src: string; durationSec: number; fingerprint: string } | null;
    transition?: { type: "fade" | "none"; durationInFrames: number };
  }>;
}
```

The validated source document contains already-clean plain text. Composition code does not parse Markdown, make network requests, calculate uncertain audio duration, or invent missing content. At preparation time, audio metadata is probed, scene durations are converted by an explicit rounding rule, `fromFrame` values are contiguous, and total composition duration is the final scene end frame.

### 4.3 Composition behavior

`MobiusTutorial` uses `Sequence` to place each scene at its declared start. `TutorialScene` renders a deterministic themed frame, configured background/border, and a safe-area split layout. The left panel has game/scene title plus narration/subtitle text, line clamp/wrapping rules, contrast checks, and no host-font dependency. The right panel uses `Img` or media components with controlled `objectFit`, a documented focal/crop rule, and a visible optional-media state only when `required` is false.

Audio is rendered with a scene-local audio component starting at frame zero within each scene `Sequence`; it is trimmed to the scene frame length and must be compatible with the declared duration tolerance. Captions/narration are tied to the same scene boundaries. Transitions must reserve their frames so visual and audio timing remain predictable; the first milestone supports `fade` and `none` only.

Font files are stored with an approved license and loaded through a deterministic package asset path. The design target is Nunito; a substitution requires design review and updates to visual fixtures.

### 4.4 Renderer registry, progress, and artifacts

Refactor `renderExecutor` behind a registry such as:

```ts
interface RenderBackend {
  name: "ffmpeg-storyboard" | "remotion";
  validate(config: RenderJobConfig): Promise<void>;
  render(request: PreparedRenderRequest, onProgress: ProgressCallback): Promise<RenderResult>;
}
```

`ffmpeg-storyboard` stays selected by default. A server-owned allowlist resolves `RENDER_BACKEND=ffmpeg-storyboard|remotion`; per-request override, if later permitted, is policy-checked and never maps directly to a command/entrypoint. The Remotion adapter reports bounded numeric progress into the existing queue, writes results into the job directory, and returns the same artifact/manifest shape expected by packaging.

The status and manifest APIs should expose safe public paths and logical result metadata, not `configPath`, `outputFilePath`, or any absolute filesystem location. Packaging failure is a failed job or an explicitly degraded terminal status defined in the job contract; it cannot be indistinguishable from successful delivery.

### 4.5 Rollout and rollback

1. Land contracts and persistence/render-state alignment first.
2. Land the isolated Remotion package with components, mock fixtures, and no server selection.
3. Add the registry adapter behind a disabled feature flag; preserve FFmpeg integration tests.
4. Render one deterministic fixture through both backends, verify job/artifact invariants, and enable Remotion only in a non-production/staging policy.
5. Change the default only after measured acceptance criteria are met. Rollback is a server configuration change to `ffmpeg-storyboard`; stored project records and renderer-neutral configs remain valid.

## 5. Test design

- Repository tests use temporary directories and injected failure points for migration, corrupted storage, atomic promotion failure, and process reinitialization.
- HTTP integration tests use the real exported Express app configured with the temporary repository; they must not duplicate endpoint logic in test code.
- Render-state integration tests persist a complete project, create config through the real route, and ensure required assets survive into the renderer preparation request.
- Remotion component tests use static scene JSON, local tiny PNG fixtures, and a local/generated dummy MP3. Adapter tests inject/mocks the Remotion rendering boundary.
- One deterministic offline media smoke test validates MP4 streams/duration when its runtime prerequisites are available; its platform policy is declared in CI rather than silently skipped.
- Existing FFmpeg dry-run and real-output coverage remains in place throughout the migration.
