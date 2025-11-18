# Subtitle Governance (Phase F7)

## Purpose
This document defines the governed rules, constraints, and deterministic behavior
for captions/subtitles in the MOBIUS pipeline.  
All caption generation, editing, and rendering must comply with this governance layer.

## Scope
- Caption item structure (text, timing)
- Timing normalization
- QC rules (CPS, line length, punctuation, overlaps)
- Deterministic generation rules
- Rendering expectations (sidecar + burn-in)
- CI gating (subtitle-contract)

## Determinism Rules
1. No randomness or clock-based behavior.
2. Timestamps must be normalized:
   - Snap to nearest `1/12` second (≈ 83.333ms)
   - Enforce 0.083333 increments consistently.
3. All cues sorted strictly by `startSec`.
4. No overlaps:
   - next.startSec >= prev.endSec + 0.083333
5. Standard text normalization:
   - NFC
   - Trim leading/trailing whitespace
   - Collapse multiple spaces

## Caption Item Requirements
Each item MUST have:
- `id` (string)
- `startSec` (number)
- `endSec` (number > startSec)
- `text` (non-empty string)

## QC Rules
- Max 42 characters per line
- Max 2 lines
- Max 17 Characters Per Second (CPS)
- Sentence case enforced
- End punctuation required unless the cue is < 8 chars
- Non-speech (e.g., [Music], [Click]) allowed but MUST follow:
  - All caps for bracketed cues
  - No nested brackets

## Rendering Rules
- Sidecar SRT is canonical.
- VTT optional but must be derived deterministically from SRT.
- Burn-in subtitles must use:
  - Font: Inter Bold, 48px
  - Box background 60% black, soft edges
  - Safe-area margins: 8% bottom

## Contract Versioning
Changes require:
- Contract bump (subtitle_contract_vX.Y.Z.json)
- Governance doc update
- CI update
- Golden baseline re-validation

## CI Expectations
The F7 CI job must:
- Validate a sample SRT
- Emit `subtitle-contract-[os].xml`
- Fail if any QC rule or structural rule is violated
