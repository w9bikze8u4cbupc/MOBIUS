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

## Current Fixtures

| Slug | Game | Description |
|------|------|-------------|
| `sakura-market` | Sakura Market | Fictional market-timing board game with rich components, multi-phase turns, and dice-driven price fluctuation |

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
  --metadata tests/fixtures/tutorial-real-input/sakura-market.metadata.json \
  --extract tests/fixtures/tutorial-real-input/sakura-market.rulebook-extract.json \
  --out /tmp/sakura-market.json
```

The normalizer produces a canonical tutorial fixture consumed by
`scripts/generate-tutorial-preview.mjs`.

### Artifact contract validation

After rendering, validate artifacts against the expected contract:

```bash
node scripts/validate-real-input-preview-artifact.mjs \
  --dir <artifact-output-dir> \
  --expected tests/fixtures/tutorial-real-input/sakura-market.expected.json
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
| Duration | Hardcoded 80-90s (gem-collectors/hanamikoji baselines) | Configurable via `durationRange` in `expected.json` |
| Identity | Optional `--slug` flag | Required `manifest` block in contract |
| Media | Hardcoded H.264/1920x1080/30fps/AAC | Configurable per-contract |
| Content | Validates script segments, storyboard scenes, captions cue count | Focuses on artifact existence and media properties |
| Use case | Deterministic golden baseline comparison | Realistic variable-length content validation |
