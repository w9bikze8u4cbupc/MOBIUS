# Golden Baseline Promotion Protocol

This protocol ensures stable, meaningful golden frames across OS platforms.

## 1. When Baselines Can Be Updated
A golden baseline update is allowed ONLY when:

- Rendering pipeline code intentionally changes output.
- FFmpeg or encoder tooling is upgraded.
- Motion/callout/template rules change.
- Deterministic diff noise is proven to be a platform artifact.

## 2. Developer Flow

1. Run:

   ```bash
   node scripts/rendering_consistency.mjs --game <game> --platform <os>
   ```

2. Inspect:
   - SSIM report
   - Debug frames
   - `ffprobe.json`

3. If output is correct and differences are expected:

   ```bash
   node scripts/promote_baselines.mjs --game <game> --platform <os>
   ```

## 3. Required PR Metadata

- PR label: `rendering-baseline-update`
- PR template checkbox: “Rendering Impact: YES”
- Attach diff screenshots or `ssim.log` excerpt.
- Attach updated frames and `container.json`.

## 4. CI Requirements

- All platforms MUST pass after promotion.
- No regressions allowed in unrelated games.
- `validate-arc-semantic` MUST be green on the promotion PR.

