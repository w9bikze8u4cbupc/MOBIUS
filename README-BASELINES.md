# Cross-Platform Golden Baselines

This document provides instructions for generating golden baselines on macOS and Linux platforms.

## macOS

```bash
cd <repo-root>
git pull --ff-only
npm ci

export RUNNER_OS=macOS
export GAME=space-invaders

# Generate your assets if needed (video/frames/audio)
# node scripts/generate_golden.cjs  # if you have a dedicated generator step

# Golden + JUnit
node scripts/check_golden.cjs --game "$GAME" --junit tests/golden/reports/${GAME}_macos.xml

# Validator
node scripts/ci/validate_mobius_checklist.cjs --game "$GAME"
```

## Linux

```bash
cd <repo-root>
git pull --ff-only
npm ci

export RUNNER_OS=Linux
export GAME=space-invaders

node scripts/check_golden.cjs --game "$GAME" --junit tests/golden/reports/${GAME}_linux.xml
node scripts/ci/validate_mobius_checklist.cjs --game "$GAME"
```

## Handling Missing Baselines

If the validator reports missing baselines:

1. Use the paths it prints (expected baseline paths).
2. Promote the current frames (or the "actual_*.png" from debug) into those paths.
3. Re-run the two commands above.

## Promoting from CI Artifacts

If you can't run locally on that OS:

1. In the failed job, download the artifact you added (reports + debug).
2. Promote the "actual_*" images to the baseline locations locally:

```bash
GAME=space-invaders
OS=macos   # or linux
for f in tests/golden/$GAME/$OS/debug/actual_*; do
  base=$(basename "$f" | sed 's/^actual_//')
  cp -f "$f" "tests/golden/$GAME/$OS/$base"
done
```

3. Commit and push, then re-run CI.