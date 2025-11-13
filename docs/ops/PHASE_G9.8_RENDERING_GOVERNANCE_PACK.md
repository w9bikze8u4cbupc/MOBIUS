# 📦 MOBIUS — Phase G9.8 Rendering Governance Pack

**Status:** READY FOR GOVERNANCE SIGN-OFF  
**Owner:** Rendering & CI Director (MOBIUS)  
**Subsystem:** Rendering + Golden Baselines + Audio Metrics  
**Applies to:** All video exports, all CI runners (Windows/macOS/Linux), all golden tests

---

## 0. Quick Director Checklist (what this pack does)

- Locks a **single authoritative rendering contract** across all OS runners.
- Governs **when and how** rendering parameters (FPS, SAR, pix_fmt, LUFS, dBTP, bitrate) may change.
- Defines **required CI checks** and artifacts for rendering consistency and audio metrics.
- Establishes **baseline promotion rules** (when SSIM drift is acceptable vs blocked).
- Provides a **rollback and recovery** playbook for regressions.
- Codifies **roles, approvals, and labels** required to merge rendering-impacting PRs.

Once this pack is signed off, rendering behavior is *governed*, not “best effort”.

---

## 1. Scope and Objectives

### 1.1 In Scope

This pack governs:

- The **rendering pipeline** (FFmpeg orchestration and related options).
- **Encoding parameters:** resolution, FPS, pixel format, SAR, bitrate, audio sample rate/channels.
- **Loudness normalization and metrics:** `integrated_lufs`, `true_peak_dbfs`.
- **Golden baseline behavior:** SSIM thresholds, promotion, and drift handling.
- **CI enforcement:** workflows, scripts, required artifacts, and failure behavior.
- **Cross-platform determinism:** Windows, macOS, Linux must behave equivalently.

### 1.2 Out of Scope

- UX of the MOBIUS desktop/web UI.
- Non-rendering AI logic (script generation, image matching, etc.).
- GENESIS CLARITY metrics or other projects (this is MOBIUS-local, though style is similar).

---

## 2. Governing Documents and Contracts

The following documents are authoritative for rendering and MUST remain in sync:

1. **Rendering Consistency Standards Pack**  
   `docs/ops/rendering_consistency_standards.md`  
   → Defines codec, resolution, FPS, SAR, pix_fmt, bitrate, LUFS, dBTP, and SSIM thresholds.

2. **CI Audio Metrics Pipeline Guide**  
   `docs/ops/ci_audio_metrics_pipeline.md`  
   → Defines `preview_audio_metrics.json` schema and dual-OS validation gate.

3. **Rendering Consistency Workflow**  
   `.github/workflows/rendering-consistency.yml`  
   → Enforces cross-platform metadata, frame extraction, and SSIM checks.

4. **Authoritative Rendering Contract (ARC)**
   `docs/spec/authoritative_rendering_contract.json`
   → Canonical rendering/audio/test invariants consumed by tooling and CI.

5. **Consistency Check Script**
   `scripts/check_rendering_consistency.mjs`
   → Implements the standards as executable checks, emitting JUnit + artifacts.

If any of these change, the others MUST be reconciled in the same PR or via an explicitly linked RFC PR chain.

---

## 3. Invariants (Must-Never-Break Rules)

These invariants define “contract breakage”. Violating them requires an RFC and a new governance pack.

### 3.1 Video Encoding Invariants

- Resolution: **1920×1080** for all governed tests.
- Codec: **H.264 (libx264)**, container: **MP4**.
- FPS: **30 fps** (actual output) — `avg_frame_rate` may be `30`, `30/1`, or `30000/1001` but the pipeline **forces 30** for tests.
- Pixel format: **`yuv420p`** only.
- Sample Aspect Ratio: **`1:1`** only.
- Color: BT.709, TV/limited range.

### 3.2 Audio Invariants

- Sample rate: **48 kHz**, stereo.
- Integrated Loudness: **–16.0 LUFS ± 0.5**.
- True Peak Ceiling: **≤ –1.0 dBTP**, never exceed –0.8 dBFS.
- **Only** the following fields exist in `preview_audio_metrics.json`:
  - `integrated_lufs`
  - `true_peak_dbfs`

Any extra / missing fields or non-numeric values is an invariant violation.

### 3.3 Golden Test Invariants

- Extracted frames per 5-second preview: **150 ± 1** frames.
- SSIM:
  - **PASS:** `SSIM ≥ 0.95`
  - **SOFT_PASS:** `0.92 ≤ SSIM < 0.95`
  - **FAIL:** `SSIM < 0.92`
- Golden frames must be:
  - Existing,
  - Valid PNGs,
  - Size > 200 bytes (simple placeholder prevention).

---

## 4. Risk Classification

Rendering changes are classified as follows:

### 4.1 Low Risk

- Refactoring `scripts/check_rendering_consistency.mjs` without changing thresholds or invariants.
- Adding logs or additional CI artifacts (e.g., extra debug JSON).
- Documentation-only changes that **do not** touch numeric targets or invariants.

### 4.2 Medium Risk

- Adjusting SSIM thresholds within the existing categories (e.g., clarifying when SOFT_PASS is allowed) without changing boundaries.
- Modifying FFmpeg invocation defaults **without** altering encoded output characteristics (e.g., adding `-movflags +faststart`).

### 4.3 High Risk

- Changing:
  - Resolution, FPS, SAR, pix_fmt, codec or color space.
  - LUFS / True Peak targets or tolerances.
  - SSIM thresholds or classification boundaries.
  - Frame ranges or test clip durations.
- Any change that invalidates existing golden baselines across platforms.

**High-risk changes always require:**

- A Rendering RFC (see §5),
- Explicit governance approval,
- Updated golden baselines and test plan.

---

## 5. Governance Workflow

### 5.1 Required Labels

Rendering-impacting PRs MUST use at least one of:

- `rendering:low-risk`
- `rendering:medium-risk`
- `rendering:high-risk`
- `rendering:rfc`

High-risk changes MUST include `rendering:rfc`.

### 5.2 Rendering RFC Template (Summary)

For high-risk changes:

1. **Motivation:** Why the change is needed (e.g., new output resolution).
2. **Current vs Proposed Parameters:** Before/after table for all impacted invariants.
3. **Impact Analysis:** Which tests, baselines, and docs are affected.
4. **Migration Plan:** How baselines and CI will be updated.
5. **Rollback Plan:** How to revert if defects are discovered after merge.
6. **Validation Plan:** Commands and checks to run locally and in CI.

The RFC can live in `docs/rfc/rendering/RFC-XXXX.md` or an equivalent path, referenced from the PR.

### 5.3 Mandatory Approvals

- **Rendering Owner** (or delegate) MUST approve any PR that:
  - Touches `docs/ops/rendering_consistency_standards.md`,
  - Modifies `.github/workflows/rendering-consistency.yml`,
  - Alters `scripts/check_rendering_consistency.mjs`,
  - Changes `docs/ops/ci_audio_metrics_pipeline.md`.

- **CI/Infra Owner** MUST approve any PR that:
  - Changes CI workflow triggers,
  - Alters artifact sets or their naming.

At least **two** approvals required for high-risk rendering PRs (Rendering + CI/Infra).

---

## 6. Enforcement Mechanisms

### 6.1 Required Status Checks

For PRs touching rendering or audio metrics, the following checks MUST be required on the protected branch:

- `Rendering Consistency / consistency (ubuntu-latest)`
- `Rendering Consistency / consistency (macos-latest)`
- `Rendering Consistency / consistency (windows-latest)`
- `CI Audio Metrics / schema-validation (unix)`
- `CI Audio Metrics / schema-validation (windows)`

A PR **cannot merge** if any required check fails.

### 6.2 Artifact Requirements

Each job must upload, at minimum:

- `ffprobe.json` (metadata)
- `frames/` (extracted PNGs)
- `ssim.log`
- `junit.xml`
- `preview_audio_metrics.json`
- `container.json` (tool & env versions)

Missing artifacts are treated as CI failures.

---

## 7. Baseline Promotion Rules

### 7.1 When Promotion is Allowed

You MAY promote new baselines for a given `game` + `platform` when:

- SSIM `≥ 0.92` (SOFT_PASS or better),
- Visual inspection shows no visible regression,
- Rendering invariants in §3 are still satisfied,
- Change is documented in PR description.

Promotion command:

```bash
node scripts/promote_baselines.cjs --game <slug> --platform <os>
```

### 7.2 When Promotion is Forbidden

Do NOT promote baselines if:

- SSIM < 0.92,
- FPS / SAR / pix_fmt changed unexpectedly,
- There is any visible artifact (blurring, banding, color shift),
- The change is unintentional (e.g., tooling regression).

In these cases, revert the change or open an RFC.

---

## 8. Rollback and Recovery Plan

If a rendering regression is detected post-merge:

1. **Freeze Promotion:** Immediately stop any further golden promotions.
2. **Revert PR:** Use Git’s built-in revert for the offending PR.
3. **Re-run CI:** Ensure:
   - Rendering consistency jobs pass on all OSes,
   - Audio metrics schema validation passes.
4. **Re-validate Baselines:** Confirm golden frames remain unchanged.
5. **Incident Note:** Add a short post-mortem section to this pack’s change log (see §10) or an incident doc in `docs/ops/incidents/`.
6. **Tutorial Remediation:** If regressions impact released tutorials, add a visible tracking issue to the board to indicate remediation status.

---

## 9. Acceptance / Verification Checklist

Use this table as “1 task per checkbox” when validating that G9.8 Rendering Governance is functioning:

- [ ] CI fails when `preview_audio_metrics.json` schema is violated (extra/missing fields).
- [ ] CI fails when resolution is not 1920×1080.
- [ ] CI fails when `pix_fmt` is not `yuv420p`.
- [ ] CI fails when SAR is not 1:1.
- [ ] CI fails when SSIM < 0.92 on any governed test.
- [ ] All three OS jobs upload `ffprobe.json`, `frames/`, `ssim.log`, `junit.xml`, and `container.json`.
- [ ] A high-risk rendering PR with label `rendering:rfc` cannot merge without Rendering + CI approvals.
- [ ] Baseline promotion successfully updates golden frames and passes the consistency workflow.

When all items are checked on a fresh run, G9.8 Rendering Governance is considered operational.

---

## 10. Change Log

| Version | Date       | Author             | Notes                                              |
|---------|------------|--------------------|----------------------------------------------------|
| v1.0    | 2025-11-13 | Rendering Director | Initial G9.8 Rendering Governance Pack introduction. |

---

If you’d like, the **next** thing I can do is:

- Generate a **tiny PR body template** specifically for rendering-impacting changes (with checkboxes wired to this pack), or
- Draft a **developer-focused “How to safely change rendering” guide** that’s shorter and references this governance doc.
