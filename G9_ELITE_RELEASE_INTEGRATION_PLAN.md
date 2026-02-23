# G9 — Elite Release Integration Plan

**Date**: 2026-02-23  
**Branch**: `feature/prov1-elite-release-gating`  
**Status**: ⚠️ PLAN ONLY - Implementation Deferred

## Summary

This document outlines the plan for integrating Elite extraction and verification into the ProV0-01 release harness. Due to the complexity of the existing release harness (600+ lines) and the need for extensive testing, this task requires careful implementation in a dedicated session.

## Current State

### Completed (G3-G8)
- ✅ Elite contract JSON with 23 rules (G3-G6.1)
- ✅ Elite verifier skeleton with score computation (G7)
- ✅ ffmpeg-based metrics extraction (G8)
- ✅ 87 Elite tests passing (38 contract + 25 verifier + 24 extraction)

### Missing
- ❌ Integration into release harness
- ❌ Deterministic blocking on HARD_FAIL/threshold
- ❌ Elite artifacts in release dossier
- ❌ Elite score in runlog JSON

## Integration Points

### Release Harness Structure

**File**: `scripts/releases/prov0-01-run.mjs`

**Current Stages**:
1. Start API Server
2. E2E Commissioning
3. Verify Artifacts (objective QC)
4. Generate Release Dossier

**Proposed New Stage**: Elite QC (between stages 3 and 4)

### Elite QC Stage Implementation

```javascript
async stageEliteQC() {
  this.log('STAGE 3.5: Elite QC');
  const stage = { 
    name: 'eliteQC', 
    startTime: new Date().toISOString(), 
    status: 'IN_PROGRESS' 
  };

  try {
    // Get output directory
    const { getOutputPath } = await import('../../src/config/storage.mjs');
    const outputDir = getOutputPath(this.config.projectId);
    
    // Create QC subdirectory
    const qcDir = join(outputDir, 'qc');
    if (!existsSync(qcDir)) {
      mkdirSync(qcDir, { recursive: true });
    }

    // Define artifact paths
    const mp4Path = join(outputDir, 'output.mp4');
    const srtPath = join(outputDir, `captions_${this.config.lang}.srt`);
    const chaptersPath = join(outputDir, `chapters_${this.config.lang}.json`);
    const thumbnailPath = join(outputDir, 'thumbnail.jpg');
    
    // Define output paths
    const metricsPath = join(qcDir, 'elite_metrics.json');
    const reportPath = join(qcDir, 'elite_qc_report.json');

    this.log(`  Extracting Elite metrics...`);
    
    // Import and run extractor
    const { extractMetrics } = await import('../elite/extract-elite-metrics.mjs');
    const metrics = await extractMetrics(
      mp4Path,
      srtPath,
      chaptersPath,
      thumbnailPath
    );
    
    // Write metrics
    writeFileSync(metricsPath, JSON.stringify(metrics, null, 2) + '\n', 'utf8');
    this.log(`  ✅ Metrics extracted: ${metricsPath}`);

    this.log(`  Running Elite verifier...`);
    
    // Import and run verifier
    const { verifyElite } = await import('../elite/verify-pro-video-elite.mjs');
    const contractPath = join(REPO_ROOT, 'config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json');
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
    
    const report = verifyElite(contract, metrics);
    
    // Write report
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    this.log(`  ✅ Elite report: ${reportPath}`);
    
    // Log results
    this.log(`     Elite Score:       ${report.eliteScore} / ${report.score_total}`);
    this.log(`     Threshold:         ${report.elite_threshold_score}`);
    this.log(`     HARD_FAIL count:   ${report.hardFailCount}`);
    this.log(`     SOFT_WARN count:   ${report.softWarnCount}`);
    this.log(`     Passed threshold:  ${report.passed_elite_threshold ? 'YES' : 'NO'}`);

    // Check for blocking conditions
    if (report.hardFailCount > 0) {
      const failedRules = report.rules
        .filter(r => r.hard_fail_triggered)
        .map(r => r.id)
        .join(', ');
      
      throw new Error(
        `Elite QC HARD_FAIL: ${report.hardFailCount} rule(s) failed (${failedRules}). ` +
        `Release blocked per Elite contract.`
      );
    }

    if (!report.passed_elite_threshold) {
      throw new Error(
        `Elite QC threshold not met: score ${report.eliteScore} < ${report.elite_threshold_score}. ` +
        `Release blocked per Elite contract.`
      );
    }

    this.log(`  ✅ Elite QC passed`);

    stage.status = 'SUCCESS';
    stage.endTime = new Date().toISOString();
    stage.eliteReport = {
      eliteScore: report.eliteScore,
      hardFailCount: report.hardFailCount,
      softWarnCount: report.softWarnCount,
      passed: report.passed_elite_threshold,
      metricsPath,
      reportPath
    };
    this.report.stages.eliteQC = stage;

  } catch (error) {
    stage.status = 'FAILED';
    stage.error = error.message;
    stage.endTime = new Date().toISOString();
    this.report.stages.eliteQC = stage;
    throw error;
  }
}
```

### Runlog Integration

**File**: `scripts/releases/generate-pro-v0-runlog.mjs`

Add Elite QC section to runlog:

```javascript
{
  "eliteQC": {
    "contractId": "MOBIUS_ELITE_VIDEO_STANDARD_v1",
    "contractVersion": "1.0.0",
    "eliteScore": 1000,
    "scoreTotal": 1000,
    "eliteThreshold": 900,
    "hardFailCount": 0,
    "softWarnCount": 0,
    "passed": true,
    "timestamp": "2026-02-23T...",
    "metricsPath": "data/outputs/project_prov0-01/qc/elite_metrics.json",
    "reportPath": "data/outputs/project_prov0-01/qc/elite_qc_report.json"
  }
}
```

### QC Review Integration

**File**: Auto-filled QC review in `stageGenerateDossier()`

Add Elite QC section:

```markdown
## Elite QC (ProV1)

**Contract**: MOBIUS_ELITE_VIDEO_STANDARD_v1 v1.0.0  
**Elite Score**: 1000 / 1000  
**Threshold**: 900  
**Status**: ✅ PASSED

**Metrics**:
- HARD_FAIL count: 0
- SOFT_WARN count: 0

**Artifacts**:
- Metrics: `qc/elite_metrics.json`
- Report: `qc/elite_qc_report.json`

### Rule Results

| Rule | Category | Severity | Status | Points |
|------|----------|----------|--------|--------|
| A1 | Audio | HARD_FAIL | ✅ PASS | 60/60 |
| A2 | Audio | HARD_FAIL | ✅ PASS | 50/50 |
| ... | ... | ... | ... | ... |
```

## File Modifications Required

### 1. `scripts/releases/prov0-01-run.mjs`

**Changes**:
- Add `stageEliteQC()` method after `stageVerifyArtifacts()`
- Call `stageEliteQC()` in `run()` method
- Import Elite extractor and verifier modules
- Handle Elite blocking errors deterministically

**Lines to modify**: ~50-100 lines

### 2. `scripts/elite/extract-elite-metrics.mjs`

**Changes**:
- Export `extractMetrics()` function for programmatic use
- Accept parameters instead of CLI args when imported
- Return metrics object instead of writing to file (caller handles I/O)

**Lines to modify**: ~20-30 lines

### 3. `scripts/elite/verify-pro-video-elite.mjs`

**Changes**:
- Already exports `verifyElite()` function ✅
- No changes needed

### 4. `scripts/releases/generate-pro-v0-runlog.mjs`

**Changes**:
- Add Elite QC section to runlog structure
- Read Elite report from QC directory
- Include Elite score and status

**Lines to modify**: ~30-40 lines

### 5. `docs/qc/ELITE_CONTRACT_VALIDATION.md`

**Changes**:
- Add section on release harness integration
- Document Elite blocking behavior
- Update workflow examples

**Lines to add**: ~50-100 lines

## Testing Strategy

### Unit Tests

**File**: `src/__tests__/releaseEliteIntegration.test.js`

**Test Coverage**:
- Elite QC stage invokes extractor with correct paths
- Elite QC stage invokes verifier with extracted metrics
- Elite QC stage writes artifacts to QC directory
- Elite QC stage blocks on HARD_FAIL
- Elite QC stage blocks on score < threshold
- Elite QC stage passes when all rules pass
- Runlog includes Elite QC section
- QC review includes Elite QC section

**Mocking Strategy**:
- Mock `extractMetrics()` to return fixture data
- Mock `verifyElite()` to return fixture reports
- Mock file system operations
- No ffmpeg required

### Integration Tests

**Manual Validation**:
1. Run release harness with known-good video
2. Verify Elite artifacts in QC directory
3. Verify runlog includes Elite score
4. Verify QC review includes Elite section

**Failure Testing**:
1. Modify metrics to trigger HARD_FAIL
2. Verify release blocks with clear error
3. Verify runlog shows failure
4. Modify metrics to score < 900
5. Verify release blocks with clear error

## Exit Codes

### Current Verifier Exit Codes
- `0`: Elite verification passed
- `1`: Error during execution
- `2`: HARD_FAIL rules failed (blocks release)
- `3`: Score below Elite threshold (blocks release)

### Release Harness Handling
- Exit codes 2 or 3 → throw error → release fails
- Exit code 0 → continue to dossier generation
- Exit code 1 → throw error → release fails

## Determinism Guarantees

### Canonical Paths
- Metrics: `<outputDir>/qc/elite_metrics.json`
- Report: `<outputDir>/qc/elite_qc_report.json`
- No bypass flags or "best effort" modes

### Blocking Behavior
- HARD_FAIL → immediate block
- Score < 900 → immediate block
- No interactive prompts
- Deterministic error messages

### Artifact Persistence
- Elite artifacts always written to QC directory
- Runlog always includes Elite section
- QC review always includes Elite section
- Append-only storage constraints maintained

## Non-Goals (Deferred)

### Not Implemented
- ❌ Remaining metric extractors (V2-V4, A5, S1-S3, R1-R2, C1-C2, T1-T3)
- ❌ CI pipeline integration
- ❌ PR comment reporting
- ❌ Elite score trending/history
- ❌ Interactive Elite rule override (intentionally excluded)

### Future Work
- **G10**: Implement remaining metric extractors
- **G11**: Add CI gating on Elite score
- **G12**: Elite score trending dashboard

## Implementation Checklist

### Phase 1: Core Integration
- [ ] Refactor extractor for programmatic use
- [ ] Add `stageEliteQC()` to release harness
- [ ] Wire Elite QC into `run()` sequence
- [ ] Handle blocking errors deterministically
- [ ] Write unit tests for Elite QC stage

### Phase 2: Dossier Integration
- [ ] Update runlog generator with Elite section
- [ ] Update QC review auto-fill with Elite section
- [ ] Verify artifact paths are canonical
- [ ] Test runlog/review generation

### Phase 3: Testing & Validation
- [ ] Create integration test fixtures
- [ ] Test HARD_FAIL blocking
- [ ] Test threshold blocking
- [ ] Test success path
- [ ] Manual validation with real video

### Phase 4: Documentation
- [ ] Update ELITE_CONTRACT_VALIDATION.md
- [ ] Update AUTONOMOUS_EXECUTION.md
- [ ] Create Elite integration guide
- [ ] Update release checklist

## Estimated Effort

- **Core Integration**: 2-3 hours
- **Testing**: 1-2 hours
- **Documentation**: 1 hour
- **Total**: 4-6 hours

## Risks & Mitigation

### Risk: Breaking Existing Release Harness
**Mitigation**: 
- Implement Elite QC as separate stage
- Preserve existing stage order
- Add comprehensive tests
- Test with dry-run mode first

### Risk: ffmpeg Not Available in CI
**Mitigation**:
- Document ffmpeg requirement
- Add dependency check in Elite QC stage
- Provide clear error message if missing

### Risk: Elite Blocking Legitimate Releases
**Mitigation**:
- Ensure contract thresholds are validated
- Provide clear error messages with rule IDs
- Include Elite report in dossier for debugging
- No bypass flags (by design)

## Acceptance Criteria

- [ ] ProV1 release run always executes Elite extraction + verification
- [ ] Release blocked on HARD_FAIL with deterministic error
- [ ] Release blocked on score < 900 with deterministic error
- [ ] Elite outputs persisted in run dossier (`qc/` directory)
- [ ] Runlog includes Elite QC section
- [ ] QC review includes Elite QC section
- [ ] Existing test suite stays green
- [ ] New tests cover Elite integration without requiring ffmpeg
- [ ] Documentation updated

## Next Steps

This plan should be implemented in a dedicated session with:
1. Full context on release harness structure
2. Ability to test with real video artifacts
3. Time for thorough testing and validation

---

**Task**: G9 — Integrate Elite into release harness  
**Status**: ⚠️ PLAN ONLY - Implementation Deferred  
**Reason**: Complexity requires dedicated session with full testing  
**Estimated Effort**: 4-6 hours  
**Prerequisites**: G3-G8 complete ✅
