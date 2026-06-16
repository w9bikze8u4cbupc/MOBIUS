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
