# Tutorial Preview Demo — Reproducibility Milestone

## Status: FROZEN

The first visible tutorial preview vertical slice is now fully reproducibility-gated. Every byte of rendered output is deterministic and machine-verified before artifact upload.

---

## Milestone Identity

| Field | Value |
|-------|-------|
| Final PR | #433 |
| Merge commit | `19fae5cdbff1c1547aeaea5518edbe6ab690539c` |
| Validation run | `27838522818` |
| Head SHA | `19fae5cdbff1c1547aeaea5518edbe6ab690539c` |
| Artifact name | `mobius-tutorial-preview-gem-collectors` |
| Artifact ID | `7754895161` |
| Artifact digest | `sha256:212116f33668b292e1be3c4181c24c2f1b14612c41e5f02e6398d2adf11d3898` |
| Workflow | `Tutorial Preview Demo` (manual `workflow_dispatch` only) |

---

## Artifact Inventory (17 files)

### Core Files (7)

| File | Size (bytes) |
|------|-------------|
| `preview.mp4` | 581,180 |
| `script.json` | 3,875 |
| `storyboard.json` | 9,805 |
| `captions.srt` | 2,274 |
| `render-config.json` | 4,629 |
| `manifest.json` | 729 |
| `ffprobe.json` | 4,439 |

### Visual QA Files (10)

| File | Size (bytes) |
|------|-------------|
| `visual-qa/contact-sheet.jpg` | 43,733 |
| `visual-qa/visual-qa-manifest.json` | 1,003 |
| `visual-qa/frames/frame-01.jpg` | 55,224 |
| `visual-qa/frames/frame-02.jpg` | 48,073 |
| `visual-qa/frames/frame-03.jpg` | 52,587 |
| `visual-qa/frames/frame-04.jpg` | 50,642 |
| `visual-qa/frames/frame-05.jpg` | 52,802 |
| `visual-qa/frames/frame-06.jpg` | 52,096 |
| `visual-qa/frames/frame-07.jpg` | 52,171 |
| `visual-qa/frames/frame-08.jpg` | 42,798 |

---

## MP4 Media Contract

| Property | Value |
|----------|-------|
| Video codec | H.264 High |
| Audio codec | AAC |
| Resolution | 1920x1080 |
| Frame rate | 30 fps |
| Duration | ~85 seconds |
| Streams | 2 (video + audio) |

## MP4 Bitstream Fingerprint

| Field | Value |
|-------|-------|
| SHA-256 | `183126452f9baee89ca3f63543e1c788352ca8db05b28d8e388a6a0e241895bb` |
| Size | 581,180 bytes |

---

## Five Workflow Gates (exact order)

The workflow fails before artifact upload if any gate does not pass.

1. **Validate artifact contract** — confirms 7 core files exist, are non-zero, and satisfy media/content contracts (codec, resolution, fps, duration, segment counts, cue counts, SRT structure).

2. **Generate visual QA contact sheet** — extracts 8 evenly-spaced keyframes and assembles a 4x2 tiled contact sheet for human review.

3. **Validate visual QA contract** — confirms contact sheet, manifest, and 8 frame JPEGs exist with correct structural metadata (frame count, timestamps, grid, FFmpeg version).

4. **Validate golden metadata baseline** — compares generated metadata (segment counts, scene counts, cue counts, codec, resolution, fps, duration, file sizes) against `gem-collectors-baseline.json` with explicit tolerances.

5. **Validate golden frame fingerprints** — compares SHA-256 hashes of all 9 visual QA images against `gem-collectors-frame-fingerprints.json`.

6. **Validate golden MP4 fingerprint** — compares SHA-256 hash and byte size of `preview.mp4` against `gem-collectors-mp4-fingerprint.json`, with optional media metadata cross-check.

7. **Upload tutorial preview artifacts** — uploads only after all gates pass.

---

## Baseline Files

| Baseline | Guards |
|----------|--------|
| `tests/golden/tutorial-preview/gem-collectors-baseline.json` | Metadata/tolerance: segment counts, scene counts, cue counts, codec, resolution, fps, duration range, file size ranges, visual QA timestamps, FFmpeg version prefix |
| `tests/golden/tutorial-preview/gem-collectors-frame-fingerprints.json` | Byte-exact SHA-256 hashes for 9 visual QA images (contact sheet + 8 frames) |
| `tests/golden/tutorial-preview/gem-collectors-mp4-fingerprint.json` | Byte-exact SHA-256 and size for `preview.mp4`, plus media metadata cross-check |

---

## How to Intentionally Update Baselines

After an approved renderer, fixture, storyboard, or FFmpeg change:

1. Trigger `Tutorial Preview Demo` manually from `main`.
2. The workflow will fail at the gate that detects drift.
3. Inspect the failing log message — it identifies the expected vs actual value.
4. Download the artifact and verify the new output is visually correct.
5. Update only the relevant baseline JSON with the new expected values/hashes.
6. Commit and PR the baseline update with explicit rationale explaining the change.
7. Re-trigger the workflow to confirm the updated baseline passes.

Do not update baselines silently or without visual verification.

---

## FFmpeg Configuration

| Field | Value |
|-------|-------|
| Version | `n7.1.4-39-ga5faeca88f-20260615` |
| Source | BtbN/FFmpeg-Builds `autobuild-2026-06-15-15-03` |
| Archive | `ffmpeg-n7.1.4-39-ga5faeca88f-linux64-gpl-7.1.tar.xz` |
| SHA-256 | `dff1b3ba8401bc3520435d879be73eb21d7f884e0a149bd7139392be955a4942` |
| Acquisition | Pinned download with cache (`actions/cache@v4`) |
| Cache key | `ffmpeg-n7.1.4-39-ga5faeca88f-linux64-gpl` |

---

## Operator Runbook

### Trigger the workflow

```bash
gh workflow run "Tutorial Preview Demo" --ref main
```

### Monitor the run

```bash
gh run list --workflow="tutorial-preview-demo.yml" --limit 1
gh run view <run-id> --json status,conclusion
```

### Download and verify artifact

```bash
gh run download <run-id> --dir out/artifact-verify
```

### Compute MP4 hash locally

```bash
node -e "const c=require('crypto'),f=require('fs');const b=f.readFileSync('out/artifact-verify/mobius-tutorial-preview-gem-collectors/preview.mp4');console.log(c.createHash('sha256').update(b).digest('hex'),b.length)"
```

### Clean up verification folder

```bash
rm -rf out/artifact-verify
```

---

## Known Warnings

- **Node.js 20 deprecation** — GitHub Actions shows deprecation warnings for Node 20 in actions/cache, actions/checkout, actions/setup-node, actions/upload-artifact. These are cosmetic and do not affect functionality.
- **Pre-existing `Golden checks` failures** — unrelated to this workflow; these are from a separate golden check workflow.
- **Pre-existing `build-and-qa` failures** — unrelated; caused by missing root test dependencies on some OS matrices.
- **Pre-existing Windows `consistency` failures** — unrelated rendering consistency check.

---

## Next Engineering Options

After this milestone, the approved next steps are:

- **Option A: Fix unrelated global CI failures** — resolve `build-and-qa`, `Golden checks`, and `consistency` failures that block branch protection without admin overrides.

- **Option B: Add visual-quality scoring** — introduce perceptual hashing, SSIM scoring, or subjective review automation on top of the current byte-exact baseline.

- **Option C: Improve visual polish** — enhance the renderer (better typography, transitions, backgrounds) while deliberately updating baselines after review.

- **Option D: Expand to a second fixture** — prove generality by running the pipeline on a different game (e.g., Hanamikoji, Sushi Go) and establishing a second baseline set.

---

## Addendum — Cookbook Visual Polish v1 Baseline Refresh

PR #437 refreshed the byte-exact baselines after intentional cookbook visual
polish and deterministic safe-margin body wrapping. The approved source was the
pinned Linux CI artifact from renderer fix
`922d1b60f0eff6da820b61d7050294d0eea0c228`; no local render output was used.

| Field | Value |
|-------|-------|
| Capture run | `28406792019` |
| Artifact ID | `7966121646` |
| Artifact digest | `sha256:56c5ee497cae849994b8e2977a4b0ba8f66179af60e19e1cf72acea35940b326` |
| Artifact archive size | 1,386,600 bytes |
| MP4 SHA-256 | `ba91a3912d54956530f9591cd4e7e980f08e904b087236923b3298e988bdff2a` |
| MP4 size | 926,319 bytes |
| Advisory quality score | 100/100 |

---

## PR Chain

| PR | Title | Contribution |
|----|-------|-------------|
| #421 | ci: add Tutorial Preview Demo workflow | Initial manual workflow |
| #422 | fix: use apt-get for FFmpeg | FFmpeg setup repair |
| #423 | fix(ci): harden FFmpeg setup with timeout and preinstall detection | Runner hardening |
| #424 | fix(ci): increase FFmpeg setup step timeout to 7min | Timeout tuning |
| #425 | fix(ci): increase apt timeouts to 300s | Apt timeout tuning |
| #426 | fix(ci): use static FFmpeg build | Switch to BtbN static binary |
| #427 | fix(ci): pin FFmpeg to n7.1.4 with SHA-256 and cache | Deterministic FFmpeg |
| #428 | test: add artifact contract validator | Core artifact gate |
| #429 | feat: add visual QA contact sheet | Human-review visual output |
| #430 | test: add visual QA contract validator | Visual QA structural gate |
| #431 | test: add golden metadata baseline | Metadata/tolerance gate |
| #432 | test: add golden frame fingerprint baseline | Frame-level fingerprint gate |
| #433 | test: add golden MP4 bitstream fingerprint | Full bitstream fingerprint gate |
