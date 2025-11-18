# Motion & Timing Determinism Governance (Phase F9)

## Purpose
This document defines the governed structure, constraints, and deterministic rules for all motion
primitives used within MOBIUS storyboards and rendering pipelines.

Motion must be:
- deterministic
- platform-independent
- bounded
- safe-area aware
- time-normalized
- governed by contract

## Allowed Motion Types
- `fade` (in/out)
- `slide` (directional)
- `zoom` (in/out)
- `pulse` (scale-opacity composite)
- `highlight` (governed safe-area spotlight)
- `focus_zoom` (slow zoom with center lock)
- `soft_slide_in` (governed slide-in macro)

All other motion types require a contract bump.

## Allowed Easing Functions
- `linear`
- `easeInOutCubic`
- `easeOutQuad`
- `easeInQuad`
- `easeInOutSine`

These easings must map to fixed mathematical curves in the motion contract.

## Deterministic Timing Rules
1. All motion times MUST snap to:
   - **1/60 second precision** (`snapFrame`)
   - Equivalent to 16.666...ms increments

2. Duration must be between:
   - **0.0833s minimum** (5 frames)
   - **4.0s maximum**

3. Start times must align with the scene timeline:
   - 0 ≤ start ≤ scene.durationSec
   - endSec must not exceed scene duration

4. No overlapping contradictory motions:
   - A visual cannot run two motions on the same property (position, scale, opacity) simultaneously.

## Spatial & Safe-Area Rules
- Motions must never push visuals outside `[0,1]` normalized placement bounds.
- Slide directions allowed: up, down, left, right.
- Zoom center must remain within safe area.

## Motion Safety Constraints
- No “teleporting” (>10px instantaneous jumps).
- No negative scale.
- No opacity > 1.0 or < 0.0.
- No direction flipping mid-motion.
- No more than **3 concurrent motions** per scene.

## Global Scene Budget
- Max total motion time (summed): **≤ 12 seconds**.
- Max motion objects per scene: **≤ 20**.

## QC Rules
The validator must check:
- Time snapping
- Allowed easing
- Bounds safety
- No off-screen placements
- No overlapping contradictory transforms
- No invalid motion types

## CI & Contract
Every storyboard must pass:
- `motion_contract_v1.0.0.json`
- `check_motion.cjs`
- Full timing & easing validation

This phase is required before rendering or golden promotion.
