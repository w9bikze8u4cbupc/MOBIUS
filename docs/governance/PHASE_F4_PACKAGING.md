# MOBIUS Phase F4 — Packaging & container.json Governance Pack

**Status:** ACTIVE  
**Owner:** MOBIUS Rendering Director (ChatGPT)  
**Subsystems:** Packaging, Export Manifests, CI Enforcement, ARC Integration  
**Prereqs:** Phase F2 + F3 complete, ARC v1.0.3 live, audio governance active

## 1. Phase Objective — Why F4 Exists

Phase F4 establishes a governed, deterministic, CI-enforced packaging system for rendered outputs. This includes:

- A `container.json` contract defining required metadata for each render.
- A schema + semantic validator that rejects malformed or incomplete manifests.
- CI jobs that:
  - Validate JSON schema
  - Validate semantic rules (durations match, hashes match, codec data correct)
  - Attach the manifest to JUnit as governed metadata
  - Fail if any packaging invariant is violated
- A pipeline step that cross-checks `container.json`’s media entries against the ARC (fps / SAR / loudness / SSIM coverage / etc.).
- A promotion protocol for when packaging fields change.

This is the natural continuation after F2 (video invariants) and F3 (audio invariants).

## 2. Scope of Work (F4)

### F4-A — `container.json` Specification (v1.0.0)

Defines required keys for:

- `tools` (ffmpeg, ffprobe)
- `env` (node, npm, git, os)
- `media`:
  - `video[]` objects
  - `audio[]` objects
  - `captions[]` objects
  - `images[]` objects
- `checksums` (sha256 mandatory)
- Project metadata (`projectId`, `game`, `os`, `timestamp`)
- Render metadata (`mode`, `fps`, `resolution`)
- ARC linkage (`arcVersion`, `arcSha256`)

### F4-B — JSON Schema (`container.schema.json`)

- Proper `$id`, `type: object`, required arrays, enum constraints.

### F4-C — Semantic Validator

Checks:

- Every media file listed exists on disk
- File sizes > 0 and consistent with stream duration
- Duration (from ffprobe) matches `container.json.durationSec` ± epsilon
- `bitrateKbps` computed from actual file matches within tolerance
- Loudness values match ARC tolerances
- SHA256 digest matches actual file
- Node/FFmpeg versions match CI execution environment
- ARC version in `container.json` matches ARC used during render

### F4-D — CI Integration

Adds job: `golden:packaging-check`

This job:

- Validates schema
- Runs semantic validator
- Produces JUnit testcase: `packaging-contract[…]`
- Uploads:
  - `container.json`
  - `packaging.log`
  - `semantic-validator.json`

### F4-E — Governance Documentation

Three new documents:

- `docs/governance/PACKAGING_GOVERNANCE.md`
- `docs/spec/container.schema.json`
- `docs/guides/packaging_troubleshooting.md`

### F4-F — Promotion Protocol

Any change to `container.json` spec requires:

- Version bump
- CHANGELOG entry
- New semantic rule tests
- PR with `governance:packaging` label

## 3. `container.json` Contract (v1.0.0)

```json
{
  "project": {
    "id": "<string>",
    "game": "<string>",
    "os": "windows | macos | linux",
    "mode": "preview | full",
    "timestamp": "<ISO8601>"
  },
  "arc": {
    "version": "<semver>",
    "sha256": "<hex>"
  },
  "tools": {
    "ffmpeg":  { "version": "<semver>" },
    "ffprobe": { "version": "<semver>" }
  },
  "env": {
    "node": { "version": "<semver>" },
    "npm":  { "version": "<semver>" },
    "git":  {
      "version": "<semver>",
      "branch": "<branch>",
      "commit": "<sha>"
    },
    "os": {
      "name": "Windows|macOS|Linux",
      "platform": "<win32|darwin|linux>",
      "release": "<string>",
      "arch": "<x64|arm64>"
    }
  },
  "media": {
    "video": [
      {
        "path": "<string>",
        "codec": "h264|h265|vp9|av1",
        "width": 1920,
        "height": 1080,
        "fps": 30,
        "bitrateKbps": 8000,
        "durationSec": 120.3,
        "pixFmt": "yuv420p",
        "sar": "1:1",
        "sha256": "<hex>"
      }
    ],
    "audio": [
      {
        "path": "<string>",
        "sampleRate": 48000,
        "channels": 2,
        "lufsIntegrated": -16.1,
        "truePeakDbtp": -1.2,
        "durationSec": 120.3,
        "sha256": "<hex>"
      }
    ],
    "captions": [
      {
        "path": "<string>",
        "language": "en|fr|…",
        "sha256": "<hex>"
      }
    ],
    "images": [
      {
        "path": "<string>",
        "width": 1280,
        "height": 720,
        "sha256": "<hex>"
      }
    ]
  }
}
```

## 4. Acceptance Criteria (F4)

F4 is complete when:

- **AC-01** `container.schema.json` exists — JSON schema passes `ajv`.
- **AC-02** Semantic validator running in CI — fails for:
  - missing files
  - mismatched durations
  - mismatched loudness vs ARC
  - missing SHA256
  - incorrect FPS/pix_fmt/SAR
- **AC-03** JUnit contains `<testcase name="packaging-contract[…]" />`
- **AC-04** Documents added:
  - `PACKAGING_GOVERNANCE.md`
  - Troubleshooting guide
  - Updated PR template
- **AC-05** ARC → `container.json` linkage — every CI run exposes `arcVersion` in JUnit `<properties>`.
- **AC-06** Determinism — two identical runs produce identical `container.json` except timestamps and hashes.

## 5. CI Workflow Additions

Add a new GitHub Actions job:

```yaml
jobs:
  packaging-validation:
    needs: [render-consistency, audio-governance]
    runs-on: ubuntu-latest
    steps:
      - checkout
      - node setup
      - run schema validator
      - run semantic validator
      - generate JUnit
      - upload artifacts
```

## 6. Documentation Index Updates

Add:

```
docs/governance/
  PACKAGING_GOVERNANCE.md
  MASK_GOVERNANCE.md
  AUDIO_GOVERNANCE.md
  ARC_GOVERNANCE.md
  PACKAGING_PROMOTION_PROTOCOL.md
docs/spec/
  authoritative_rendering_contract.json
  container.schema.json
```

## 7. How F4 Interacts with Previous Phases

From F2 (video governance):

- `container.json` must reflect ARC video constraints
- fps / SAR / pix_fmt must match CI expectations

From F3 (audio governance):

- `container.json` audio fields undergo numeric tolerance validation
- loudness normalization must match ARC

## 8. Director Decision (non-optional)

We proceed immediately into drafting the `container.schema.json` and the semantic validator code layout next.

If you want the PR-ready files (JS validators, schema JSON, CI .yml diff, JUnit integration), say:

> 👉 “Generate F4 implementation pack”

Otherwise, I continue automatically in the next message.

As director: Phase F4 is now officially in motion.
