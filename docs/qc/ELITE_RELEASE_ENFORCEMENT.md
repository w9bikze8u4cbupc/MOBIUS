# Elite Release Enforcement

**Version**: 1.0  
**Date**: 2026-02-23  
**Contract**: MOBIUS_ELITE_VIDEO_STANDARD_v1

## Overview

Elite QC is automatically enforced during ProV1 release runs. The release harness extracts metrics from rendered artifacts, verifies them against the Elite contract, and blocks release if quality standards are not met.

## Enforcement Flow

### Stage 3.5: Elite QC

Runs automatically after artifact verification and before dossier generation:

1. **Extract Metrics**: Analyze rendered MP4 using ffmpeg/ffprobe
2. **Verify Contract**: Evaluate all 23 Elite rules
3. **Block or Continue**: Deterministic decision based on results

### Blocking Conditions

Release is **blocked** if:
- Any HARD_FAIL rule fails, OR
- Elite Score < 900 (threshold)

Release **continues** if:
- All HARD_FAIL rules pass, AND
- Elite Score >= 900

## Artifacts Generated

### QC Directory

```
data/outputs/project_<id>/qc/
├── elite_metrics.json      # Extracted metrics
└── elite_qc_report.json    # Verification report
```

### Metrics File

```json
{
  "A1": { "actual": -14.1 },
  "A2": { "actual": -1.2 },
  "A3": { "actual": -1.2 },
  "A4": { "actual": 0.4 },
  "V1": { "actual": { "width": 1920, "height": 1080 } },
  "A11": { "actual": true },
  "A12": { "actual": true },
  "A13": { "actual": true }
}
```

### Report File

```json
{
  "contract_id": "MOBIUS_ELITE_VIDEO_STANDARD_v1",
  "contract_version": "1.0.0",
  "eliteScore": 1000,
  "score_total": 1000,
  "elite_threshold_score": 900,
  "hardFailCount": 0,
  "softWarnCount": 0,
  "passed_elite_threshold": true,
  "rules": [...]
}
```

## Error Messages

### HARD_FAIL Violation

```
Elite QC HARD_FAIL: 2 rule(s) failed [A1 (HARD_FAIL), V1 (HARD_FAIL)].
Release blocked per MOBIUS_ELITE_VIDEO_STANDARD_v1.
```

### Threshold Violation

```
Elite QC threshold not met: score 850 < 900.
Release blocked per MOBIUS_ELITE_VIDEO_STANDARD_v1.
```

## Runlog Integration

Elite results are recorded in the release runlog:

```json
{
  "stages": {
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
        "metricsPath": "...",
        "reportPath": "..."
      }
    }
  }
}
```

## No Bypass Flags

Elite enforcement is **non-optional** and **non-bypassable**:
- No `--skip-elite` flag
- No `--force` flag
- No interactive override prompts

This is by design to maintain quality standards.

## Dependencies

### Required Tools
- **ffmpeg**: Audio analysis (loudness, silence detection)
- **ffprobe**: Video stream analysis (resolution)

### Availability Check

The harness validates ffmpeg/ffprobe are available before extraction. If missing, the release fails with a clear error message.

## Metrics Extracted

### Current Implementation (G8)
- **A1**: Integrated loudness (LUFS)
- **A2**: True peak (dBTP)
- **A3**: Clipping proxy (uses true peak)
- **A4**: Max silence duration (seconds)
- **V1**: Resolution (width x height)
- **A11**: SRT file exists
- **A12**: Chapters file exists
- **A13**: Thumbnail file exists

### Future Implementation
- **V2-V4**: Text size, contrast, outline (OCR/image analysis)
- **A5**: Music ducking detection
- **S1-S3**: Script structure parsing
- **R1-R2**: Retention metrics
- **C1-C2**: Chapter metrics
- **T1-T3**: Trust/provenance metadata

## Troubleshooting

### Release Blocked by Elite QC

1. **Check Elite report**: `data/outputs/project_<id>/qc/elite_qc_report.json`
2. **Identify failed rules**: Look for `"hard_fail_triggered": true`
3. **Review metrics**: `data/outputs/project_<id>/qc/elite_metrics.json`
4. **Fix root cause**: Adjust render settings, re-render, re-run release

### ffmpeg Not Found

```
Error: ffmpeg and ffprobe are required but not found in PATH
```

**Solution**: Install ffmpeg and ensure it's in your PATH.

### Metrics Extraction Failed

Check the Elite QC stage logs for specific errors. Common issues:
- MP4 file not found
- Corrupted video file
- ffmpeg execution error

## Exit Codes

- **0**: Release successful (Elite QC passed)
- **1**: Release failed (Elite QC blocked or other error)

## Testing Elite Gating Without ffmpeg

Elite enforcement logic is validated in CI using fixture injection, eliminating the need for ffmpeg in test environments.

### Test Strategy

**File**: `src/__tests__/releaseEliteE2E.test.js`

The test suite validates three critical paths:

1. **PASS**: Elite score >= 900, no HARD_FAIL → release continues
2. **FAIL (HARD_FAIL)**: Any HARD_FAIL rule triggered → release blocked
3. **FAIL (Threshold)**: Elite score < 900 → release blocked

### Fixture-Based Validation

Tests use pre-generated JSON fixtures instead of running ffmpeg:

**Fixture Directory**: `scripts/elite/fixtures/`

- `elite_metrics_pass.json` - Valid metrics for all 8 implemented rules
- `elite_report_pass.json` - Score 1000, no failures
- `elite_report_hardfail.json` - HARD_FAIL triggered (rule A1)
- `elite_report_below_threshold.json` - Score 850 (below 900 threshold)

These fixtures are test-only inputs, immutable, and version-controlled. They are NOT generated runtime artifacts.

### Injection Mechanism

The release harness accepts an internal-only `_eliteOverrides` config parameter (not exposed to users):

```javascript
config._eliteOverrides = {
  extractEliteMetrics: mockExtractor,
  verifyEliteMetrics: mockVerifier
};
```

This allows tests to inject stub implementations that write fixture data instead of running ffmpeg.

### Running Tests

```bash
npm run test:unit -- releaseEliteE2E
```

All 6 tests validate deterministic blocking behavior without external dependencies.

### Production vs Test Mode

- **Production**: No `_eliteOverrides` provided → real ffmpeg extraction
- **Test**: `_eliteOverrides` provided → fixture injection
- **User-facing**: No CLI flags or config options expose this mechanism

## Related Documentation

- [Elite Contract Validation](./ELITE_CONTRACT_VALIDATION.md)
- [Elite Trusted Commands](./ELITE_CONTRACT_TRUSTED_COMMANDS.md)
- [Elite Video Standard](../standards/ELITE_VIDEO_STANDARD_V1.md)

---

**Document Version**: 1.1  
**Last Updated**: 2026-02-23  
**Contract Version**: MOBIUS_ELITE_VIDEO_STANDARD_v1 v1.0.0
