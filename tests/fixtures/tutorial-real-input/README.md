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

## Fixture Matrix

| Slug | Game | Teaching Profile | Duration Range |
|------|------|------------------|----------------|
| `sakura-market` | Sakura Market | Competitive market-timing with dice-driven price fluctuation | 60–180s |
| `stellar-drift` | Stellar Drift | Cooperative tile-laying route-building through asteroids | 50–130s |

The fixture matrix is designed to exercise different tutorial structures:
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

## Adding a New Fixture

1. Create `<slug>.metadata.json` following the BGG-style schema (see `sakura-market.metadata.json`).
2. Create `<slug>.rulebook-extract.json` with objective, components, setup, turnStructure, coreMechanic, scoring, edgeCases.
3. Create `<slug>.expected.json` with gameId, gameName, fixtureSlug, durationRange, requiredArtifacts, media, manifest, minMp4Bytes.
4. Add the new entry to `REAL_INPUT_MATRIX` in `tests/e2e/tutorial_full_flow_smoke.test.js`.
5. Add normalizer unit tests in `tests/scripts/normalizeRealInputFixture.test.js`.
6. Run `node scripts/normalize-real-input-fixture.cjs --metadata <meta> --extract <extract>` to verify normalizer output.
7. Push and verify CI passes on all OS targets.
