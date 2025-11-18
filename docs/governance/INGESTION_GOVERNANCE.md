# MOBIUS Ingestion Governance (Phase E1)

Version: 1.0.0  
Status: Active  
Scope: PDF → Text/Structure, BGG → Metadata, Ingestion Manifests

---

## 1. Purpose

The ingestion pipeline converts raw inputs (rulebook PDF + BGG URL/metadata) into
a deterministic, governed JSON payload that can safely drive storyboard and
rendering phases.

This document defines:

- Required inputs and outputs
- Determinism rules
- OCR and network fallbacks
- Hashing and manifest requirements
- CI enforcement and JUnit contracts

All ingestion behavior MUST conform to the corresponding machine-readable
contract in `docs/spec/ingestion_contract.json`.

---

## 2. Ingestion Lifecycle

Ingestion covers the following steps:

1. **Rulebook Intake**
   - Accept a single PDF file representing the base game rulebook.
   - Store the raw file in a canonical location (e.g. `tests/fixtures/` in CI,
     project storage in production).

2. **PDF Parsing**
   - Extract text and structural hints (pages, headings, paragraphs).
   - Capture basic layout hints (page number, y-order, optional font-size if
     available from the library).
   - For well-structured PDFs, use the primary parser (e.g. `pdf-parse`).

3. **OCR Fallback (Optional)**
   - For scanned PDFs or empty text output, use OCR as a governed fallback.
   - OCR usage MUST be recorded in the ingestion result (`ocrUsed: true` and
     an `ocrReason` string).
   - OCR is only allowed when the primary parser yields no usable text or when
     the PDF is detected as image-only.

4. **BGG Metadata Fetch**
   - Fetch metadata for the game (title, year, designers, etc.) from BGG when
     a BGG URL or ID is provided.
   - Record:
     - The source URL
     - The normalized game ID
     - A minimal, stable subset of metadata fields
   - Log network failures and mark `bgg.metadataStatus` accordingly.

5. **Extraction & Structuring**
   - Extract:
     - Components list
     - Setup steps
     - Turn/phase/round structure
     - TOC / logical sections (if available)
   - Each extracted element MUST include page references where possible.

6. **Ingestion Result & Manifest**
   - Produce a single ingestion result JSON object matching
     `docs/spec/ingestion_contract.json`.
   - Compute and embed hash information:
     - `rulebook.sha256`
     - `text.sha256` (normalized text)
     - `structure.sha256` (serialized structure)
   - Produce a separate, flat `ingestion_manifest.json` suitable for CI
     indexing (optional but recommended).

---

## 3. Determinism Rules

Ingestion MUST be deterministic for a given set of inputs and environment:

- No randomness:
  - No `Math.random()` or time-based decisions that alter content.
- Stable ordering:
  - Pages sorted by numeric index.
  - Headings within a page sorted by ascending Y position and then X.
  - Components and steps sorted by `order` or a documented heuristic that is
    stable across runs.
- Normalization:
  - Normalize text to NFC and collapse repeated whitespace.
  - Strip trailing spaces and normalize newlines to `\n`.
- Rounding:
  - Layout hints (positions, font sizes) should be rounded to governed
    increments (e.g. 0.1 or integer pixels) as specified in the contract.

Any behavior that would produce different outputs for identical inputs MUST be
explicitly documented and justified, and SHOULD be avoided.

---

## 4. Required Inputs and Outputs

### Inputs

- `rulebook.pdf`: base game rulebook.
- `bggUrl` or `bggId`: optional but recommended source of metadata.
- Optional ingest parameters:
  - `language` (e.g. `en`, `fr`)
  - `ocrEnabled` (boolean)
  - `maxPages` (for development and CI fixtures)

### Outputs

The ingestion result MUST match the `IngestionResult` schema:

- `game`: normalized game metadata and sources.
- `rulebook`: rulebook file info and hashes.
- `text`: normalized full text and per-page chunks.
- `structure`: headings, sections, components, setup steps, phases/rounds.
- `diagnostics`: parser decisions, OCR usage, and warnings.
- `hashes`: consolidated hashes for cross-checks.

See `docs/spec/ingestion_contract.json` for exact field names and types.

---

## 5. OCR Governance

OCR is treated as an exceptional but governed pathway:

- OCR MAY run only when:
  - The primary parser returns an empty or clearly unusable result; or
  - The file is detected as image-only.
- OCR usage MUST be recorded:
  - `diagnostics.ocr.used = true`
  - `diagnostics.ocr.reason = "<short reason>"`
- OCR output MUST be normalized through the same text normalization pipeline.

CI MAY include a dedicated test fixture that forces OCR and validates the
result structure.

---

## 6. BGG Governance

BGG metadata is treated as an external dependency with clear fallbacks:

- When fetch succeeds:
  - Populate `game.bgg` fields (`id`, `url`, `title`, `yearPublished`,
    `designers`, `minPlayers`, `maxPlayers`, `minPlaytime`, `maxPlaytime`,
    etc.).
  - Record `bgg.metadataStatus = "ok"`.

- When fetch fails:
  - Do NOT crash ingestion; instead:
    - Set `bgg.metadataStatus = "error"` and populate `bgg.errorMessage`.
    - Leave fields that depend on BGG unset or null.
  - Validator will treat missing BGG metadata as:
    - **Warning** in development/CI fixtures that do not require BGG.
    - **Error** only when the contract indicates BGG metadata is required.

Note: scraping/parsing details MUST be encapsulated in the ingestion services
and not leak into the contract.

---

## 7. Hashing & Manifest Rules

To ensure integrity and reproducibility:

- Compute `sha256` of:
  - Raw `rulebook.pdf`
  - Normalized full text
  - Serialized structural summary (e.g. sorted JSON string of headings +
    sections)
- Store hashes under:
  - `rulebook.sha256`
  - `text.sha256`
  - `structure.sha256`
  - `hashes` (summary object for quick access)

Optional:
- Emit `ingestion_manifest.json` containing:
  - `game.slug`
  - Input file paths
  - Key timestamps (for info only; not used for determinism)
  - Hashes and a simple status flag (`"ok"/"error"`)

---

## 8. Error Handling & Diagnostics

Ingestion scripts MUST:

- Use explicit error codes, e.g.:
  - `INGEST_RULEBOOK_MISSING`
  - `INGEST_PDF_PARSE_FAILED`
  - `INGEST_OCR_REQUIRED_BUT_DISABLED`
  - `INGEST_CONTRACT_VIOLATION`
- Provide structured diagnostics under `diagnostics` in the result:
  - `warnings[]`
  - `errors[]`
  - `parser` and `ocr` subsections.

The validator will fail if:

- Required fields are missing.
- Hashes cannot be recomputed and matched.
- Critical diagnostics entries exist (e.g., `errors[]` non-empty).

---

## 9. CI & JUnit Contract

The ingestion validator SHALL:

- Accept:
  - `--input` path to an ingestion result JSON.
  - `--contract` path to `ingestion_contract.json` (or default path).
  - `--junit` optional output path for JUnit XML.
- Validate:
  - Required structure and types.
  - Basic value constraints (non-empty strings, non-negative counts, etc.).
  - Hash presence (recomputation is optional and MAY be added later).
- Exit:
  - `0` on success.
  - Non-zero error code on contract violation or IO error.

The JUnit report MUST contain:

- A single `<testsuite>` named `ingestion-contract`.
- At least one `<testcase>` summarizing the contract status.
- `<failure>` or `<skipped>` elements when applicable.

CI MUST run ingestion validation against at least one canonical fixture for
each supported platform.

---

## 10. Versioning & Changes

- Contract version field: `ingestionContractVersion` in each ingestion result.
- Changes to the contract MUST:
  - Bump the version in `ingestion_contract.json`.
  - Update this governance document.
  - Include migration notes for existing ingestion fixtures.
- CI MUST pin tests to a specific contract version and update fixtures when
  migrating.

---
