# Tutorial Real-Input Fixtures

## Purpose

These fixtures represent **realistic, product-like game input** for the tutorial
generation pipeline. They bridge the gap between synthetic test fixtures and
actual production data without requiring live network calls, paid APIs, or
external service dependencies.

## Provenance Model

Each fixture simulates the output of a two-layer ingestion process:

1. **Metadata layer** — resembles normalized BGG API response data (game name,
   player count, duration, designer, components).
2. **Rulebook-extract layer** — resembles reviewed/structured extraction output
   from a game rulebook (objective, setup steps, turn structure, core mechanic,
   scoring, edge cases).

## Offline Constraints

- No live BGG fetching.
- No PDF extraction or OCR.
- No TTS (ElevenLabs, OpenAI, etc.) billing.
- No network-dependent image downloads.
- All data is checked in and deterministic.

## Fixture Registry

All real-input fixtures are registered in **`fixtures.json`**. The E2E smoke test
and registry validation tests load this file to discover enabled fixtures
automatically.

### Registry format

```json
{
  "_schema": "Real-input fixture registry",
  "_version": 1,
  "fixtures": [
    {
      "slug": "game-slug",
      "gameName": "Game Name",
      "profile": "Brief teaching profile description",
      "enabled": true,
      "metadataFile": "game-slug.metadata.json",
      "rulebookExtractFile": "game-slug.rulebook-extract.json",
      "expectedFile": "game-slug.expected.json",
      "notes": "Optional notes about the fixture"
    }
  ]
}
```

### Current fixtures

| Slug | Game | Teaching Profile | Duration Range |
|------|------|------------------|----------------|
| `sakura-market` | Sakura Market | Competitive market-timing with dice-driven price fluctuation | 60–180s |
| `stellar-drift` | Stellar Drift | Cooperative tile-laying route-building through asteroids | 50–130s |

The fixture matrix exercises different tutorial structures:
- Different player counts (2–5 vs 1–4)
- Different turn phase names (Move/Trade/Refresh vs Draw/Place/Drift)
- Different scoring models (competitive coin-counting vs cooperative pass/fail)
- Different component mixes (dice+cards+tokens vs tiles+cards+miniature)
- Different playtime representations (range vs single value)
- Different designer counts (single vs multiple)

## File Layout

Each fixture consists of layered input files and a contract:

| File | Role |
|------|------|
| `fixtures.json` | Registry of all fixtures (discovery source) |
| `<slug>.metadata.json` | Simulated BGG metadata (game name, player count, playtime, designers) |
| `<slug>.rulebook-extract.json` | Structured rulebook extraction (objective, components, setup, turns, scoring) |
| `<slug>.expected.json` | Artifact contract — expected validation assertions for rendered output |

## Usage

### Normalizer path (preferred)

```bash
node scripts/normalize-real-input-fixture.cjs \
  --metadata tests/fixtures/tutorial-real-input/<slug>.metadata.json \
  --extract tests/fixtures/tutorial-real-input/<slug>.rulebook-extract.json \
  --out /tmp/<slug>.json
```

The normalizer produces a canonical tutorial fixture consumed by
`scripts/generate-tutorial-preview.mjs`.

### Artifact contract validation

After rendering, validate artifacts against the expected contract:

```bash
node scripts/validate-real-input-preview-artifact.mjs \
  --dir <artifact-output-dir> \
  --expected tests/fixtures/tutorial-real-input/<slug>.expected.json
```

The contract validator checks:
- All required artifacts exist and are non-empty
- `preview.mp4` exceeds minimum size threshold
- `manifest.json` references the correct game identity (gameId, gameName, fixtureSlug)
- `ffprobe.json` confirms video codec, resolution, audio presence, and duration range

## How This Differs from Golden Preview Validation

| Aspect | Golden validator | Real-input contract validator |
|--------|-----------------|-------------------------------|
| Script | `validate-tutorial-preview-artifact.mjs` | `validate-real-input-preview-artifact.mjs` |
| Duration | Hardcoded 80-90s (gem-collectors/hanamikoji baselines) | Configurable per-fixture via `durationRange` in `expected.json` |
| Identity | Optional `--slug` flag | Required `manifest` block in contract |
| Media | Hardcoded H.264/1920x1080/30fps/AAC | Configurable per-contract |
| Content | Validates script segments, storyboard scenes, captions cue count | Focuses on artifact existence and media properties |
| Use case | Deterministic golden baseline comparison | Realistic variable-length content validation |

## How to Add a New Real-Input Fixture

1. **Create fixture files** in this directory:
   - `<slug>.metadata.json` — follow the BGG-style schema (see `sakura-market.metadata.json`)
   - `<slug>.rulebook-extract.json` — include objective, components, setup, turnStructure, coreMechanic, scoring, edgeCases
   - `<slug>.expected.json` — include gameId, gameName, fixtureSlug, durationRange, requiredArtifacts, media, manifest, minMp4Bytes

2. **Register in `fixtures.json`** — add an entry to the `fixtures` array with all required fields. Set `enabled: true`.

3. **Verify identity consistency** — ensure:
   - `metadata.slug` matches the registry `slug`
   - `metadata.title` matches the registry `gameName`
   - `expected.gameId` / `expected.gameName` / `expected.fixtureSlug` match the registry

4. **Run registry validation**:
   ```bash
   npx jest tests/scripts/realInputFixtureRegistry.test.js --no-coverage
   ```

5. **Run normalizer** to verify output:
   ```bash
   node scripts/normalize-real-input-fixture.cjs --metadata <meta> --extract <extract>
   ```

6. **Add normalizer unit tests** in `tests/scripts/normalizeRealInputFixture.test.js`.

7. **Push and verify CI** passes on all OS targets. No test code changes are needed — the E2E smoke automatically discovers enabled fixtures from the registry.

## Registry Validation

The test `tests/scripts/realInputFixtureRegistry.test.js` enforces:
- `fixtures.json` is valid JSON with a `fixtures` array
- At least one fixture is enabled
- No duplicate slugs
- Each entry has all required fields
- All referenced files exist on disk
- Metadata slug/title match registry slug/gameName
- Expected contract identity matches registry
- Rulebook extracts have required sections with non-empty content


## Smoke Coverage Report

When the E2E smoke test runs (`tests/e2e/tutorial_full_flow_smoke.test.js`), it
generates a structured coverage report at a temporary path:

```
<temp-dir>/real-input-smoke-coverage.json
```

### Report schema (`real-input-smoke-coverage/v1`)

```json
{
  "_schema": "real-input-smoke-coverage/v1",
  "generatedAt": "2025-01-15T12:00:00.000Z",
  "registryPath": "/abs/path/to/fixtures.json",
  "enabledFixtureCount": 2,
  "fixtures": [
    {
      "slug": "sakura-market",
      "gameName": "Sakura Market",
      "profile": "Competitive market-timing...",
      "metadataFile": "sakura-market.metadata.json",
      "rulebookExtractFile": "sakura-market.rulebook-extract.json",
      "expectedFile": "sakura-market.expected.json",
      "normalizedFixturePath": "/tmp/.../sakura-market-normalized.json",
      "artifactDir": "/tmp/.../tutorial-preview-sakura-market",
      "artifactPresence": {
        "preview.mp4": true,
        "script.json": true,
        "storyboard.json": true,
        "captions.srt": true,
        "render-config.json": true,
        "manifest.json": true,
        "ffprobe.json": true
      },
      "manifestIdentity": {
        "gameId": "sakura-market",
        "gameName": "Sakura Market",
        "fixtureSlug": "sakura-market"
      },
      "media": {
        "duration": 118.3,
        "videoCodec": "h264",
        "videoWidth": 1920,
        "videoHeight": 1080,
        "audioPresent": true
      },
      "contractValidation": {
        "passed": true,
        "errorCount": 0,
        "errors": []
      }
    }
  ]
}
```

### What the report proves

- Which fixtures were enabled and ran
- Normalized input provenance (which metadata + extract files produced it)
- All required artifacts were generated and are non-empty
- Manifest identity matches the fixture registry
- MP4 media properties: duration, codec, resolution, audio presence
- Contract validation passed for each fixture

### Where the report lives

The report is written to two locations during test execution:

1. **Temporary directory** — primary copy at `<temp-dir>/real-input-smoke-coverage.json`
   (path printed to stdout during test run).
2. **CI artifact path** — `artifacts/real-input-smoke-coverage.json` in the workspace
   root. This path is uploaded as a downloadable GitHub Actions artifact.

The report is **not committed to Git** (the CI artifact path is in `.gitignore`).

### CI artifact

After each `build-and-qa` job completes, the report is uploaded as:

```
real-input-smoke-coverage-<os>
```

For example:
- `real-input-smoke-coverage-ubuntu-latest`
- `real-input-smoke-coverage-windows-latest`
- `real-input-smoke-coverage-macos-latest`

Artifacts are retained for 14 days. Download from the GitHub Actions run page
under the Artifacts section.

The upload uses `if-no-files-found: ignore` so it does not fail the job if the
smoke was skipped (e.g., on a machine without FFmpeg during local development).

### Helper module

The report generation logic is in `tests/helpers/realInputSmokeCoverageReport.cjs`
with unit tests at `tests/scripts/realInputSmokeCoverageReport.test.js`.

## Offline Preview CLI

Run a registered fixture through the full offline pipeline on demand:

```bash
node scripts/run-real-input-preview.mjs --fixture sakura-market --out out/real-input-previews/sakura-market
node scripts/run-real-input-preview.mjs --fixture stellar-drift --out out/real-input-previews/stellar-drift
```

### Ad-hoc local source mode

Run a preview from local metadata, rulebook-extract, and expected contract files
without registering in `fixtures.json`:

```bash
node scripts/run-real-input-preview.mjs \
  --metadata /path/to/my-game.metadata.json \
  --rulebook-extract /path/to/my-game.rulebook-extract.json \
  --expected /path/to/my-game.expected.json \
  --out out/real-input-previews/my-game
```

Ad-hoc mode:
- Derives slug and game name from `metadata.slug` and `metadata.title`
- Validates source contracts without registry identity checks
- Runs the same pipeline as registered mode (normalize → generate → render → ffprobe → validate → coverage report)
- Marks the coverage report entry with `sourceMode: "ad-hoc"`
- Does not mutate `fixtures.json`

### Mode exclusivity

The CLI enforces mutual exclusivity between modes:
- `--fixture` cannot be combined with `--metadata`, `--rulebook-extract`, or `--expected`
- Ad-hoc mode requires all three source paths: `--metadata`, `--rulebook-extract`, `--expected`
- Both modes require `--out`

### Preview package manifest

Every successful CLI run writes `preview-package-manifest.json` in the output
directory. This self-describing manifest summarizes the entire run:

| Field | Description |
|-------|-------------|
| `_schema` | `preview-package-manifest/v1` |
| `generatedAt` | ISO timestamp of generation |
| `sourceMode` | `registered` or `ad-hoc` |
| `fixtureSlug` | Game slug used for the run |
| `gameName` | Human-readable game name |
| `source` | References to metadata, rulebook-extract, and expected contract files |
| `output.artifacts` | Per-file entries with `exists`, `size` (bytes), and `sha256` hash |
| `validation` | Contract validation result: `passed`, `errorCount`, `errors` |
| `media` | Summary from ffprobe: duration, codec, resolution, audio presence |

The manifest enables artifact reviewers to understand a CI smoke package without
opening every file. SHA-256 hashes provide tamper detection for key outputs.

### Requirements

- Node.js 20+
- FFmpeg with drawtext filter on PATH

### Pipeline steps

1. Load `fixtures.json` registry and find the fixture by slug
2. Validate fixture files exist on disk
3. Normalize metadata + rulebook-extract into canonical fixture
4. Generate tutorial preview artifacts (script, storyboard, captions, render-config, manifest)
5. Render `preview.mp4` via FFmpeg
6. Capture `ffprobe.json` media metadata
7. Validate against the fixture's expected contract
8. Write `real-input-preview-coverage.json` coverage report

### Output directory contents

```
<out>/
  <slug>-normalized.json       # Canonical fixture from normalizer
  script.json                   # Tutorial script
  storyboard.json               # Storyboard scenes
  captions.srt                  # SRT captions
  render-config.json            # FFmpeg render configuration
  manifest.json                 # Generation manifest with identity
  preview.mp4                   # Rendered tutorial preview video
  ffprobe.json                  # Media metadata from ffprobe
  validation-result.json        # Contract validation result
  real-input-preview-coverage.json  # Coverage report for this run
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | All steps passed, contract validation succeeded |
| 1 | Pipeline or validation failure (render failed, contract violated, etc.) |
| 2 | Invalid arguments (missing --fixture/--out, unknown slug, disabled fixture) |

### Error examples

```bash
# Missing arguments
$ node scripts/run-real-input-preview.mjs
# → exit 2, prints usage

# Unknown fixture
$ node scripts/run-real-input-preview.mjs --fixture bad-slug --out /tmp/x
# → exit 2, prints "Unknown fixture slug" + available slugs
```

### Shared helpers

| Module | Role |
|--------|------|
| `tests/helpers/realInputFixtureRegistry.cjs` | Registry loading, fixture lookup, path resolution, file validation |
| `scripts/validate-real-input-preview-artifact.cjs` | Contract validation |
| `tests/helpers/realInputSmokeCoverageReport.cjs` | Coverage report generation |

## CI CLI Smoke

In addition to the E2E smoke test (which runs both fixtures via Jest), CI also
executes the operator-facing CLI directly for one fixture to prove end-to-end
orchestration works outside the test harness:

```
node scripts/run-real-input-preview.mjs --fixture sakura-market --out out/real-input-cli-smoke/sakura-market
```

## Source Contract Validation

Before normalization, both the CLI and E2E smoke validate source inputs against
a structural contract. This catches malformed or incomplete fixture files before
the pipeline attempts rendering.

### Validation command

```bash
# Validate all enabled fixtures
node scripts/validate-real-input-source-contract.cjs --all

# Validate one fixture by slug
node scripts/validate-real-input-source-contract.cjs --fixture sakura-market
```

### Metadata contract rules

| Field | Requirement |
|-------|-------------|
| `slug` | Non-empty string |
| `title` | Non-empty string |
| `playerCount` | Object with `min` and `max` (positive numbers, min <= max) |
| `designers` | Non-empty array of non-empty strings |
| `playtimeMinutes` | Optional; if present, object with non-negative `min` and `max` |
| `description` | Optional; if present, must be a string |

### Rulebook-extract contract rules

| Field | Requirement |
|-------|-------------|
| `objective` | Non-empty string |
| `components` | Non-empty array of objects with `name` (non-empty string) |
| `setup` | Non-empty array of non-empty strings |
| `turnStructure` | Object with `phases` (non-empty array) and `description` (non-empty string) |
| `coreMechanic` | Object with `name` and `description` (both non-empty strings) |
| `scoring` | Object with `winCondition` (non-empty string) |

### Identity consistency

When a registry entry is provided, the validator also checks:
- `metadata.slug` matches `registry.slug`
- `metadata.title` matches `registry.gameName`

### Integration points

- **Offline CLI** (`scripts/run-real-input-preview.mjs`) — validates before normalization; exits 1 on failure
- **E2E smoke** (`tests/e2e/tutorial_full_flow_smoke.test.js`) — validates in `beforeAll` before each fixture is normalized/rendered
- **Standalone CLI** (`scripts/validate-real-input-source-contract.cjs`) — validates one or all fixtures independently

## CI CLI Smoke (continued)

This runs in every `build-and-qa` job (Ubuntu, Windows, macOS) and:
- Proves the CLI can load the registry, normalize, generate, render, probe, validate, and report
- Verifies all 10 expected output files exist after the run
- Uploads the full output as a downloadable CI artifact

### CI CLI smoke artifacts

| OS | Artifact name |
|----|---------------|
| ubuntu-latest | `real-input-cli-smoke-ubuntu-latest` |
| windows-latest | `real-input-cli-smoke-windows-latest` |
| macos-latest | `real-input-cli-smoke-macos-latest` |

Retention: 14 days. Download from the GitHub Actions run page.

### Why only one fixture?

The CLI smoke uses `sakura-market` (the original stable real-input sample) to
keep CI runtime bounded. The full two-fixture matrix is already exercised by the
E2E smoke test in the same job. The CLI smoke specifically proves the operator
CLI path — not fixture coverage breadth.

### Ad-hoc CLI smoke

CI also exercises the ad-hoc local-source mode using explicit file paths (not
`--fixture` registry lookup):

```
node scripts/run-real-input-preview.mjs \
  --metadata tests/fixtures/tutorial-real-input/sakura-market.metadata.json \
  --rulebook-extract tests/fixtures/tutorial-real-input/sakura-market.rulebook-extract.json \
  --expected tests/fixtures/tutorial-real-input/sakura-market.expected.json \
  --out out/real-input-adhoc-cli-smoke/sakura-market
```

This proves the ad-hoc mode pipeline works end-to-end in CI without depending
on the fixture registry. Artifacts are uploaded as:

| OS | Artifact name |
|----|---------------|
| ubuntu-latest | `real-input-adhoc-cli-smoke-ubuntu-latest` |
| windows-latest | `real-input-adhoc-cli-smoke-windows-latest` |
| macos-latest | Skipped (no drawtext) |

The ad-hoc smoke uses the same `drawtext` guard as the registered CLI smoke.
