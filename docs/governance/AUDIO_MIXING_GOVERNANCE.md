# Audio Mixing Governance (Phase F8)

## Purpose
This document defines deterministic and production-grade rules for all audio tasks:
- narration assets
- background music (BGM)
- ducking behavior
- loudness normalization
- mixing and alignment
- CI validation

These rules ensure consistent, platform-safe audio output across Windows, macOS, and Linux.

## Determinism Rules
1. All mixing decisions must be contract-driven.
2. No randomness or machine-dependent volume scaling.
3. All envelopes must be expressed in seconds with exact increments:
   - Snap times to nearest 1/100 second (0.01s).
4. No auto-gain beyond LUFS normalization.
5. No sample-rate drift; audio must be re-encoded to 48 kHz.

## Loudness Targets
- Integrated loudness: **-16.0 LUFS ± 0.2 LU**
- Short-term loudness max: **-14.0 LUFS**
- True peak ceiling: **-1.2 dBTP**
- LRA target: **6.0–12.0 LU**

## Narration Requirements
- Must be normalized to -18.0 LUFS pre-mix.
- Micro-pauses between segments: ≥ 0.12s.
- No DC offset permitted.
- Mono or stereo accepted; final output always stereo.

## Background Music Rules
- BGM loudness target BEFORE ducking: -26 LUFS.
- Standard mix level: -18 dB gain relative to narration.
- Must fade in over exactly 1.0s; fade out over 1.0s.
- No clipping or true-peak overs.

## Ducking Behavior
Allowed ducking modes:
- `sidechain`
- `envelope`
- `none`

Governed envelope shape:
- Attack: 0.15s
- Release: 0.35s
- Duck amount: -10 dB
- Minimum dip floor: -20 dB

## Alignment and Timing
- Voice segments must align to storyboard scene start within ±0.01s.
- Deterministic timing alignment is required for overlays and BGM entries.
- BGM loops must be seamless and deterministic.
- Segment transitions must not exceed 0.01s discontinuity.

## QC Rules
- No clipping allowed in final mix.
- Integrated loudness must be within tolerance.
- All tracks must have correct declared duration (±0.01s).
- Stereo channels must be balanced within ±1.5 dB.

## Contract & CI
Every mix must pass:
- audio_mixing_contract validator
- loudness + peak check
- timing/overlap validation
- channel-balance check

Any violation blocks downstream rendering and golden promotion.
