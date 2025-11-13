# MOBIUS Packaging Governance (Phase F4)

## Purpose

This document defines the governed contract for `container.json`, the manifest that describes every rendered tutorial's environment, tools, and media payloads. It complements the Authoritative Rendering Contract (ARC) and ensures that what we ship is:

- **Traceable** (who/what/where produced it),
- **Verifiable** (hashes, dimensions, durations, loudness),
- **Deterministic** (two identical runs → identical manifests except timestamps).

## Scope

Packaging governance covers:

- `container.json` structure (see `docs/spec/container.schema.json`),
- Semantic validation of media entries against actual files,
- JUnit reporting of packaging status (`packaging-contract[…]`),
- CI enforcement for every preview and full render.

## Invariants

1. `container.json` **must exist** for every render and validate against the published schema.
2. All referenced media files **must exist** and be non-empty.
3. Video entries **must** match ffprobe:
   - width/height
   - fps (within ±0.1)
   - durationSec (within ±0.25s)
   - pixFmt and SAR
4. Audio entries **must** match ffprobe:
   - durationSec (within ±0.25s)
   - loudness and true-peak must be consistent with ARC tolerances (enforced via ARC + audio governance, not duplicated here).
5. All `sha256` values **must match** the computed SHA of the corresponding file.
6. `arc.version` and `arc.sha256` in `container.json` **must reflect** the ARC used during render.

## CI behavior

- The `packaging-validation` job runs on all relevant matrices after rendering.
- On failure, CI **must**:
  - Mark `packaging-contract[…]` as failed in JUnit,
  - Upload `container.json`, `packaging-contract.junit.xml`, and validator logs.
- No artifact is considered deliverable if packaging governance fails.

## Developer workflow

1. Run rendering as usual (preview or full).
2. Generate or update `container.json` as part of the render pipeline.
3. Run locally:

   ```bash
   npm run packaging:validate
   ```

   (Equivalent to invoking `node scripts/validate_container.cjs --container out/container.json --junit out/junit/packaging-contract.junit.xml`).

Fix any reported issues before pushing.

## Changes and versioning

Any change to container.json structure:

- Bumps the schema version,
- Updates `docs/spec/container.schema.json`,
- Adds or updates tests for the validator,
- Requires PR label: `governance:packaging`.

Any change to ARC fields that affect packaging (e.g., mandatory metadata) must update both:

- ARC spec,
- Packaging governance docs.

---
