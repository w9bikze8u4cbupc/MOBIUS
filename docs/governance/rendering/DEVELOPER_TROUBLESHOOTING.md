# Rendering Troubleshooting Guide

Use this guide when CI fails ARC validation or golden checks.

## 1. Common Failures

### FPS mismatch
- Check `ffprobe` `avg_frame_rate` and `r_frame_rate`.
- Ensure no FPS filter is applied implicitly.

### Pixel format drift
- Ensure the filtergraph ends with `-pix_fmt yuv420p`.

### SAR mismatch
- Add `-vf "setsar=1:1"` if FFmpeg outputs non-1:1 SAR.

### SSIM below threshold
- Inspect debug frames in the CI artifact bundle.
- Confirm masks are applied before SSIM.
- If visuals are correct, coordinate a baseline promotion.

### Missing CI artifacts
- Ensure steps contain `actions/upload-artifact@v4` with correct globbing.

## 2. Debug Commands

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,avg_frame_rate,r_frame_rate,pix_fmt,sample_aspect_ratio \
  -of json <file>

node scripts/rendering_consistency.mjs --debug
```

## 3. Escalation

- Capture triage notes using `docs/ops/rendering_consistency_standards.md` template.
- Tag the Rendering Governance Group (`@mobius/rgg`) in PR comments when blocked.
- Open an RFC draft if invariants require modification.

