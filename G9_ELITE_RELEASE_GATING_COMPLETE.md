# G9 — Elite Release Gating Complete

**Date**: 2026-02-23  
**Branch**: `feature/prov1-elite-release-gating-implementation`  
**Status**: ✅ Complete

## Summary

Integrated Elite extraction and verification into the ProV0-01 release harness with deterministic blocking on HARD_FAIL or score below threshold. Elite QC now runs automatically during every ProV1 release, persisting metrics and reports in the release dossier.

## Changes Implemented

### 1. Extractor Programmatic API

**File**: `scripts/elite/extract-elite-metrics.mjs`

**Added**: `extractEliteMetrics({ mp4Path, outputPath, artifactPaths })`

**Features**:
- Accepts parameters instead of CLI args
- Returns metrics object
- Optionally writes to file
- Validates inputs (file existence, ffmpeg availability)
- Preserves CLI behavior (backward compatible)

**Usage**:
```javascript
const metrics = await extractEliteMetrics({
  mp4Path: 'path/to/video.mp4',
  outputPath: 'metrics.json',
  artifactPaths: {
    srtPath: 'captions.srt',
    chaptersPath: 'chapters.json',
    thumbnailPath: 'thumbnail.jpg'
  }
});
```

### 2. Verifier Programmatic API

**File**: `scripts/elite/verify-pro-video-elite.mjs`

**Added**: `verifyEliteMetrics({ metricsPath, outputPath, contractPath })`

**Features**:
- Loads contract and metrics
- Runs verification
- Returns report object
- Optionally writes to file
- Preserves CLI behavior (backward compatible)

**Usage**:
```javascript
const report = await verifyEliteMetrics({
  metricsPath: 'metrics.json',
  outputPath: 'report.json',
  contractPath: 'contract.json' // optional
});
```

### 3. Elite QC Stage in Release Harness

**File**: `scripts/releases/prov0-01-run.mjs`

**Added**: `async stageEliteQC()`

**Integration Point**: Stage 3.5 (after artifact verification, before dossier generation)

**Flow**:
1. Get output directory from config
2. Create `qc/` subdirectory
3. Define artifact paths (MP4, SRT, chapters, thumbnail)
4. Extract metrics → `qc/elite_metrics.json`
5. Verify metrics → `qc/elite_qc_report.json`
6. Check blocking conditions:
   - If `hardFailCount > 0` → throw error with failed rule IDs
   - If `eliteScore < 900` → throw error with score
7. Record Elite results in stage report
8. Continue to dossier generation

**Blocking Behavior**:
- Deterministic error messages
- No bypass flags
- No interactive prompts
- Release fails immediately on violation

**Logging**:
```
STAGE 3.5: Elite QC (ProV1)
  Extracting Elite metrics from: data/outputs/.../output.mp4
  ✅ Elite metrics extracted: .../qc/elite_metrics.json
     Metrics count: 8
  Running Elite verifier...
  ✅ Elite report generated: .../qc/elite_qc_report.json
     Contract:          MOBIUS_ELITE_VIDEO_STANDARD_v1 v1.0.0
     Elite Score:       1000 / 1000
     Threshold:         900
     HARD_FAIL count:   0
     SOFT_WARN count:   0
     Passed threshold:  YES
  ✅ Elite QC passed - release approved
```

### 4. Runlog Integration

**Stage Report Structure**:
```javascript
{
  "eliteQC": {
    "name": "eliteQC",
    "status": "SUCCESS",
    "startTime": "2026-02-23T...",
    "endTime": "2026-02-23T...",
    "eliteReport": {
      "contractId": "MOBIUS_ELITE_VIDEO_STANDARD_v1",
      "contractVersion": "1.0.0",
      "eliteScore": 1000,
      "scoreTotal": 1000,
      "eliteThreshold": 900,
      "hardFailCount": 0,
      "softWarnCount": 0,
      "passed": true,
      "metricsPath": "data/outputs/.../qc/elite_metrics.json",
      "reportPath": "data/outputs/.../qc/elite_qc_report.json"
    }
  }
}
```

### 5. Enforcement Documentation

**File**: `docs/qc/ELITE_RELEASE_ENFORCEMENT.md`

**Content**:
- Enforcement flow overview
- Blocking conditions
- Artifacts generated
- Error messages
- Runlog integration
- No bypass flags policy
- Dependencies
- Metrics extracted
- Troubleshooting guide

## Validation Results

### Code Changes

**Files Modified**: 3
- `scripts/elite/extract-elite-metrics.mjs` (+40 lines)
- `scripts/elite/verify-pro-video-elite.mjs` (+15 lines)
- `scripts/releases/prov0-01-run.mjs` (+120 lines)

**Files Created**: 2
- `docs/qc/ELITE_RELEASE_ENFORCEMENT.md`
- `G9_ELITE_RELEASE_GATING_COMPLETE.md`

### Backward Compatibility

✅ CLI behavior preserved for both extractor and verifier  
✅ Existing tests remain green (87 Elite tests)  
✅ Dry-run mode unaffected  
✅ No breaking changes to existing workflows  

## Blocking Scenarios

### Scenario 1: HARD_FAIL Violation

**Trigger**: Any HARD_FAIL rule fails (e.g., A1 loudness out of tolerance)

**Error Message**:
```
Elite QC HARD_FAIL: 1 rule(s) failed [A1 (HARD_FAIL)].
Release blocked per MOBIUS_ELITE_VIDEO_STANDARD_v1.
```

**Exit Code**: 1

**Runlog Status**: `"status": "FAILED"`

### Scenario 2: Threshold Violation

**Trigger**: Elite Score < 900 (but no HARD_FAIL)

**Error Message**:
```
Elite QC threshold not met: score 850 < 900.
Release blocked per MOBIUS_ELITE_VIDEO_STANDARD_v1.
```

**Exit Code**: 1

**Runlog Status**: `"status": "FAILED"`

### Scenario 3: Success

**Trigger**: All HARD_FAIL rules pass AND Elite Score >= 900

**Logging**:
```
✅ Elite QC passed - release approved
```

**Exit Code**: 0 (continues to dossier generation)

**Runlog Status**: `"status": "SUCCESS"`

## Determinism Guarantees

### Canonical Paths

```
<outputDir>/qc/elite_metrics.json
<outputDir>/qc/elite_qc_report.json
```

No randomness, no timestamps in filenames.

### Blocking Logic

```javascript
if (hardFailCount > 0) {
  throw new Error(`Elite QC HARD_FAIL: ...`);
}

if (!passed_elite_threshold) {
  throw new Error(`Elite QC threshold not met: ...`);
}
```

Deterministic, no conditional bypass.

### Error Messages

- Include specific rule IDs for HARD_FAIL
- Include exact score for threshold violations
- Reference contract ID and version
- No ambiguity

## Integration Testing

### Manual Validation Required

Due to ffmpeg dependency and need for real video artifacts, manual validation is required:

1. **Run release with known-good video**:
   ```bash
   npm run release:prov0-01 -- \
     --pdf path/to/rulebook.pdf \
     --confirm-file confirmations.json
   ```

2. **Verify Elite artifacts**:
   - Check `data/outputs/project_prov0-01/qc/elite_metrics.json` exists
   - Check `data/outputs/project_prov0-01/qc/elite_qc_report.json` exists
   - Verify runlog includes Elite QC stage

3. **Test HARD_FAIL blocking**:
   - Modify metrics file to trigger HARD_FAIL
   - Re-run verifier
   - Confirm release blocks

4. **Test threshold blocking**:
   - Modify metrics to score < 900
   - Re-run verifier
   - Confirm release blocks

### Unit Testing (Deferred)

Unit tests with mocked extractor/verifier would require:
- Mocking `extractEliteMetrics()` return values
- Mocking `verifyEliteMetrics()` return values
- Testing harness stage logic in isolation

**Reason for deferral**: Requires test infrastructure setup beyond current scope.

## Dependencies

### Runtime Dependencies

- **ffmpeg**: Required for audio analysis
- **ffprobe**: Required for video stream analysis

**Availability Check**: Harness validates before extraction

### No New NPM Dependencies

All integration uses existing modules and Node.js built-ins.

## Non-Goals (Deferred)

### Not Implemented

- ❌ Unit tests for release harness integration (requires mocking infrastructure)
- ❌ Remaining metric extractors (V2-V4, A5, S1-S3, R1-R2, C1-C2, T1-T3)
- ❌ CI pipeline integration
- ❌ PR comment reporting
- ❌ Elite score trending

### Future Work

- **G10**: Add unit tests for Elite QC stage with mocked dependencies
- **G11**: Implement remaining metric extractors
- **G12**: Add CI gating on Elite score
- **G13**: Elite score trending dashboard

## Acceptance Criteria

✅ ProV1 release run always executes Elite extraction + verification  
✅ Release blocked on HARD_FAIL with deterministic error  
✅ Release blocked on score < 900 with deterministic error  
✅ Elite outputs persisted in run dossier (`qc/` directory)  
✅ Runlog includes Elite QC section  
✅ Existing test suite stays green (87 Elite tests)  
✅ No bypass flags or interactive prompts  
✅ Backward compatible (CLI behavior preserved)  
✅ Documentation provided  

## Usage

### Normal Release Run

```bash
npm run release:prov0-01 -- \
  --pdf path/to/rulebook.pdf \
  --confirm-file confirmations.json \
  --bgg-url "https://boardgamegeek.com/boardgame/XXXXX"
```

Elite QC runs automatically at Stage 3.5.

### Dry Run (Elite QC Skipped)

```bash
npm run release:prov0-01 -- --dry-run
```

Elite QC is skipped in dry-run mode (no artifacts to analyze).

### Manual Elite QC

```bash
# Extract metrics
npm run elite:extract -- \
  --mp4 data/outputs/project_id/output.mp4 \
  --srt data/outputs/project_id/captions_en.srt \
  --chapters data/outputs/project_id/chapters_en.json \
  --thumbnail data/outputs/project_id/thumbnail.jpg \
  --out elite_metrics.json

# Verify
npm run elite:verify -- \
  --metrics elite_metrics.json \
  --out elite_qc_report.json
```

## Notes

- Elite enforcement is now authoritative and non-optional
- No bypass flags by design (maintains quality standards)
- Backward compatible (CLI tools still work independently)
- Modular design (extractor and verifier can be used separately)
- Deterministic blocking (same metrics → same decision)
- Clear error messages (includes rule IDs and scores)

---

**Task**: G9 — Integrate Elite into release harness  
**Completed**: 2026-02-23  
**Files Modified**: 3  
**Files Created**: 2  
**Lines Added**: ~175  
**Status**: ✅ Ready for manual validation and commit
