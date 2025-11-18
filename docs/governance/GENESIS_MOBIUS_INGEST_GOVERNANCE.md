# GENESIS Ingestion Governance for MOBIUS Export (Phase G1)

## Purpose

This document governs how the GENESIS engine ingests a `MobiusExportBundle`
(produced by MOBIUS under `mobius_export_contract_v1.0.0.json`) and converts it
into an internal `GenesisMobiusSnapshot` suitable for Orb, Kernel, and
NarrativeSequence processing.

Goals:

- Treat each export as a **read-only, governed world snapshot**.
- Normalize MOBIUS-specific details into generic GENESIS concepts.
- Maintain strict determinism and stable IDs for temporal reasoning.
- Avoid hard-coupling GENESIS internals to MOBIUS implementation details.

## Scope

Covers:

- Ingestion lifecycle inside GENESIS
- `GenesisMobiusSnapshot` data shape
- Mapping rules from `MobiusExportBundle`
- Version handling and invariants
- Test and CI expectations

Does **not** cover:

- How MOBIUS builds the export bundle (governed by Phase G0 in MOBIUS).
- Rendering behavior (governed by ARC in MOBIUS).
- Orb UI rendering specifics (separate visualization docs).

## Key Concepts

### MobiusExportBundle (Producer Shape)

- Produced by MOBIUS under `mobius_export_contract_v1.0.0.json`.
- Contains project, game, ingestion, storyboard, subtitles, audio, motion,
  render, provenance.
- Is immutable once written.

### GenesisMobiusSnapshot (Consumer Shape)

- Internal GENESIS representation; stable, normalized.
- Tailored for Orb / Kernel / NarrativeSequenceState.
- Contains:

  - `meta` — identity, game, contract versions.
  - `segments` — logical tutorial segments (intro, components, setup, turns, scoring, end).
  - `scenes` — visual timeline mapped to segments.
  - `tracks` — narration + captions alignment.
  - `metrics` — durations, counts, density metrics.
  - `provenance` — passthrough of relevant provenance for audit.

## Determinism Rules

1. Ingestion is a pure function:

   `MobiusExportBundle + genesis_mobius_ingest_contract → GenesisMobiusSnapshot`

   No network calls, no randomness, no clock access.

2. All IDs are stable:

   - Segment IDs derived deterministically from MOBIUS scene/segment IDs.
   - No renumbering based on runtime order alone.

3. No mutation of the source bundle; ingestion uses an in-memory copy.

4. Schema evolution is **additive**:

   - New fields in export bundles must not break old ingest code.
   - New ingest contract versions MUST be explicitly introduced and tested.

## Lifecycle

1. GENESIS receives or loads a `MobiusExportBundle` JSON.
2. The bundle is validated (optionally) against the known export contract version.
3. The ingest adapter converts the bundle into `GenesisMobiusSnapshot`.
4. Tests ensure:

   - All required invariants hold.
   - The snapshot can be fed to Orb / Kernel / NarrativeSequenceState.

5. The snapshot is stored in memory and/or persisted in a GENESIS-specific
   store, but the original bundle remains authoritative for audit.

## Data Mapping (High-Level)

- `project`, `game` → `meta`
- `storyboard.scenes` → `scenes` with normalized timing and labels
- `subtitles.tracks` → caption tracks, aligned by scene/segment
- `audio.mix` → aggregate audio metrics in `metrics.audio`
- `motion.motions` → motion density metrics and per-scene flags
- `render.container` + ARC → `metrics.render` and `meta.render`

GENESIS does not need full ARC internals; it consumes summarized invariants.

## Version Handling

- `GenesisMobiusSnapshot` is governed by
  `genesis_mobius_ingest_contract_v1.0.0.json`.
- Snapshot MUST include:

  - `mobiusExportContractVersion`
  - `genesisIngestContractVersion`
  - `mobiusContracts` (passthrough from provenance.contracts)

- Ingest code must refuse to proceed if:

  - The export contract major version is unsupported.
  - Required subcontracts are missing or mismatched.

## Testing & CI Expectations

- Pytest suite `tests/test_mobius_ingest_contract.py` MUST:

  - Validate that ingest of a known-good fixture passes.
  - Assert invariants (no missing segments/scenes, metrics in sane ranges).
  - Confirm deterministic behavior: same input → same snapshot.

- Any change to:

  - `genesis_mobius_ingest_contract_v*.json`
  - `genesis/mobius_ingest.py`

  MUST be accompanied by updated tests and docs.

## Downstream Consumption (Orb, Kernel, NarrativeSequence)

- **Orb** consumes `GenesisMobiusSnapshot.segments` + `scenes` to draw timeline
  overlays, pacing bands, and captions. Orb treats the snapshot as immutable and
  never dereferences MOBIUS-specific fields; all timing + label data comes from
  the normalized snapshot.
- **Kernel** uses `meta`, `metrics`, and `tracks` to drive analysis models and
  scoring heuristics. Kernel accesses audio/motion densities exclusively through
  the governed `metrics` namespace and therefore has no dependency on MOBIUS
  exporters.
- **NarrativeSequenceState** ingests the ordered `scenes`/`segments` arrays to
  build its temporal reasoning graph. It relies on the stable IDs produced by
  the adapter to cross-link with Orb and Kernel outputs without touching the raw
  `MobiusExportBundle`.
