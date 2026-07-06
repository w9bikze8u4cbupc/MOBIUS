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
