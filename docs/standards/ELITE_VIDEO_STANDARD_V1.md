# MOBIUS Elite Video Standard v1.1

**Version**: 1.1.0  
**Date**: 2026-02-23  
**Status**: Active  
**Changes from v1.0**: Added S4 Combinatorial Compression rule

## Overview

The MOBIUS Elite Video Standard defines machine-enforceable quality criteria for board game tutorial videos. Videos meeting this standard achieve:

- Professional audio quality with loudness normalization
- High-definition visual presentation
- Optimal pacing and chapter structure
- Full accessibility compliance
- Complete provenance and integrity verification

## Elite Threshold

**Elite Score**: 900+ points (out of 1000 maximum)  
**Hard Failures**: Zero HARD_FAIL rule violations

## Scoring Categories

| Category | Weight | Focus |
|----------|--------|-------|
| Audio Quality | 300 pts | Loudness, dynamics, technical quality |
| Visual Quality | 200 pts | Resolution, frame rate, codec |
| Retention & Engagement | 200 pts | Pacing, chapters, structure |
| Accessibility | 150 pts | Captions, navigation |
| Trust & Provenance | 150 pts | Integrity, traceability |

## Rule Severities

### HARD_FAIL
- **Blocks Elite certification**
- Must pass for any Elite-labeled release
- Examples: Audio clipping, missing captions, invalid checksums

### SOFT_WARN
- **Reduces score but doesn't block**
- Best practices that improve quality
- Examples: Loudness range, silence gaps, chapter density

### ELITE_BONUS
- **Optional enhancements**
- Adds points when present
- Examples: Early hook, standard version declaration

## Audio Quality Rules (300 points)

### AUDIO_LUFS_TARGET (100 pts, HARD_FAIL)
**Integrated Loudness Target**

- **Requirement**: -14 LUFS ± 2 LUFS
- **Measurement**: FFmpeg loudnorm filter analysis pass
- **Rationale**: YouTube/Vimeo standard for consistent volume

```bash
ffmpeg -i input.mp4 -af loudnorm=print_format=json -f null -
```

### AUDIO_TRUEPEAK_MAX (80 pts, HARD_FAIL)
**True Peak Limit**

- **Requirement**: ≤ -1.0 dBTP
- **Measurement**: FFmpeg loudnorm true peak
- **Rationale**: Prevents digital clipping

### AUDIO_LRA_RANGE (40 pts, SOFT_WARN)
**Loudness Range**

- **Requirement**: 6-15 LU
- **Measurement**: FFmpeg loudnorm LRA
- **Rationale**: Good dynamics without excessive compression

### AUDIO_SILENCE_MAX (40 pts, SOFT_WARN)
**Maximum Silence Duration**

- **Requirement**: ≤ 2 seconds
- **Measurement**: FFmpeg silencedetect filter (-50dB threshold)
- **Rationale**: Prevents dead air

```bash
ffmpeg -i input.mp4 -af silencedetect=n=-50dB:d=0.5 -f null -
```

### AUDIO_CLIPPING_NONE (40 pts, HARD_FAIL)
**No Audio Clipping**

- **Requirement**: 0 samples at maximum amplitude
- **Measurement**: FFmpeg astats filter
- **Rationale**: Clipping causes audible distortion

```bash
ffmpeg -i input.mp4 -af astats=metadata=1 -f null -
```

## Visual Quality Rules (200 points)

### VIS_RESOLUTION_MIN (60 pts, HARD_FAIL)
**Minimum Resolution**

- **Requirement**: 1920x1080 (Full HD)
- **Measurement**: FFprobe video stream dimensions
- **Rationale**: Modern viewing standard

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json input.mp4
```

### VIS_FRAMERATE_MIN (40 pts, HARD_FAIL)
**Minimum Frame Rate**

- **Requirement**: ≥ 24 fps
- **Measurement**: FFprobe r_frame_rate
- **Rationale**: Smooth motion

### VIS_CODEC_STANDARD (40 pts, HARD_FAIL)
**Standard Video Codec**

- **Requirement**: H.264
- **Measurement**: FFprobe codec_name
- **Rationale**: Maximum platform compatibility

### VIS_DURATION_MIN (30 pts, SOFT_WARN)
**Minimum Duration**

- **Requirement**: ≥ 3 minutes (180s)
- **Measurement**: FFprobe format duration
- **Rationale**: Substantive content

### VIS_DURATION_MAX (30 pts, SOFT_WARN)
**Maximum Duration**

- **Requirement**: ≤ 20 minutes (1200s)
- **Measurement**: FFprobe format duration
- **Rationale**: Maintain engagement

## Structure & Pedagogy Rules (200 points)

### S1: Required Segment Order (50 pts, HARD_FAIL)
**Consistent Tutorial Structure**

- **Requirement**: Segments must follow canonical order:
  1. Objective
  2. Turn Structure
  3. Core Mechanic
  4. Secondary Mechanics
  5. Scoring
  6. Edge Cases
  (Setup is optional and can appear anywhere)
- **Measurement**: Script segment type sequence analysis
- **Rationale**: Consistent structure aids learning and reduces cognitive load

### S2: Recap/Reset Frequency (50 pts, SOFT_WARN, Elite escalates to HARD_FAIL)
**Pacing and Cognitive Load Management**

- **Requirement**: No content block exceeds 5 minutes (300s) without recap or reset
- **Measurement**: Script segment duration analysis
- **Rationale**: Prevents information overload; maintains viewer comprehension

### S3: Visual Reinforcement Frequency (50 pts, SOFT_WARN)
**Visual Learning Support**

- **Requirement**: Visual reinforcement at least every 30 seconds
- **Measurement**: Render image timestamp gaps
- **Rationale**: Visual cues improve retention and comprehension

### S4: Combinatorial Compression (50 pts, SOFT_WARN, Elite escalates to HARD_FAIL)
**Managing Complex Subsystems**

- **Requirement**: When complexity exceeds thresholds, must use rulebook referral + abstraction pattern
- **Triggers** (ANY condition triggers requirement):
  - Branch count ≥ 5 (decision paths in subsystem)
  - Exception layers ≥ 3 (nested conditional logic)
  - Interaction variables ≥ 4 (independent factors affecting outcome)
  - Projected runtime ≥ 240 seconds (4 minutes for subsystem explanation)
- **Required Structure**:
  - Rulebook section reference (e.g., "See rulebook page 12, Combat Resolution")
  - Core principle summary (1-2 sentences explaining the abstraction)
  - Representative examples (1-2 concrete cases, not exhaustive enumeration)
- **Approved Wording Pattern**:
  > "For [subsystem], the rulebook covers [X] edge cases on page [Y]. The core principle is: [principle]. Here's a representative example: [example]."
- **Anti-Patterns** (DO NOT):
  - Attempt to enumerate all permutations
  - Say "it's complicated, check the rulebook" without explanation
  - Omit representative examples
- **Measurement**: Script subsystem complexity metadata + referral block presence
- **Rationale**: Complex subsystems with many interactions violate S2 pacing constraints if explained exhaustively. Rulebook referral + abstraction maintains tutorial flow while respecting viewer attention limits.

**Example Trigger Scenario**:
- Combat system with 5 weapon types, 3 armor types, 4 terrain modifiers
- Branch count: 5 (weapon choices)
- Interaction variables: 4 (weapon, armor, terrain, initiative)
- Projected runtime: 6 minutes if all combinations explained
- **Solution**: Explain core principle ("higher weapon value minus armor value, modified by terrain"), show 1-2 examples, refer to rulebook table for complete matrix

## Retention & Engagement Rules (200 points)

### RET_CHAPTER_DENSITY (80 pts, SOFT_WARN)
**Chapter Density**

- **Requirement**: 60-180 seconds average per chapter
- **Measurement**: duration / chapter_count
- **Rationale**: Optimal navigation granularity

### RET_CHAPTER_MIN_COUNT (60 pts, HARD_FAIL)
**Minimum Chapter Count**

- **Requirement**: ≥ 3 chapters
- **Measurement**: chapters.json entry count
- **Rationale**: Minimum structure (intro, body, conclusion)

### RET_HOOK_WITHIN_30S (60 pts, ELITE_BONUS)
**Hook Within 30 Seconds**

- **Requirement**: First chapter starts ≤ 30s
- **Measurement**: First chapter timestamp
- **Rationale**: Early engagement reduces drop-off

## Accessibility Rules (150 points)

### ACC_SRT_REQUIRED (60 pts, HARD_FAIL)
**Captions Required**

- **Requirement**: SRT file exists
- **Measurement**: Manifest artifact check
- **Rationale**: Essential for accessibility

### ACC_SRT_SYNC (50 pts, HARD_FAIL)
**Caption Synchronization**

- **Requirement**: Monotonic, non-negative timestamps
- **Measurement**: SRT parser validation
- **Rationale**: Invalid timestamps break display

### ACC_SRT_GAP_MAX (40 pts, SOFT_WARN)
**Maximum Caption Gap**

- **Requirement**: ≤ 5 seconds between captions
- **Measurement**: SRT gap analysis
- **Rationale**: Continuous accessibility

## Trust & Provenance Rules (150 points)

### TRUST_MANIFEST_REQUIRED (50 pts, HARD_FAIL)
**Manifest Required**

- **Requirement**: render_manifest.json exists
- **Measurement**: File existence + JSON parse
- **Rationale**: Artifact provenance

### TRUST_CHECKSUMS_VALID (50 pts, HARD_FAIL)
**Checksums Valid**

- **Requirement**: All SHA-256 checksums verify
- **Measurement**: Checksum verification
- **Rationale**: Integrity assurance

### TRUST_PROFILE_DECLARED (30 pts, HARD_FAIL)
**Profile Declared**

- **Requirement**: Manifest includes profile field
- **Measurement**: Field presence check
- **Rationale**: Quality verification enablement

### TRUST_STANDARD_VERSION (20 pts, ELITE_BONUS)
**Standard Version Declared**

- **Requirement**: Manifest includes eliteStandardVersion
- **Measurement**: Field presence check
- **Rationale**: Standard evolution tracking

## Measurement Methods

### FFmpeg Requirements

- **Version**: FFmpeg 4.0+
- **Filters**: loudnorm, silencedetect, astats
- **Tools**: ffmpeg, ffprobe

### Determinism

All measurements are deterministic given the same input artifacts. No subjective assessments are included in v1.

### Excluded from v1

The following are NOT measured (subjective):
- Visual appeal and aesthetics
- Narration quality and clarity
- Tutorial effectiveness
- Viewer engagement metrics

These may be added in future versions with objective proxies.

## Running the Verifier

### Local Verification

```bash
# Verify specific output directory
npm run verify:elite -- data/outputs/project_ID

# With custom threshold
npm run verify:elite -- data/outputs/project_ID --threshold 950
```

### Integrated with Release

```bash
# Run with elite enforcement
npm run release:prov0-01 -- \
  --pdf rulebook.pdf \
  --confirm-file confirmations.json \
  --elite
```

### CI/CD Integration

```yaml
- name: Elite QC Verification
  run: npm run verify:elite -- ${{ env.OUTPUT_DIR }}
  
- name: Check Elite Score
  run: |
    SCORE=$(jq '.score' docs/releases/ELITE_QC_REPORT.json)
    if [ $SCORE -lt 900 ]; then
      echo "Elite score $SCORE below threshold 900"
      exit 1
    fi
```

## Output Reports

### JSON Report
**Path**: `docs/releases/ELITE_QC_REPORT.json`

```json
{
  "version": "1.0.0",
  "timestamp": "2026-02-23T10:00:00Z",
  "score": 950,
  "max_score": 1000,
  "threshold": 900,
  "status": "PASS",
  "hard_failures": 0,
  "soft_warnings": 2,
  "elite_bonuses": 2,
  "category_scores": {
    "audio": 280,
    "visual": 200,
    "retention": 180,
    "accessibility": 150,
    "trust": 140
  },
  "rules": [...]
}
```

### Markdown Report
**Path**: `docs/releases/ELITE_QC_REPORT.md`

Human-readable summary with:
- Overall score and verdict
- Category breakdowns
- Failed rules with details
- Warnings and recommendations

## Exit Codes

- **0**: Elite certification achieved (score ≥ 900, no HARD_FAIL)
- **2**: HARD_FAIL rule(s) failed (blocks Elite)
- **3**: Score below threshold (no HARD_FAIL but insufficient quality)

## Governance Compliance

### Invariants Maintained

- ✅ Append-only artifacts
- ✅ Explicit confirmations
- ✅ Canonical paths
- ✅ No bypass flags
- ✅ Deterministic measurements

### Traceability

- Standard version in manifest
- Measurement provenance in report
- Commit SHA in runlog
- Rule IDs stable across versions

## Future Enhancements

### Planned for v1.1

- Perceptual audio quality metrics (PESQ/POLQA)
- Scene detection and pacing analysis
- Caption reading level analysis
- Thumbnail quality scoring

### Planned for v2.0

- Multi-language caption verification
- Accessibility contrast ratio checks
- Tutorial effectiveness proxies
- Viewer retention prediction

## Support

- **Standard Contract**: `config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json`
- **Verifier**: `scripts/releases/verify-pro-video-elite.mjs`
- **Tests**: `tests/unit/eliteStandard.test.js`, `tests/unit/eliteVerifier.test.js`
- **Integration**: `tests/integration/elite-release.node.test.mjs`

---

**Standard Version**: 1.0.0  
**Last Updated**: 2026-02-23  
**Status**: Active
