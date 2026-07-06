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

## Usage

These fixtures use the same JSON schema as `tests/fixtures/tutorial-vertical-slice/`
and can be consumed directly by `scripts/generate-tutorial-preview.mjs`.
