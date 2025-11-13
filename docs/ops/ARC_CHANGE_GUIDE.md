# MOBIUS — How to Safely Change the Authoritative Rendering Contract (ARC)

**Status:** ACTIVE  
**Audience:** Developers touching rendering, audio, golden tests, or CI around them.  
**Related docs:**
- `docs/spec/authoritative_rendering_contract.json` (ARC)
- `docs/ops/rendering_consistency_standards.md`
- `docs/ops/ci_audio_metrics_pipeline.md`
- `docs/ops/PHASE_G9.8_RENDERING_GOVERNANCE_PACK.md`
- `scripts/check_rendering_consistency.cjs`
- `scripts/validate_arc.cjs`

---

## 0. TL;DR

If you touch ARC or anything that influences rendering:

1. **Decide the risk level** (low / medium / high) using §2.
2. **Update ARC first** (`docs/spec/authoritative_rendering_contract.json`).
3. **Run local checks**:
   - `node scripts/validate_arc.cjs`
   - `node scripts/check_rendering_consistency.cjs --game sushi-go --platform <your-os> --output-dir consistency_out`
4. **Label the PR** properly (`rendering:low-risk`, `rendering:medium-risk`, or `rendering:rfc`).
5. For **high-risk changes**, include a short RFC section in the PR description and get both **Rendering Owner** + **CI/Infra** approvals.
6. Do **not** promote baselines unless §6 says it’s allowed.

If any step fails → fix before asking for review.

---

## 1. When You Must Touch ARC

You should update `docs/spec/authoritative_rendering_contract.json` when you:

- Change **output video characteristics**:
  - Resolution, FPS, pixel format (`pix_fmt`), SAR, codec, bitrate ranges.
- Change **audio normalization**:
  - LUFS target / tolerance, true peak ceiling.
- Change **golden test rules**:
  - SSIM thresholds, placeholder size min, required artifacts.
- Change **frame extraction behavior**:
  - Extractor FPS, expected frame count ranges.
- Update **governance rules** around rendering risk levels or RFC requirements.

If you only add logs, comments, or non-behavioral refactors to scripts, you **probably don’t need** to touch ARC (but still run tests).

---

## 2. Risk Levels (Quick Decision Tree)

Use this to decide the risk label:

### 2.1 Low Risk (`rendering:low-risk`)

- Docs-only tweaks that don’t alter numbers or behavior.
- Extra logging in scripts or CI (no changes to ffmpeg flags that impact output).
- Renaming variables, reorganizing code, comments only.

### 2.2 Medium Risk (`rendering:medium-risk`)

- Adding FFmpeg flags that **don’t change** output characteristics (e.g., `-movflags +faststart`).
- Tightening frame count bounds slightly (while keeping semantics identical).
- Adding new **non-governing** CI artifacts.

### 2.3 High Risk (`rendering:rfc` + high risk in description)

- Changing:
  - Resolution, FPS, SAR, `pix_fmt`, or codec.
  - LUFS target or tolerance.
  - True peak ceiling.
  - SSIM thresholds or classification boundaries.
  - Expected frame count ranges.
- Any change requiring golden baselines to be regenerated or promoted.

High-risk changes **must** include a short RFC summary (see §4) and get dual approval.

---

## 3. ARC Change Workflow (Step-by-Step)

This is the **canonical procedure** whenever you change ARC.

### Step 1 — Edit ARC

Edit:

```text
docs/spec/authoritative_rendering_contract.json
```

Keep fields aligned with:

- `docs/ops/rendering_consistency_standards.md`
- `docs/ops/ci_audio_metrics_pipeline.md`
- `docs/ops/PHASE_G9.8_RENDERING_GOVERNANCE_PACK.md`

If you change a number in ARC and it conflicts with a doc, update the doc in the same PR.

### Step 2 — Validate ARC Locally

From repo root:

```bash
node scripts/validate_arc.cjs
```

You should see:

```
[arc-validate] ARC validation succeeded ✅
```

If it fails:

- Read the error (it will tell you which key/type is missing or wrong).
- Fix ARC until validation passes.

### Step 3 — Run Rendering Consistency Check Locally

Pick a game and platform tag (for local testing, platform can be macos, windows, linux, or even local):

```bash
node scripts/check_rendering_consistency.cjs \
  --game sushi-go \
  --platform local \
  --output-dir consistency_out
```

Verify that:

- Command exits with code 0.
- `consistency_out/` contains:
  - `ffprobe.json`
  - `frames/`
  - `ssim.log`
  - `junit.xml`
- Log shows:
  - Resolution matches ARC.
  - `pix_fmt` and SAR match ARC.
  - Frame count is within `ARC.preview_5s_expected_frames`.
  - SSIM is ≥ `ARC.golden_tests.ssim.soft_pass`.

If this fails, fix either:

- The implementation (scripts, render pipeline), or
- ARC (if you mis-specified a value)

…until both ARC validation and consistency checks pass.

### Step 4 — Add PR Labels and Risk Context

In the PR:

Add one of:

- `rendering:low-risk`
- `rendering:medium-risk`
- `rendering:rfc` (for high risk)

In the description, include a short “Rendering Impact” section:

```
### Rendering Impact

- Risk: high / medium / low
- ARC changed: yes/no
- Summary of changes:
  - FPS: unchanged (30)
  - LUFS target: from -16.0 to -15.0 (RFC attached)
  - SSIM thresholds: unchanged
```

For high-risk changes, add an RFC mini-section (see §4).

---

## 4. Mini-RFC Template (For High-Risk Changes)

For PRs with `rendering:rfc`:

```
### Rendering RFC Summary

**Motivation**
- (Why do we need this change?)

**Current vs Proposed (key parameters)**

| Parameter            | Current       | Proposed      |
|----------------------|---------------|---------------|
| Resolution           | 1920×1080     | 2560×1440     |
| FPS                  | 30            | 30            |
| pix_fmt              | yuv420p       | yuv420p       |
| LUFS target          | -16.0         | -16.0         |
| True peak ceiling    | -1.0 dBTP     | -1.0 dBTP     |
| SSIM PASS threshold  | 0.95          | 0.96          |

**Impact**
- Affected tests:
  - Rendering consistency workflow (all OS)
  - Golden baselines for: `<games>`
- Docs updated:
  - ARC
  - Standards pack
  - Governance pack

**Validation Plan**
- Local:
  - `node scripts/validate_arc.cjs`
  - `node scripts/check_rendering_consistency.cjs --game sushi-go --platform local`
- CI:
  - Rendering Consistency (3 OS)
  - Validate ARC

**Rollback**
- Revert PR + restore previous ARC version.
- Re-run Rendering Consistency workflow.
```

This keeps rendering-related changes auditable and governed.

---

## 5. Required CI Checks Before Merge

For any PR touching ARC or governed rendering behavior, the following checks must pass:

- `Validate ARC / arc-validate`
- `Rendering Consistency / consistency (ubuntu-latest)`
- `Rendering Consistency / consistency (macos-latest)`
- `Rendering Consistency / consistency (windows-latest)`
- `CI Audio Metrics / schema-validation (unix)`
- `CI Audio Metrics / schema-validation (windows)`

If any required job fails → fix code or ARC before asking for review.

---

## 6. Golden Baseline Promotion Rules (Developer View)

You may need to promote new baselines after intentional rendering changes.

### 6.1 When You MAY Promote

You can run:

```bash
node scripts/promote_baselines.cjs --game <slug> --platform <os>
```

when:

- ARC is updated and validated.
- Rendering Consistency checks pass on all OSes.
- SSIM ≥ `ARC.golden_tests.ssim.soft_pass` (default: 0.92).
- A human visually confirms no regressions.

### 6.2 When You MUST NOT Promote

Do not promote baselines if:

- SSIM < `ARC.golden_tests.ssim.soft_pass`.
- Resolution, `pix_fmt`, SAR, or FPS changed unexpectedly.
- Frames show visible regressions (blur, banding, color shifts).
- The change was accidental (tooling regression, library upgrade side-effect).

In those cases:

- Fix the implementation, or
- Revert the PR and open a proper RFC if the change is needed.

---

## 7. Quick “One-Glance” Checklist

Before requesting review for an ARC-impacting PR, confirm:

- `docs/spec/authoritative_rendering_contract.json` updated (if needed).
- `node scripts/validate_arc.cjs` passes locally.
- `node scripts/check_rendering_consistency.cjs --game sushi-go --platform local` passes.
- PR has appropriate label:
  - `rendering:low-risk` OR
  - `rendering:medium-risk` OR
  - `rendering:rfc` (with RFC section).
- CI checks are green (ARC + Rendering Consistency + Audio Metrics).
- Golden baselines are promoted only if allowed by §6.

If all boxes are checked, your ARC change is governance-compliant and ready to merge discussion.

---

## 8. Design Philosophy (Why We Do It This Way)

- **Single source of truth (ARC):** all rendering rules live in one JSON spec.
- **Machine-enforced:** scripts and CI validate ARC and its implementation.
- **Governed evolution:** high-impact changes require explicit RFC-style reasoning.
- **Cross-platform determinism:** Windows, macOS, Linux all honor the same rules.
- **Future-proof:** as we add 4K, multi-track audio, or alternate encoders, we evolve ARC in a controlled, observable way.

This guide exists to keep MOBIUS professional, predictable, and safe to modify as the rendering stack grows.

---

Deliverable complete and wired into the governance model you already have.
