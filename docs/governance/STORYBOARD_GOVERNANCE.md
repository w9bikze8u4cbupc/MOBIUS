# MOBIUS Storyboard Governance (Phase E2)

Version: 1.0.0  
Status: Active  
Scope: Script → Storyboard scenes → Visuals → Timings → Motion

---

## 1. Purpose

The storyboard is the governed bridge between the **ingestion/script layer** and
the **rendering pipeline**. It defines:

- What scenes exist
- Which visuals appear in each scene
- How long each scene lasts
- Where overlays and callouts appear
- How elements move (motion primitives)

This document specifies:

- Required storyboard structure
- Determinism rules
- Placement and timing constraints
- Motion primitives and allowed parameters
- CI enforcement via `storyboard_contract.json` and `check_storyboard.cjs`

All storyboard payloads MUST conform to the machine-readable contract in
`docs/spec/storyboard_contract.json`.

---

## 2. Storyboard Lifecycle

The storyboard pipeline covers these steps:

1. **Inputs**
   - A governed script or segmentation (e.g. `ScriptSegment` objects) produced
     from ingestion and scripting.
   - A governed asset inventory:
     - Components and images (box, board, components, overlays)
     - Audio assets (narration, SFX, music) with durations

2. **Scene Construction**
   - For each script segment (intro, components, setup, turns, scoring, end),
     build one or more storyboard scenes.
   - Each scene MUST:
     - Reference exactly one `segmentId` (the source script segment).
     - Have a governed `durationSec`.
     - Declare all visuals and overlays up front.

3. **Visual Placement & Layout**
   - Place image assets, overlays (text boxes), and callouts relative to a
     canonical render resolution (e.g. 1920×1080).
   - Coordinates and sizes MUST be expressed in normalized units (0–1) or
     governed pixel values.
   - Layout MUST keep interactive and text content within the safe area.

4. **Motion & Timing**
   - Scenes may define motion primitives (fade, slide, zoom, pulse) with:
     - Defined easing names
     - Start/end times snapped to governed increments
   - No free-form animations (e.g., arbitrary keyframe lists) are allowed
     outside the defined primitive set.

5. **Output**
   - A single storyboard JSON matching the `Storyboard` schema:
     - Metadata (`storyboardContractVersion`, `game`, `resolution`, etc.)
     - `scenes[]` with visuals, overlays, and motion
     - Optional `audioLayout` hints

The storyboard is then consumed by the rendering engine (Phase F2+) to produce
deterministic video.

---

## 3. Determinism Rules

The storyboard MUST be deterministic given:

- Script segments
- Asset inventory
- Contract version
- Configuration parameters (e.g. default durations)

Rules:

- **No randomness**
  - No `Math.random()`, time-based seeds, or environment-dependent behavior in
    the generator.
- **Stable ordering**
  - `scenes[]` sorted by `index` ascending.
  - `visuals[]` sorted by `layer` then `id`.
  - `overlays[]` sorted by `startSec` then `id`.
- **Normalized timing**
  - All timing values (`startSec`, `endSec`, `durationSec`) MUST:
    - Be non-negative
    - Satisfy `0 ≤ startSec < endSec ≤ durationSec`
    - Be snapped to increments of 1/6s (≈0.1667) or 1/8s, as documented.
- **Layout normalization**
  - If using normalized coordinates:
    - `x`, `y`, `width`, `height` MUST be within [0, 1].
  - If using pixel coordinates:
    - Values MUST be integers and within the render resolution.

Any deviation from these rules is a storyboard contract violation.

---

## 4. Required Inputs and Outputs

### Inputs to the Storyboard Generator

- `scriptSegments[]`:
  - Each segment with `id`, `type`, `text`, `lang`, and optional `pauseCue`.
- `assetInventory`:
  - Image assets with IDs, types (board, component, box, overlay), and
    recommended usage.
  - Audio assets (narration tracks per segment, background music, SFX).

### Output: Storyboard

The storyboard MUST match the `Storyboard` schema and contain:

- `storyboardContractVersion` (string, pinned to `1.0.0`).
- `game` (slug + name).
- `resolution` (`width`, `height`, `fps`).
- `scenes[]`:
  - `id`, `index`, `segmentId`, `durationSec`.
  - `visuals[]` with positions, layers, and optional motion.
  - `overlays[]` with text content and timing.
- Optional:
  - `audioLayout` with references to narration and music tracks.

The contract is defined in `docs/spec/storyboard_contract.json`.

---

## 5. Scene Governance

Each scene MUST satisfy:

- **Segment linkage**
  - `segmentId` MUST refer to a known script segment.
  - One-to-many relationship allowed (a segment may have multiple scenes), but
    each scene has exactly one `segmentId`.

- **Duration**
  - `durationSec` MUST:
    - Be ≥ 0.5 seconds.
    - Cover all visuals and overlays:
      - max(`startSec`, `endSec` of any element) ≤ `durationSec`.

- **Safe Area**
  - Visuals and overlay text MUST remain within the canonical safe area
    (e.g. 5% margin on each side when using normalized coordinates).

- **Scene Types**
  - Scenes MAY be tagged with a type:
    - `intro`, `components`, `setup`, `turn`, `scoring`, `end`, `transition`
  - This type MUST align with the underlying script segment type unless
    explicitly marked `transition`.

---

## 6. Visual & Overlay Governance

### Visuals

Each visual element:

- MUST reference a known `assetId`.
- MUST specify:
  - `placement` (x, y, width, height) in governed units.
  - `layer` (non-negative integer).
- MAY specify:
  - `motion` primitive configuration (see section 7).

Visuals MUST not:

- Overlap critical overlays (e.g. title text) in a way that violates the
  safe area or readability constraints.

### Overlays

Each overlay:

- MUST specify:
  - `text` (non-empty string)
  - `placement` (same rules as visuals)
  - `startSec`, `endSec`
- MUST have `startSec < endSec ≤ scene.durationSec`.

Overlays MUST be readable:

- No more than 2 lines for long text overlays within standard 16:9.
- Font size and line length will be governed by the render engine, but
  storyboard MUST not pack multiple textual elements into tiny areas.

---

## 7. Motion Governance

Only a small, deterministic set of motion primitives is allowed:

- `fade`:
  - Parameters: `from`, `to` (0–1), `startSec`, `endSec`, `easing`.
- `slide`:
  - Parameters: `from` (x, y), `to` (x, y), `startSec`, `endSec`, `easing`.
- `zoom`:
  - Parameters: `from` (scale), `to` (scale), `anchor` (x, y), timings, easing.
- `pulse`:
  - Parameters: `minScale`, `maxScale`, `periodSec`, `phaseOffsetSec`,
    optional `repeatCount`.

All motion primitives:

- MUST have `startSec` and `endSec` within `[0, durationSec]`.
- MUST declare `easing` from a governed enum:
  - `linear`, `easeInOutCubic`, `easeOutQuad`.

No arbitrary free-form keyframes; more complex animations MUST be represented
by combinations of these primitives or introduced via a future contract
revision.

---

## 8. Error Handling & Diagnostics

The storyboard generator and validator MUST:

- Use explicit error codes, e.g.:
  - `STORYBOARD_CONTRACT_VERSION_MISMATCH`
  - `STORYBOARD_SCENE_DURATION_INVALID`
  - `STORYBOARD_PLACEMENT_OUT_OF_BOUNDS`
  - `STORYBOARD_UNKNOWN_ASSET_ID`
- Provide diagnostics summarized in the validator output and JUnit.

CI MUST fail when:

- Contract version mismatches.
- Required fields are missing or invalid.
- Timing, placement, or motion constraints are violated.

Warnings (non-fatal):

- No scenes for a particular segment type (e.g. no `scoring` scene).
- Scenes with zero overlays (audio-only segments).

---

## 9. CI & JUnit Contract

The storyboard validator SHALL:

- Accept:
  - `--input` path to the storyboard JSON.
  - `--contract` path to `storyboard_contract.json` (default path).
  - `--junit` optional output path for JUnit XML.
- Validate:
  - Contract version.
  - Required structure and basic constraints.
  - Per-scene timing and placement.
- Exit:
  - `0` on success.
  - Non-zero on validation or IO errors.

The JUnit report MUST:

- Use `<testsuite name="storyboard-contract">`.
- Include at least one `<testcase name="contract">`.
- Include `<failure>` when violations are present.

---

## 10. Versioning & Changes

- Version field: `storyboardContractVersion` in each storyboard.
- Changes to the contract MUST:
  - Bump `contractVersion` in `storyboard_contract.json`.
  - Update this governance document.
  - Include migration notes for fixtures and generative code.

---

## Pipeline Integration

`src/storyboard/generator.js` consumes the Phase E1 ingestion payload (see
`docs/governance/INGESTION_GOVERNANCE.md` and `docs/spec/ingestion_contract.json`)
alongside the storyboard contract to produce `storyboard_manifest.json`. The
generator:

1. Hydrates motion primitives defined in the contract.
2. Aligns each scene to a canonical ingestion outline entry.
3. Produces a storyboard hash manifest so downstream rendering can assert
determinism before Phase F begins.
