# Phase E — Ingestion Governance

Phase E brings the same determinism that already protects rendering (Phase F) to every upstream step that feeds it.  The ingestion pipeline now has a formal contract, auditable hash manifests, unit coverage, and validator CLIs that surface JUnit evidence in CI.

## Goals
- Normalize every PDF-derived artifact so headings, TOCs, and component boundaries are reproduced identically across machines.
- Govern OCR fallbacks so they are deterministic, surfaced, and hashed.
- Record provenance for BoardGameGeek (BGG) metadata and component manifests.
- Emit machine-verifiable manifests (`ingestion_manifest.json`) that the rendering pipeline and reviewers can diff.

## Deterministic Pipeline
1. **PDF Parsing** – `src/ingestion/pdf.js` standardizes block ordering, unicode, ligatures, and positional metadata before any heuristics run.  Every block is hashed.
2. **Heading + TOC Detection** – `src/ingestion/pipeline.js` drives font/size thresholds from `docs/spec/ingestion_contract.json`.  Rules are explicit and versioned.
3. **OCR Fallbacks** – When a page has no canonical blocks, OCR spans are merged in deterministic order.  Each fallback is logged under `manifest.ocrUsage`.
4. **Component Extraction** – Components inherit hashes from their source blocks and must reference a known asset (text span or rasterized image).
5. **Hash Manifest** – `manifest.assets` captures SHA256 per page text blob, per component, and per image reference.  Rendering can re-hash inputs and fail fast on drift.

## Validators + CI
- `scripts/check_ingestion.cjs` loads the contract, validates required invariants, and writes optional JUnit XML for CI gating (`tests/reports/ingestion-contract.xml`).
- `npm run ingestion:validate -- --manifest <path>` ensures the manifest uses the correct contract version, contains deterministic hashes, and reports OCR fallbacks.

## Reference Artifacts
- Contract: [`docs/spec/ingestion_contract.json`](../spec/ingestion_contract.json)
- Validator: [`src/validators/ingestionValidator.js`](../../src/validators/ingestionValidator.js)
- Tests: `tests/ingestion/*.test.js`

The contract can evolve, but **only** by versioning `contract.version`.  Every manifest captures the version so CI can block incompatible combinations.
