# First Visible Tutorial Video – Vertical Slice

## Overview

The MOBIUS tutorial vertical slice generates a complete beginner-first tutorial
preview from synthetic fixture data. The pipeline:

```
Fixture → Script → Storyboard → Captions/SRT → Render Config → MP4
```

## Quick Start

### Local Dry-Run (no FFmpeg required)

```bash
npm run demo:tutorial-preview
```

Produces `out/tutorial-preview/`:
- `script.json` — 11 segments, ~85s, Elite S1 ordered
- `storyboard.json` — 13 scenes (v1.1.0 contract)
- `captions.srt` — timed SRT subtitles
- `render-config.json` — ready for FFmpeg renderer
- `manifest.json` — pipeline summary

### Local Full Render (requires FFmpeg)

```bash
npm run demo:tutorial-preview
node scripts/render-storyboard-ffmpeg.mjs \
  --config out/tutorial-preview/render-config.json \
  --out out/tutorial-preview/preview.mp4
```

### CI-Generated MP4 Artifact (recommended)

1. Go to **Actions** → **Tutorial Preview Demo**
2. Click **Run workflow** (uses `workflow_dispatch`)
3. Wait for the job to complete (~1-2 minutes)
4. Download the `mobius-tutorial-preview-gem-collectors` artifact
5. Extract and play `preview.mp4`

## What's in the Preview

| Segment | Content |
|---------|---------|
| Hook | "After this video, you'll know how to play Gem Collectors..." |
| Game Identity | 2-4 players, 20 minutes |
| Objective | Collect the most valuable set of gems by drafting cards |
| Components | 60 gem cards, market board, score tokens, first player marker |
| Setup | 4 steps — shuffle, reveal market, distribute tokens, assign first player |
| Turn Structure | Take → Refill, ends when draw pile empty |
| Core Mechanic | Set Collection: 3 matching = 5pts, mixed pairs = 2pts |
| Scoring | Complete sets, pairs, win condition (most points, tiebreak) |
| Edge Cases | Empty market end, wild gem card rules |
| Recap | Summary + objective reminder |
| End Card | "You're ready to play Gem Collectors!" |

## Technical Details

- **Elite S1 Ordering**: Validated (objective → turn_structure → core_mechanic → scoring → edge_cases)
- **No LLM calls**: All narration derived directly from fixture fields
- **Source references**: Every segment has `sourceRef` pointing to fixture field
- **Deterministic**: Same input always produces same output
- **Confidence**: Always 1.0 (no AI uncertainty)
- **Game**: "Gem Collectors" — entirely synthetic/fictional, no copyright

## Limitations

- Visual output is text-on-color-background (no game art or animations yet)
- No real narration audio (text only, silent audio track)
- Single fixture game only
- No real PDF ingestion involved (fixture bypasses extraction)

## Resolution Paths for Enhancement

1. Add game art/screenshots as scene backgrounds
2. Add TTS narration audio per scene
3. Wire real PDF ingestion → script generation
4. Add animations and scene transitions
5. Support multiple fixture/game configurations

---

## Reproducibility Status

**FROZEN** — Full bitstream reproducibility is proven and gated.

The Tutorial Preview Demo workflow validates all generated output through five machine-checked gates before artifact upload. The MP4, all extracted frames, and the contact sheet are byte-identical across independent CI runs.

See [TUTORIAL_PREVIEW_REPRODUCIBILITY_MILESTONE.md](./TUTORIAL_PREVIEW_REPRODUCIBILITY_MILESTONE.md) for the complete milestone report including:
- Five-gate workflow order
- Artifact inventory with verified sizes
- MP4 bitstream fingerprint (SHA-256)
- Baseline file locations and update procedure
- Operator runbook
- Next engineering options

### Active Gates

| Gate | Validator | Status |
|------|-----------|--------|
| Core artifact contract | `validate:tutorial-preview-artifact` | Active |
| Visual QA structural contract | `validate:tutorial-preview-visual-qa` | Active |
| Golden metadata baseline | `validate:tutorial-preview-golden-baseline` | Active |
| Golden frame fingerprints | `validate:tutorial-preview-frame-fingerprints` | Active |
| Golden MP4 fingerprint | `validate:tutorial-preview-mp4-fingerprint` | Active |

### Cookbook Polish v1 Baseline Provenance

PR #437 intentionally changed deterministic pixels through cookbook-style visual
hierarchy and safe-margin body wrapping. The refreshed baseline comes only from
the pinned Linux CI artifact produced after renderer fix
`922d1b60f0eff6da820b61d7050294d0eea0c228`.

- Capture run: `28406792019`
- Artifact ID: `7966121646`
- Artifact digest: `sha256:56c5ee497cae849994b8e2977a4b0ba8f66179af60e19e1cf72acea35940b326`
- Artifact archive size: 1,386,600 bytes
- MP4 SHA-256: `ba91a3912d54956530f9591cd4e7e980f08e904b087236923b3298e988bdff2a`
- MP4 size: 926,319 bytes
- Advisory quality score: 100/100

### Second Fixture Provenance

PR #438 extends the same tutorial-preview pipeline to a second deterministic
fixture, `hanamikoji`, without weakening the original Gem Collectors path.
The workflow now publishes slug-specific artifacts:

- `mobius-tutorial-preview-gem-collectors`
- `mobius-tutorial-preview-hanamikoji`

Hanamikoji CI capture provenance:

- Capture run: `28410461854`
- Artifact ID: `7967453158`
- Artifact digest: `sha256:6d41cb05566b14eb72dd7bdeb02a5aae6d4762f01eacf143ba4eb6fb101705b7`
- Artifact archive size: 1,696,026 bytes
- MP4 SHA-256: `dfe387e8890143fa9743256b04f52d4b83bcc3054a0080244a89351b8cd6ac22`
- MP4 size: 1,110,320 bytes
- Advisory quality score: 100/100

Visual QA review of the CI artifact showed the Hanamikoji narration staying
inside the safe margins on the dense setup, turn-structure, scoring, and
special-rules frames.

### Trigger

```bash
gh workflow run "Tutorial Preview Demo" --ref main
```

Workflow is `workflow_dispatch` only — never triggered automatically by PR or push.
