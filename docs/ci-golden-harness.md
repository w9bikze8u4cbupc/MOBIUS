# Golden Preview Harness

Deterministic visual/audio regression checks for tutorial previews using:
- Visual: SSIM at fixed timestamps (default 5s/10s/20s) with resolution-safe scale2ref
- Audio: EBU R128 loudness (LUFS/True Peak) when audio exists
- Container: pixel format, FPS (with 30 vs 30000/1001 normalization), SAR, etc.
- CI: JUnit XML, debug diff images, per-OS baselines (linux/macos/windows)
- Provenance: container.json captures Node/npm/git/OS + ffmpeg/ffprobe versions

## Prerequisites
- Node.js 20+
- ffmpeg and ffprobe on PATH

## Directory layout (per game)
- tests/golden/<game>/<os>/
  - frames/: frame_5s.png, frame_10s.png, frame_20s.png, …
  - container.json (invariants + environment metadata)
  - loudness.json (only if audio exists)
  - debug/ (created only on failures; cleaned each run)
  - (optional) config.json, mask.json

## Git LFS for Golden Frames
To prevent repository bloat from PNG frame files, consider tracking tests/golden/** with Git LFS:
```bash
git lfs track "tests/golden/**/*.png"
git add .gitattributes
```

## Quick start (local)
1) Render a preview (replace with real commands)
   - npm run render:hanamikoji
2) Approve baselines (per-OS)
   - node scripts/generate_golden.js --game hanamikoji --perOs
3) Check against baselines (with JUnit)
   - mkdir -p tests/golden/reports
   - node scripts/check_golden.js --game hanamikoji --perOs --junit tests/golden/reports/junit-local-hanamikoji.xml

## Expected
- If proxy has no audio: "no audio stream detected – skipping loudness checks"
- SSIM for 5s/10s/20s ≥ 0.995 by default
- On failure, debug diff PNGs appear under tests/golden/<game>/<os>/debug/

## CI
- On PR/push: .github/workflows/golden-preview-checks.yml runs on Ubuntu/macOS/Windows, uploads JUnit XML and debug diffs (if failures)
- Rebaseline intentionally: use .github/workflows/golden-approve.yml (workflow_dispatch), download artifacts, inspect, and commit new baselines

## Scripts
- npm run golden:check:all            # Run checks for all games (per-OS)
- npm run golden:check:junit          # Check with JUnit path
- npm run golden:update -- --game X   # Approve baselines (use --perOs as needed)
- npm run golden:approve -- --game X  # Alias to golden:update

# Optional per-game config and masking

Per-game config to override frames and thresholds (place at tests/golden/<game>/config.json):

```json
{
  "frames": [5, 10, 20],
  "ssimThreshold": 0.995,
  "audio": {
    "lufsTolerance": 1.0,
    "dbtpTolerance": 1.0
  },
  "mask": "mask.json"
}
```

Optional mask.json to ignore dynamic overlays before SSIM (same folder):

```json
{
  "rects": [
    { "x": 1700, "y": 20, "w": 200, "h": 80 },
    { "x": 40, "y": 1000, "w": 600, "h": 64 }
  ]
}
```

Your check script can draw these boxes (black@1) on both inputs before ssim, after scale2ref, e.g. drawbox chain applied to both streams.

# CONTRIBUTING snippet

## Golden Baselines Workflow

- Local smoke test:
  - npm run golden:check:all
- Single game with JUnit:
  - mkdir -p tests/golden/reports
  - node scripts/check_golden.js --game <game> --perOs --junit tests/golden/reports/junit-local-<game>.xml
- Approve baselines (per-OS):
  - node scripts/generate_golden.js --game <game> --perOs
- CI:
  - PRs must pass all OS jobs in "Golden Preview Checks"
- Rebaseline on intentional visual changes:
  - Actions → "Golden Approve" → Run → download artifacts → inspect → commit tests/golden/**
- Notes:
  - Proxies without audio skip loudness checks (expected)
  - FPS: 30 and 30000/1001 are treated as equivalent
  - Debug diffs are cleaned on each run and uploaded on failures

# CI polish (optional)

Add a PR test summary from JUnit (append to your checks job):

```yaml
- name: Publish Unit Test Results
  if: always()
  uses: EnricoMi/publish-unit-test-result-action@v2
  with:
    files: |
      tests/golden/reports/*.xml
```

Add concurrency to auto-cancel stale runs:

```yaml
concurrency:
  group: golden-${{ github.ref }}-${{ github.workflow }}
  cancel-in-progress: true
```

# Troubleshooting quick hits

## JUnit not found
Use either "--junit path" or "--junit=path"; ensure the directory exists (script creates it).

## Windows quoting
Prefer Node scripts over long npm inline -e one-liners if quoting becomes brittle.

## Baseline missing in CI
Ensure you've committed tests/golden/<game>/<os>/ frames + container.json (+ loudness.json if audio exists).

## FPS mismatch
Your script normalizes 30 vs 30000/1001 prior to asserting; keep that behavior for cross-platform stability.

## Missing baseline directory
If you get an error about a missing baseline directory, run the generate script:
```bash
node scripts/generate_golden.js --game <game> --perOs
```

## Debug diffs not appearing
Debug diffs are only created when SSIM falls below the threshold. If you're not seeing them, the comparison may be passing.

## Artifact retention
CI artifacts are retained for 7 days by default. Adjust the retention-days parameter in the workflow if needed.