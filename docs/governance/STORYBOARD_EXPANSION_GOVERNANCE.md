# MOBIUS Storyboard Expansion Governance (Phase E3)

Version: 1.1.0  
Status: Active  
Scope: Scene typology, timing rules, motion macros, layout patterns

---

## 1. Purpose

Phase E3 extends storyboard governance to cover:

- A richer set of scene types (intro, components overview, setup steps, turns, scoring, outro).
- Deterministic timing normalized to a fixed increment.
- Motion macros that compose allowed primitives.
- Standard layout patterns for board, components, and overlays.
- Scene linking for downstream orchestration (e.g., GENESIS).

This builds on the base rules in `STORYBOARD_GOVERNANCE.md` and updates the
contract to version `1.1.0`.

---

## 2. Scene Typology

The following scene types are recognized:

- `intro` — title card, logo, quick hook.
- `components_overview` — overview of key components or setup layout.
- `setup_step` — one scene per setup step (or grouped by section).
- `turn_flow` — explanation of a representative turn or round.
- `scoring_summary` — end-of-game scoring explanation.
- `end_card` — CTA and branding.
- `transition` — short, mostly visual bridge between topics.

Every scene MUST declare:

- `type`: one of the above.
- `segmentId`: the logical script segment driving this scene.
- `durationSec`: positive, governed duration.
- `index`: scene order, starting at 0 and strictly increasing.

---

## 3. Timing & Duration Governance

All time-based values MUST be deterministic and snapped to a fixed increment:

- Increment: `1/6` second (`~0.1667`).
- Allowed values:
  - `durationSec` in `[1.0, 20.0]`.
  - `startSec` and `endSec` within `[0, durationSec]`.

Duration rules:

- Intro (`intro`): default `3–6` seconds based on title length.
- Setup steps (`setup_step`): base duration + per-word increment, clamped and snapped.
- Outro (`end_card`): typically `4–8` seconds, enough to display CTA.

The generator MUST:

- Compute raw durations from input text or narration length.
- Clamp to min/max.
- Snap to the increment.

---

## 4. Layout Patterns

Coordinates are normalized in [0, 1]. The safe area excludes 5% margins:

- Safe area:
  - `x ∈ [0.05, 0.95]`
  - `y ∈ [0.05, 0.95]`

Standard patterns:

1. **Intro / End Card:**
   - Logo/image centered near top third.
   - Title text box centered.

2. **Setup Step:**
   - Text overlay at top (width 80–90% of frame).
   - Components laid out in rows near bottom.

3. **Components Overview:**
   - Grid layout of key components; optional board background.

Overlay constraints:

- Overlays MUST be within safe area.
- Overlays SHOULD not exceed 2 lines for typical 16:9 layout.

---

## 5. Motion Macros

Motion primitives remain:

- `fade`
- `slide`
- `zoom`
- `pulse`

Phase E3 defines macro patterns that map to these primitives:

- `highlight_component`:
  - `fade` from 0 → 1 over first 0.5–1.0s.
- `focus_zoom`:
  - `zoom` from 1.0 → `1.2–1.4` around a given anchor.
- `soft_slide_in`:
  - `slide` from off-screen to final placement with `easeInOutCubic`.

Generators MUST:

- Use only allowed primitives.
- Restrict easing to:
  - `linear`
  - `easeInOutCubic`
  - `easeOutQuad`

The macros themselves are not serialized in the contract; only their primitive
realization is stored.

---

## 6. Scene Linking

Each scene MAY declare:

- `prevSceneId`: ID of the previous scene or `null`.
- `nextSceneId`: ID of the next scene or `null`.

Governance rules:

- First scene: `prevSceneId = null`.
- Last scene: `nextSceneId = null`.
- All other scenes: both fields set to valid scene IDs.

This enables downstream engines to traverse the storyboard deterministically.

---

## 7. Contract Versioning

The storyboard contract is bumped to `1.1.0`:

- New fields:
  - `prevSceneId`, `nextSceneId`.
  - Expanded `type` enum.
- Additional validation around:
  - Safe area layout constraints (soft warnings).
  - Timing normalization.

Generators MUST set:

- `storyboardContractVersion = "1.1.0"`

Validators MUST reject:

- Payloads with older versions when CI expects `1.1.0`.

---

## 8. CI Enforcement

The Phase E governance job MUST:

1. Produce a storyboard using the current generator.
2. Validate it against `storyboard_contract_v1.1.0.json` via `check_storyboard.cjs`.
3. Emit a JUnit report `storyboard-contract-[os].xml`.

Any contract violation MUST fail CI.

---
