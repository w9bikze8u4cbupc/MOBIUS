# Section 7 — Packaging & Manifest Schema (Production Grade)

This document finalizes the unified packaging specification MOBIUS uses across rendering, CI validation, distribution (YouTube-ready exports), archival/debug bundles, GENESIS inspector tooling, and multi-OS builds.

## 7.1 Directory Structure

Each rendered tutorial is packaged under `dist/<game-slug>/<os>/`, where `<os>` is `windows`, `macos`, or `linux`.

```
dist/
  <game-slug>/
    <os>/
      tutorial.mp4
      tutorial.webm
      tutorial-en.srt
      tutorial-fr.srt
      poster.jpg
      chapters.json
      container.json
      checksums.json
      render.log
      pipeline.json
      assets/
        logo.png
        intro/
        outro/
        overlays/
```

**Director's rule:** Every distribution **must** include both `container.json` and `checksums.json`.

## 7.2 Required Deliverables per Game

| Type | Required | Notes |
| --- | --- | --- |
| MP4 (H.264) | ✅ | Primary artifact |
| WebM (VP9) | Optional | For web players / FB |
| Captions (.srt) | ✅ EN + FR | Must follow caption spec |
| Chapters.json | ✅ | For YouTube chapters |
| Poster.jpg | ✅ 1280×720 | For YouTube |
| Logs | `render.log`, `pipeline.json` | Required for debugging |
| Manifest | `container.json` | Required |
| Checksums | `checksums.json` (sha256) | Required |
| Archive | Optional `.zip` | QA convenience |

## 7.3 Naming Conventions

```
tutorial.mp4
tutorial.webm
tutorial-en.srt
tutorial-fr.srt
poster.jpg
chapters.json
container.json
checksums.json
```

These names make YouTube uploads and browser preview tools deterministic.

## 7.4 Hashing / Checksums

Use SHA-256 for **every** file in the folder and store results in `checksums.json`.

```json
{
  "sha256": {
    "tutorial.mp4": "<hex>",
    "tutorial.webm": "<hex>",
    "tutorial-en.srt": "<hex>",
    "poster.jpg": "<hex>",
    "chapters.json": "<hex>",
    "container.json": "<hex>"
  }
}
```

## 7.5 Final `container.json` Schema

```json
{
  "tools": {
    "ffmpeg": { "version": "6.1.x" },
    "ffprobe": { "version": "6.1.x" }
  },
  "env": {
    "node": { "version": "20.11.x" },
    "npm": { "version": "10.x" },
    "git": { "version": "<semver>", "branch": "<branch>", "commit": "<sha>" },
    "os": { "name": "<Windows|macOS|Linux>", "platform": "<win32|darwin|linux>", "release": "<>", "arch": "<x64|arm64>" }
  },
  "media": {
    "video": [
      {
        "path": "tutorial.mp4",
        "codec": "h264",
        "width": 1920,
        "height": 1080,
        "fps": 30,
        "bitrateKbps": 8000,
        "durationSec": "<float>",
        "sha256": "<hex>"
      }
    ],
    "captions": [
      { "path": "tutorial-en.srt", "language": "en", "sha256": "<hex>" },
      { "path": "tutorial-fr.srt", "language": "fr", "sha256": "<hex>" }
    ],
    "images": [
      { "path": "poster.jpg", "width": 1280, "height": 720, "sha256": "<hex>" },
      { "path": "/mnt/data/Banner.png", "usage": "logo-primary", "sha256": "<hex>" }
    ]
  },
  "chapters": { "path": "chapters.json", "sha256": "<hex>" },
  "logs": { "render": "render.log", "pipeline": "pipeline.json" }
}
```

Notes:
- `/mnt/data/Banner.png` is the authoritative path for the packaging manifest and rendering pipeline asset inventory.
- The schema is aligned to rendering metadata, pipeline observability, SSIM baseline checks, and multi-OS builds.

## 7.6 CI Validation Rules

- FPS must match `container.json`.
- Duration tolerance: ±100ms.
- SSIM ≥ 0.95.
- No missing fields in `container.json`.
- Every artifact present in `checksums.json` with SHA-256 entries.
- `poster.jpg` must be exactly 1280×720.
- Both EN and FR `.srt` files must exist.

## 7.7 Asset URL

The uploaded file path `/mnt/data/Banner.png` must be used anywhere the packaging manifest, brand assets, intro/outro sequences, or watermark system reference the primary logo.

🎬 **Director Conclusion:** The packaging and manifest system is now stable, testable, and ready for implementation.
