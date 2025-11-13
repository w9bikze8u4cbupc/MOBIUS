# ARC v1.0.2 Mask Schema

Masks allow the rendering consistency check to ignore known dynamic regions when
computing SSIM, stabilizing multi-OS golden frames and allowing intentional UI
motion without false regressions.

---

## 1. Structure

Each mask entry in `validation.masks[]` MUST follow:

```jsonc
{
  "name": "string",
  "type": "rect" | "poly",
  "platform": "any" | "windows" | "macos" | "linux",
  "frames": "all" | { "start": <int>, "end": <int> },

  // rect masks
  "rect": { "x": <int>, "y": <int>, "width": <int>, "height": <int> },

  // polygon masks
  "points": [ [x1, y1], [x2, y2], ... ]
}
```

## 2. Platform Routing

`platform` determines where the mask is applied:

- `any` — always applied
- `macos` — only for macOS jobs
- `windows` — only for Windows jobs
- `linux` — only for Linux jobs

This solves the “macOS-only FFmpeg fade noise” or “Windows DirectShow dithering” problems.

## 3. Frame Ranges

- `"all"` applies the mask to every extracted frame.
- `{ "start": 0, "end": 90 }` applies the mask to frames in that range (inclusive).
- Out-of-bounds indices MUST be ignored silently.

## 4. Semantic Requirements

A correct mask MUST satisfy:

- Rect masks: `width > 0`, `height > 0`
- Poly masks: at least 3 points
- Mask must be fully inside video bounds unless explicitly allowed
- Mask name MUST be unique
- No overlapping masks with different semantics (warning, not fatal)

## 5. Impact on SSIM

SSIM is computed on a frame-by-frame basis; when masks exist:

- Masked pixels are set to a neutral color (0 or 128 depending on YUV pipeline).
- SSIM is computed over unmasked pixels only.
- SSIM min threshold still applies globally for that frame.
- If all unmasked pixels are identical, SSIM is `1.0`.

## 6. Governance Notes

- Adding a new mask is a minor ARC version bump.
- Removing or radically changing a mask is major (requires RFC).
- All masks must be documented in this file.

---
