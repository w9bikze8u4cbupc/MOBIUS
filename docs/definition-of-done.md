# Definition of Done Checklist

Before merging a PR, ensure all of these criteria are met:

## Provenance
- [ ] `artifacts/ffmpeg_version.txt` present and non-empty
- [ ] `artifacts/repro_manifest.json` present and parseable

## Audio
- [ ] ebur128 report present
- [ ] Integrated LUFS in gate (-17 to -15 LUFS)
- [ ] True Peak <= -1.0 dBFS
- [ ] Loudness Range <= 11 LU

## Video/Container
- [ ] Pixel format is yuv420p
- [ ] Average frame rate is 30/1
- [ ] Sample aspect ratio is 1:1
- [ ] Resolution matches target (e.g., 960x540 preview)

## Transitions
- [ ] TransitionVisualizer render covers all segments with at least one overlay enabled

## Theme
- [ ] `theme.json` loaded without fallback warnings

## Cross-OS Compatibility
- [ ] CI passes on Ubuntu
- [ ] CI passes on macOS
- [ ] CI passes on Windows

## Reproducibility
- [ ] `npm ci` + `npm run render:preview` is sufficient on a clean machine

## Coverage
- [ ] All operations in `opsMustCover` are included in the tutorial
- [ ] Timing invariants are maintained (no micro-beats < 300 ms)
- [ ] Minimum on-screen time requirements are met (>= 2.0 s)
- [ ] Transitions are within acceptable range (0.3–0.4 s unless VO edge forces hard cut)

## Verification
- [ ] Component contradiction checks pass
- [ ] Alignment data is properly bound
- [ ] Golden drift checks pass