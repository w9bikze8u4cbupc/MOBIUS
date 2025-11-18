# MOBIUS Storyboard Governance — Phase E3 Expansion

Status: Active
Version: 1.1.0
Scope: Storyboard generator, validation tooling, CI contracts

---

## 1. Goal

Phase E3 extends the deterministic storyboard layer.  Rendering (Phase F2–F6)
is already stable, so leverage now comes from upstream story quality.  This
document defines the governed rules that every storyboard (and the generator
that emits it) MUST follow.

## 2. Scene Typology

Seven scene types are now governed.  Every scene MUST declare a `type` field
with one of the following values and satisfy the associated structure:

| Scene type            | Required elements                                                                 | Allowed motion macros                                 | Duration heuristic |
|----------------------|-------------------------------------------------------------------------------------|--------------------------------------------------------|--------------------|
| `intro`              | Brand/title overlay, optional logo visual                                          | `focus_zoom`, `highlight_pulse`                        | 4–8 seconds        |
| `components_overview`| Component grid + summary overlay                                                    | `pan_to_component`, `focus_zoom`, `highlight_pulse`    | 5–10 seconds       |
| `setup_step`         | Step overlay, component callouts                                                    | `pan_to_component`, `highlight_pulse`                  | 3–8 seconds        |
| `turn_flow`          | Phase overlay, optional component focus                                            | `focus_zoom`, `pan_to_component`                       | 4–9 seconds        |
| `scoring_summary`    | Summary overlay, optional score tracker visual                                     | `focus_zoom`, `highlight_pulse`                        | 4–9 seconds        |
| `transition`         | Lower-third transition overlay only                                                | Fade-in/out only                                       | 1–3 seconds        |
| `end_card`           | CTA overlay + brand footer                                                          | `highlight_pulse`, `focus_zoom` (logo only)            | 4–7 seconds        |

Each scene MUST include `segmentId`, `durationSec`, `prevSceneId`, `nextSceneId`
and deterministic `index` ordering.  Links MUST be contiguous to support future
GENESIS reasoning.

## 3. Motion Primitives

The motion system is now macro-based.  Storyboard authors use only the
following macros, which deterministically expand to governed primitives
(`fade`, `slide`, `zoom`, `pulse`) with constrained easing functions
(`linear`, `easeInOutCubic`, `easeOutQuad`).

- `focus_zoom(assetId, targetRect, dur)` → zoom primitive scoped to the asset
- `pan_to_component(componentId, dur)` → slide primitive from current frame
  center to the component's normalized coordinates
- `highlight_pulse(assetId, dur)` → pulse primitive (opacity/scale) for callout
  emphasis

No other motion descriptions are permitted.  Macro inputs are deterministic and
snapped to the storyboard timing grid.

## 4. Timing Governance

- All `durationSec`, `startSec`, and `endSec` values MUST be snapped to
  increments of 1/6s (0.1666667s).
- Scene durations are derived from narration text length plus explicit weights
  for complexity.
- Transition scenes observe a 1–3 second clamp; other scenes clamp to
  2–15 seconds depending on the type.
- Narration-provided durations take precedence but are still snapped.

## 5. Layout Governance

Component visuals use a deterministic grid:

- Safe area margins: 5% on all sides.
- Auto-detect number of components, up to three columns before creating new
  rows.
- Grid occupies the lower 40% of the frame, never breaching the safe area.
- Layer stack:
  - Background assets: layer `0`
  - Board / play surface: `5`
  - Components: `10`
  - Overlays: `20`
  - Pointers/highlights: `30`

Overlays are normalized rectangles within the safe area (top for titles,
bottom for brand/CTA).  No element may breach `[0, 1]` normalized coordinates.

## 6. Intro / Outro

Two deterministic scenes are always emitted:

1. **Intro**: brand sting with title overlay and optional logo visual.
2. **End card**: CTA overlay ("Subscribe" or product CTA) with brand footer,
   plus governed fade-out.

## 7. Scene Linking

Storyboard scenes now include `prevSceneId` and `nextSceneId` fields.  The
storyboard generator MUST ensure:

- Sorted `index` values (0…N-1)
- First scene has `prevSceneId = null`
- Last scene has `nextSceneId = null`
- All intermediate scenes link bidirectionally to their neighbors

Missing links are contract violations.

## 8. Validation & CI

Four JUnit reports enforce Phase E3 determinism:

- `storyboard-scenes-contract.xml`
- `storyboard-motion-contract.xml`
- `storyboard-layout-contract.xml`
- `storyboard-timing-contract.xml`

`scripts/check_storyboard.cjs` now emits these reports (plus an aggregated
legacy report) and supports validating both `1.0.0` and `1.1.0` contracts.
These reports run inside the `phase-e-governance` CI job to guarantee
Storyboard determinism before Phase F pipelines execute.
