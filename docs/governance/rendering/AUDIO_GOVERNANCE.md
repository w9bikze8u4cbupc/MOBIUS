# Audio Governance (ARC v1.x)

Status: ACTIVE  
Scope: All tutorial renders governed by ARC.audio

This document defines how audio loudness and true peak are governed for MOBIUS
renders, and how CI enforces these rules.

---

## 1. ARC Audio Fields (Summary)

From `docs/spec/authoritative_rendering_contract.json`:

- `audio.sampleRate` — expected sample rate (Hz).
- `audio.channels` — channel count (usually 2 for stereo).
- `audio.targetLufs` — integrated loudness target (LUFS).
- `audio.truePeakCeiling` — maximum allowed true peak (dBTP).
- `audio.toleranceLufs` — allowed absolute deviation from target LUFS.
- `audio.toleranceTruePeakDb` — allowed overshoot relative to peak ceiling.
- `audio.requireEbur128Probe` — CI MUST run an EBUR128 probe when `true`.
- `audio.requireTruePeakProbe` — CI MUST compute true peak when `true`.

---

## 2. Measurement Expectations

The rendering pipeline MUST produce a loudness/true-peak probe, typically via:

```bash
ffmpeg -i <input> -filter_complex ebur128=dualmono=1 -f null -
```

or a wrapper that emits structured output (e.g. JSON) containing:

- Integrated loudness (LUFS)
- True peak (dBTP)

The rendering consistency script consumes these measurements and creates an
audio-contract JUnit testcase.

## 3. Contract Evaluation

Given ARC and measured values:

- `integratedLufs` must be within ±`audio.toleranceLufs` of `audio.targetLufs`.
- `truePeakDbtp` must not exceed `audio.truePeakCeiling` by more than
  `audio.toleranceTruePeakDb`.
- If probes are required but missing, the audio-contract test fails.
- If probes are optional and missing, the audio-contract test passes but
  provides no guarantees.

## 4. CI Behavior

The rendering consistency workflow MUST:

1. Run the loudness/true-peak probe if required.
2. Pass measured values into the audio governance hook.
3. Publish JUnit XML containing:
   - `<properties>` for audio settings and tolerances.
   - An `audio-contract[...]` testcase summarizing the contract.

CI maintainers SHOULD:

- Treat any audio-contract failure as a release-blocking issue.
- Tune tolerances in ARC when necessary rather than hardcoding thresholds
  inside scripts.

## 5. Developer Workflow

When making audio-impacting changes (mix, ducking, VO/BGM levels):

1. Run a render locally.
2. Run the loudness probe tool you use in CI.
3. Confirm:
   - Integrated LUFS is within tolerance.
   - True peak does not overshoot ceiling beyond tolerance.
4. Adjust mix or ARC tolerances if justified (governance approval required).
5. Push and let CI run. Fix any audio-contract failures before merge.

## 6. Governance Notes

- Changing `targetLufs` or `truePeakCeiling` is a major ARC audio change and
  SHOULD go through the rendering governance RFC process.
- Adjusting tolerances is typically a minor change but MUST be documented in
  the PR as part of the risk analysis.

---

## 🧪 Quick Validation Checklist (Phase F3 Audio)

1. **ARC semantic check**

   ```bash
   node scripts/validate_arc_semantic.mjs
   ```

   Expect success with new audio fields present.

   Try setting `toleranceLufs = -1` once to confirm validation fails clearly.

2. **Local run of rendering consistency**

   With a dummy `measuredAudio` plugged in (e.g. -16.2 LUFS, -1.1 dBTP), run:

   ```bash
   node scripts/check_rendering_consistency.cjs --game <game> --platform <os> || true
   ```

   Inspect JUnit:

   - Confirm an `audio-contract[...]` testcase exists.
   - Confirm it passes/fails as expected based on your dummy numbers.

3. **Docs**

   - Open `docs/governance/rendering/AUDIO_GOVERNANCE.md` and verify headings
     and content render fine.
   - Check `ARC_SEMANTIC_RULES.md`’s audio section still matches ARC fields.
