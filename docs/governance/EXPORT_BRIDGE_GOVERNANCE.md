# MOBIUS → GENESIS Export Bridge Governance (Phase G0)

## Purpose

This document governs the export bridge between the MOBIUS Tutorial Generator
and the GENESIS Orb/engine. It defines a single, stable JSON bundle
(`MobiusExportBundle`) that captures the full state of a tutorial project in a
form that GENESIS can ingest, reason about, and visualize without depending on
MOBIUS internals.

The export bundle is:

- **Immutable** once produced
- **Deterministic** (same inputs → same bundle)
- **Governed by contract** (`mobius_export_contract_v1.0.0.json`)
- **Traceable** via provenance metadata

## Scope

The export bundle includes:

- Game & project metadata
- Ingestion snapshot (E1)
- Storyboard snapshot (E2/E3)
- Subtitle snapshot (F7)
- Audio mixing snapshot (F8)
- Motion & timing snapshot (F9)
- Render & container metadata (F2–F6)
- Provenance and contract versions

GENESIS treats this as a **read-only snapshot** of the tutorial universe.

## Determinism Rules

1. Export is only produced when all upstream governance phases pass:
   - E1–E3 (ingestion & storyboard)
   - F2–F6 (rendering & promotion)
   - F7 (subtitles)
   - F8 (audio mixing)
   - F9 (motion)
2. Export is a pure function of:
   - Source inputs (BGG URL, rulebook PDF, project config)
   - MOBIUS pipeline outputs under governed contracts
3. No timestamps are allowed inside the semantic payload:
   - `createdAt` and similar fields live only inside the `provenance` block.
4. All references are **by ID**, not by file path, except where container.json
   is explicitly referenced in `render`.

## Bundle Shape (High Level)

`MobiusExportBundle` contains:

- `exportContractVersion` (this contract)
- `project` — slug, title, language(s), tags
- `game` — normalized game metadata (players, playtime, etc.)
- `ingestion` — governed ingestion snapshot (structure, diagnostics)
- `storyboard` — governed storyboard snapshot (scenes, links)
- `subtitles` — governed subtitle snapshot (per language)
- `audio` — governed audio mix snapshot
- `motion` — governed motion summary (per scene, per visual)
- `render` — governed rendering snapshot (ARC + container.json summary)
- `provenance` — commit, branch, tool versions, timestamps

All nested blocks must include their **contract versions** so GENESIS can
interpret them correctly.

## Provenance & Traceability

The `provenance` block MUST include:

- `mobiusCommit` (git SHA)
- `branch`
- `buildId` or `ciRunId`
- `generatedAt` (ISO8601 UTC)
- `tools.ffmpegVersion`
- `tools.nodeVersion`
- `contracts`:
  - `ingestion`
  - `storyboard`
  - `subtitle`
  - `audioMixing`
  - `motion`
  - `arc` (rendering)

GENESIS uses this for:

- Reproducibility
- Audit trails
- Time-series analysis of tutorial evolution

## Export Lifecycle

1. MOBIUS pipeline completes all governance phases and golden checks.
2. A dedicated export step constructs `MobiusExportBundle` in memory.
3. The bundle is validated against the export contract via
   `check_mobius_export.cjs`.
4. On success, the bundle is written under:

   `exports/genesis/<gameSlug>/mobius_export_v1.0.0.json`

5. CI uploads the bundle and JUnit as artifacts.
6. GENESIS side can poll or pull bundles as needed.

Exports are **append-only**; updating a tutorial creates a new bundle with a new
`generatedAt` and possibly updated contract versions.

## CI Requirements

- The Phase G0 job MUST:
  - Run only after all upstream jobs succeed.
  - Run `check_mobius_export.cjs` on the produced bundle.
  - Emit `mobius-export-contract-[os].xml`.
- Failures block:
  - Export publication
  - Any GENESIS ingestion steps depending on this run

## GENESIS Expectations (Consumer View)

GENESIS expects:

- A single JSON bundle per tutorial, per export version.
- Stable IDs and referential integrity (no dangling references).
- Contract-versioned blocks so decoders can branch safely.
- No direct FFmpeg/MOBIUS internals; only governed shapes.

GENESIS must **not** mutate or overwrite the bundle.
