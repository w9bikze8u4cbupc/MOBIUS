# MOBIUS Rendering Governance Index

Status: ACTIVE  
Audience: Contributors touching rendering, audio, ARC, or golden baselines.  
Scope: All tutorial renders governed by the Authoritative Rendering Contract (ARC).  

This document is the **entrypoint** for the MOBIUS Rendering Governance system.
It explains:

- What the Authoritative Rendering Contract (ARC) is.
- How CI enforces rendering invariants.
- How golden baselines are managed and promoted.
- Where to look when rendering CI fails.

---

## 1. Conceptual Overview

The rendering system is governed by a single, versioned contract:

- **ARC spec (JSON)** — the machine-readable source of truth for
  rendering invariants (resolution, FPS, SAR, pix_fmt, loudness, SSIM, etc.).

Everything else hangs off of that:

1. **Structural validation**  
   Ensures ARC JSON has the required shape and basic types.
2. **Semantic validation**  
   Ensures ARC values are “sane” and internally consistent (FPS ranges, loudness,
   tolerance limits, etc.).
3. **Rendering consistency checks**  
   Runs ffprobe, frame extraction, and SSIM vs golden frames driven by ARC.
4. **Golden baselines**  
   Store expected visuals per OS; promotion is gated by governance.
5. **CI workflows & PR template**  
   Enforce the contract for every PR, and guide contributors when rendering is
   impacted.

---

## 2. Key Files and Directories

### 2.1 ARC Specification

- **Authoritative JSON spec**  
  `docs/spec/authoritative_rendering_contract.json`  
  Defines:
  - `video` — width, height, fps, pixFmt, sar
  - `audio` — sampleRate, channels, targetLufs, truePeakCeiling
  - `extraction` — method, frameCountTolerancePct
  - `validation` — ssim thresholds, optional masks
  - `governance` — versioning, notes (optional)

### 2.2 Governance Docs

- **ARC Semantic Rules**  
  `docs/governance/rendering/ARC_SEMANTIC_RULES.md`  
  Normative numeric/semantic bounds and expectations (FPS range, loudness bands,
  SSIM minimums, etc.).

- **Baseline Promotion Protocol**  
  `docs/governance/rendering/BASELINE_PROMOTION_PROTOCOL.md`  
  How and when to update golden baselines, required labels, and justification.

- **Developer Troubleshooting Guide**  
  `docs/governance/rendering/DEVELOPER_TROUBLESHOOTING.md`  
  Fast triage instructions when CI fails (ffprobe, SAR/FPS/pix_fmt, SSIM,
  artifact issues).

- **Rendering CI Flow (Developer-facing)**  
  `docs/governance/rendering/RENDERING_FLOWCHART.md`  
  High-level CI flow: validate ARC → run consistency checks → optional baseline
  promotion → merge.

- **Governance Lifecycle**  
  `docs/governance/rendering/GOVERNANCE_LIFECYCLE.md`  
  Who owns ARC, how versions change, and when RFCs are required.

### 2.3 Scripts

- **ARC Semantic Validator**  
  `scripts/validate_arc_semantic.mjs`  
  - Runs semantic checks against `authoritative_rendering_contract.json`.
  - Fails on dangerous values; warns on suspicious but technically allowed ones.

- **Rendering Consistency Check**  
  `scripts/check_rendering_consistency.mjs` (name may differ; see package.json)  
  - Loads ARC, logs a concise ARC summary.
  - Validates ffprobe metadata vs ARC.
  - Extracts frames at ARC-driven FPS.
  - Computes SSIM vs golden using ARC thresholds.
  - Produces JUnit XML with:
    - ARC metadata as `<properties>`.
    - A synthetic `arc-contract[...]` test case summarizing the active ARC.

- **Baseline Promotion (if present)**  
  `scripts/promote_baselines.mjs`  
  - Promotes “actual” frames to “golden” after visual review.

### 2.4 CI Workflows

- **Structural ARC Validation**  
  `.github/workflows/validate-arc.yml`  
  - Runs the core ARC validator on any change to the ARC spec or validator.

- **Semantic ARC Validation**  
  `.github/workflows/validate-arc-semantic.yml`  
  - Runs `node scripts/validate_arc_semantic.mjs` for ARC changes.

- **Rendering Consistency**  
  *(Name may vary, e.g. `check-rendering-consistency.yml`)*  
  - Builds and runs the rendering consistency script.
  - Publishes:
    - `ffprobe.json`
    - extracted `frames/`
    - `ssim.log`
    - `junit.xml`

---

## 3. Developer Flows

### 3.1 I Changed Rendering Code (but not ARC)

Examples:
- Updating FFmpeg filtergraph.
- Changing transitions, overlays, or timing.
- Adjusting frame extraction logic.

**Checklist:**

1. Run local consistency check for affected games/platforms:

   ```bash
   node scripts/check_rendering_consistency.mjs --game <game> --platform <os>
   ```

2. Inspect the ARC summary in the script output.

3. If SSIM drops:
   - Confirm visuals are as expected.
   - Decide whether to:
     - Fix the regression, or
     - Promote new golden frames using the Baseline Promotion Protocol.

4. Open a PR and in `.github/pull_request_template.md`:
   - Set Rendering impact and Risk level.
   - Complete the ARC & Golden Troubleshooting section.
   - Add `rendering-baseline-update` label if baselines changed.

5. CI MUST pass:
   - Structural ARC validation
   - Semantic ARC validation
   - Rendering consistency checks

### 3.2 I Changed ARC

Examples:
- New target resolution or FPS.
- New SSIM minimums.
- Updated loudness targets.

**Checklist:**

1. Update `docs/spec/authoritative_rendering_contract.json`.

2. Run locally:

   ```bash
   node scripts/validate_arc_semantic.mjs
   ```

3. If needed, update:
   - `docs/governance/rendering/ARC_SEMANTIC_RULES.md`
   - `docs/governance/rendering/GOVERNANCE_LIFECYCLE.md` (for version bumps / RFCs)

4. Open a PR and:
   - Explain the ARC changes in the description.
   - Ensure the PR uses the correct governance label (e.g., `rendering-rfc` for majors).

5. Let CI run:
   - `validate-arc.yml` (structural)
   - `validate-arc-semantic.yml` (semantic)
   - Rendering consistency workflows

6. CI MUST pass all ARC-related jobs before merge.

### 3.3 I Changed Golden Baselines

Examples:
- Intentionally changing the visuals (layout, branding, transitions).
- Fixing long-standing pixel-level diffs after reviewing output.

**Checklist:**

1. Follow `BASELINE_PROMOTION_PROTOCOL.md`.

2. Use the promotion script (or documented process) to update golden frames.

3. Re-run rendering consistency locally to confirm clean SSIM and diff outputs.

4. Open a PR and:
   - Add `rendering-baseline-update` label.
   - Attach:
     - SSIM excerpts or summary.
     - Before/after screenshots if helpful.

5. Ensure CI:
   - Runs rendering consistency on all platforms.
   - Produces no new unexpected failures.

---

## 4. Reading CI & JUnit Outputs

When rendering CI runs, you should see:

- **ARC summary in logs**  
  Printed at the beginning of the consistency script:
  - ARC version
  - Video: resolution, FPS, pixFmt, SAR
  - Audio: sampleRate, channels, target LUFS, true peak ceiling
  - Extraction method and tolerance
  - SSIM minimum

- **JUnit properties**  
  In the published JUnit XML (and any downstream report), look for:
  - `arc.version`
  - `arc.video.*`
  - `arc.audio.*`
  - `arc.extraction.*`
  - `arc.validation.ssim.min`

- **Synthetic arc-contract test**  
  A named testcase, for example:  
  `arc-contract[1920x1080@30fps | pixFmt=yuv420p | sar=1:1 | audio=48000Hz/2ch | LUFS=-16 | TP=-1dBTP | ssim.min=0.95]`
  - Pass → ARC is structurally and semantically present for this run.
  - Fail → ARC is missing required sections; see the test’s failure message.

---

## 5. When Things Break

If rendering CI fails:

1. Open `DEVELOPER_TROUBLESHOOTING.md` for a fast triage checklist.
2. Look at:
   - ARC summary in logs
   - `ffprobe.json` vs ARC.video/audio
   - `ssim.log` vs ARC.validation.ssim.min
   - Extracted frames folder for obvious visual issues

3. If the failure is due to ARC misconfiguration:
   - Fix `authoritative_rendering_contract.json` and re-run validators.

4. If the failure is due to a genuine regression:
   - Fix the rendering code OR follow the baseline promotion protocol.

---

## 6. Ownership & Contact

The Rendering Governance Group (RGG) owns:

- ARC spec + semantic rules
- Golden baseline policy
- CI rendering governance workflows

Changes to these areas MUST follow the governance lifecycle documented in:

- `GOVERNANCE_LIFECYCLE.md`

If you are unsure whether your change requires an RFC, assume YES and
document your rationale in the PR description.

---

## 🧪 Quick Validation Checklist (for you)

1. Add `docs/governance/rendering/README.md` with the content above.
2. In GitHub’s UI:
   - Navigate to `docs/governance/rendering/README.md`.
   - Confirm headings and code blocks render correctly.
   - Click through the referenced files to ensure paths are correct in your repo.
3. Optionally:
   - Link this README from any higher-level `docs/` index (if you have one) as “Rendering Governance”.

---

If you want to keep pushing rendering forward after Phase F2, you can say something like:

> “Design the ARC v1.0.2 mask schema and SSIM-masking rules”

and I’ll move into the **“dynamic masked regions + multi-platform tolerance”** phase next, still acting as your director.
