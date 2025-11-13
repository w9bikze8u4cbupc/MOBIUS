# Rendering Governance Lifecycle

## 1. ARC Ownership
ARC is owned by the Rendering Governance Group (RGG).

## 2. Update Types

### Patch
- JSON cleanup
- Clarifying comments
- No behavior changes

### Minor
- Adds new keys (optional)
- Backwards-compatible

### Major
- Changes invariants
- Modifies FPS, SAR, pix_fmt, audio targets
- Requires RFC

## 3. RFC Workflow
- Create `docs/rfc/rendering/<id>.md`
- Include:
  - Motivation
  - New invariants
  - Migration steps
  - Golden impact
- Label PR: `rendering-rfc`
- Two approvals required.

## 4. Baseline Lifecycle
- Preview → Candidate → Golden stages documented in `BASELINE_PROMOTION_PROTOCOL.md`.
- Candidate builds MUST soak for one full CI cycle on all platforms.
- Golden promotions recorded in `docs/rfc/rendering/changelog.md`.

## 5. Enforcement
- CI blocks merges when invariants are violated.
- Only RGG can promote golden baselines.
- ARC semantic validator MUST pass for every ARC revision PR.

## 6. Observability
- Rendering dashboards track SSIM, FPS, SAR, audio metrics per platform.
- Incident reviews require attaching ARC version and baseline IDs.

