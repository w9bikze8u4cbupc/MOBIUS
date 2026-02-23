# G7 — Elite Verifier Skeleton Complete

**Date**: 2026-02-23  
**Branch**: `feature/prov1-elite-verifier-skeleton`  
**Status**: ✅ Complete

## Summary

Implemented Elite verifier skeleton with score computation and HARD_FAIL gating. The verifier loads the Elite contract, evaluates rules against placeholder metrics, computes scores deterministically, and emits structured QC reports. No ffmpeg extraction or release harness integration yet—this is the first executable enforcement layer.

## Changes Implemented

### 1. Elite Verifier Script

**File**: `scripts/elite/verify-pro-video-elite.mjs`

**Features**:
- Loads Elite contract from `config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json`
- Accepts metrics input via `--metrics` flag (defaults to sample fixture)
- Accepts output path via `--out` flag (defaults to `elite_qc_report.json`)
- Evaluates all contract rules deterministically
- Supports all threshold operators:
  - `==`, `<=`, `>=`, `<`, `>`
  - `within_tolerance` (A1: loudness)
  - `within_range` (C1: chapter density)
  - `matches_sequence` (S1: segment order)
  - `intro_duration_lte_or_cold_open` (R2: intro/cold open)
  - Resolution check with `min_width`/`min_height` (V1)
- Computes:
  - `eliteScore` (0-1000)
  - `hardFailCount`
  - `softWarnCount`
  - `passed_elite_threshold` (score >= 900 AND hardFailCount === 0)
- Emits deterministic JSON report
- Exit codes:
  - `0`: Elite verification passed
  - `1`: Error during execution
  - `2`: HARD_FAIL rules failed (blocks release)
  - `3`: Score below Elite threshold

**CLI Usage**:
```bash
# Use default sample metrics
npm run elite:verify

# Custom metrics and output
node scripts/elite/verify-pro-video-elite.mjs --metrics path/to/metrics.json --out path/to/report.json
```

### 2. Sample Metrics Fixture

**File**: `scripts/elite/sample-elite-metrics.json`

**Purpose**: Deterministic all-pass fixture for testing

**Structure**:
```json
{
  "A1": { "actual": -14.1 },
  "V1": { "actual": { "width": 1920, "height": 1080 } },
  "S1": { "actual": ["objective", "turn_structure", ...] },
  ...
}
```

**Coverage**: All 23 contract rules with passing values

### 3. Unit Tests

**File**: `src/__tests__/eliteVerifierSkeleton.test.js`

**Test Coverage**: 25 tests across 4 categories

**Rule Evaluation Tests** (10 tests):
- `==` operator
- `<=` operator
- `>=` operator
- `within_tolerance` operator
- `within_range` operator
- `matches_sequence` operator
- `intro_duration_lte_or_cold_open` operator
- Missing metrics handling
- HARD_FAIL trigger detection
- SOFT_WARN non-trigger

**Score Computation Tests** (7 tests):
- All-pass fixture yields 1000 points
- Score equals sum of awarded points
- Score never exceeds 1000
- HARD_FAIL increments hardFailCount
- Failing HARD_FAIL awards 0 points
- Failing SOFT_WARN increments softWarnCount
- Score below threshold fails elite

**Report Structure Tests** (4 tests):
- Required fields present
- Rules sorted by ID
- Each rule result has required fields
- Report is deterministic

**Contract Integration Tests** (4 tests):
- Evaluates all contract rules
- contract_id matches
- score_total matches
- elite_threshold_score matches

### 4. NPM Script

**File**: `package.json`

Added `elite:verify` script:
```json
"elite:verify": "node scripts/elite/verify-pro-video-elite.mjs"
```

## Validation Results

### Verifier Execution

```bash
npm run elite:verify
```

**Output**:
```
Elite Verifier Skeleton
======================
Contract: .../MOBIUS_ELITE_VIDEO_STANDARD_v1.json
Metrics:  .../sample-elite-metrics.json
Output:   .../elite_qc_report.json

✓ Loaded contract: MOBIUS_ELITE_VIDEO_STANDARD_v1 v1.0.0
✓ Loaded metrics: 23 rule metrics

Results:
  Elite Score:       1000 / 1000
  Threshold:         900
  HARD_FAIL count:   0
  SOFT_WARN count:   0
  Passed threshold:  YES

✓ Report written: elite_qc_report.json

✅ Elite verification passed
```

**Exit Code**: 0

### Unit Tests

```bash
npm run test:unit -- eliteVerifierSkeleton
```

**Result**: ✅ 25/25 tests passing (1.833s)

### Generated Report Structure

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
  "rules": [
    {
      "id": "A1",
      "passed": true,
      "points_awarded": 60,
      "severity": "HARD_FAIL",
      "hard_fail_triggered": false
    },
    ...
  ]
}
```

## Files Created

### New Files
- `scripts/elite/verify-pro-video-elite.mjs` — Elite verifier skeleton
- `scripts/elite/sample-elite-metrics.json` — All-pass fixture
- `src/__tests__/eliteVerifierSkeleton.test.js` — Unit tests (25 tests)

### Modified Files
- `package.json` — Added `elite:verify` script

## Score Computation Logic

### Points Awarded

```javascript
points_awarded = rule.passed ? rule.scoring.points : 0
```

### Elite Score

```javascript
eliteScore = sum(points_awarded for all rules)
```

**Range**: 0-1000

### HARD_FAIL Count

```javascript
hardFailCount = count(rules where !passed AND severity === 'HARD_FAIL')
```

### SOFT_WARN Count

```javascript
softWarnCount = count(rules where !passed AND severity === 'SOFT_WARN')
```

### Passed Elite Threshold

```javascript
passed_elite_threshold = (eliteScore >= 900) AND (hardFailCount === 0)
```

## Threshold Operators

### Simple Comparisons

- `==`: Exact equality
- `<=`: Less than or equal
- `>=`: Greater than or equal (with special handling for resolution)
- `<`: Less than
- `>`: Greater than

### Complex Operators

**within_tolerance** (A1: Integrated Loudness):
```javascript
passed = Math.abs(actual - target) <= tolerance
```

**within_range** (C1: Chapter Density):
```javascript
passed = actual >= min && actual <= max
```

**matches_sequence** (S1: Segment Order):
```javascript
passed = actual.length === required.length && 
         actual.every((val, idx) => val === required[idx])
```

**intro_duration_lte_or_cold_open** (R2: Intro/Cold Open):
```javascript
passed = (actual.intro_duration <= intro_max) || (actual.cold_open === true)
```

**Resolution Check** (V1: >= with min_width/min_height):
```javascript
passed = actual.width >= min_width && actual.height >= min_height
```

## Exit Codes

- **0**: Elite verification passed (score >= 900, no HARD_FAIL)
- **1**: Error during execution (file not found, JSON parse error, etc.)
- **2**: HARD_FAIL rules failed (blocks release)
- **3**: Score below Elite threshold (no HARD_FAIL but score < 900)

## Determinism

### Guaranteed Deterministic

- Same metrics input → same score output
- Same metrics input → same report structure
- Rules always sorted by ID in report
- No randomness or timestamps in scoring logic

### Verified

```javascript
const report1 = verifyElite(contract, metrics);
const report2 = verifyElite(contract, metrics);
expect(JSON.stringify(report1)).toBe(JSON.stringify(report2));
```

**Result**: ✅ Pass

## Non-Goals (Deferred)

### Not Implemented

- ❌ ffmpeg audio extraction
- ❌ ffmpeg visual analysis
- ❌ Script structure parsing
- ❌ Manifest metadata extraction
- ❌ Release harness integration
- ❌ CI gating

### Future Work

- **G8**: Implement metric extractors (ffmpeg, manifest, script)
- **G9**: Wire verifier into release harness
- **G10**: Add CI gating on Elite score

## Testing Strategy

### Unit Tests (25 tests)

- Test each threshold operator independently
- Test score computation logic
- Test HARD_FAIL/SOFT_WARN counting
- Test report structure
- Test contract integration

### Fixture-Based Testing

- All-pass fixture: `sample-elite-metrics.json`
- Modified fixtures in tests for failure scenarios
- Deterministic, repeatable results

### No Integration Tests Yet

- No ffmpeg execution
- No file system scanning
- No release harness interaction

## Usage Examples

### Basic Usage

```bash
npm run elite:verify
```

### Custom Metrics

```bash
node scripts/elite/verify-pro-video-elite.mjs \
  --metrics path/to/custom-metrics.json \
  --out path/to/custom-report.json
```

### Programmatic Usage

```javascript
import { verifyElite } from './scripts/elite/verify-pro-video-elite.mjs';

const contract = JSON.parse(readFileSync('config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json'));
const metrics = { /* ... */ };

const report = verifyElite(contract, metrics);

console.log(`Score: ${report.eliteScore} / ${report.score_total}`);
console.log(`Passed: ${report.passed_elite_threshold}`);
```

## Acceptance Criteria

✅ `verify-pro-video-elite.mjs` skeleton implemented  
✅ Loads Elite contract JSON  
✅ Accepts structured QC input JSON (placeholder metrics)  
✅ Evaluates rules deterministically  
✅ Computes eliteScore (0-1000)  
✅ Computes hardFailCount  
✅ Computes softWarnCount  
✅ Emits deterministic `elite_qc_report.json`  
✅ No ffmpeg extraction (deferred)  
✅ No release harness modification (deferred)  
✅ EliteScore calculation reflects contract scoring weights  
✅ 25 unit tests passing  
✅ `elite:verify` npm script added  

## Next Steps

This task is complete. The Elite verifier skeleton is functional and tested. Next steps:

1. **G8**: Implement metric extractors
   - ffmpeg audio analysis (A1-A5)
   - ffmpeg visual analysis (V1-V5)
   - Manifest metadata extraction (T1-T3, A11-A13)
   - Script structure parsing (S1-S3, R1-R2)

2. **G9**: Wire verifier into release harness
   - Call verifier from `prov0-01-run.mjs`
   - Include Elite report in release dossier
   - Add Elite score to runlog JSON

3. **G10**: Add CI gating
   - Run verifier in CI pipeline
   - Fail build on HARD_FAIL
   - Report Elite score in PR comments

## Notes

- No new dependencies added (standard library only)
- Governance invariants remain untouched
- Verifier is deterministic and testable
- Exit codes align with contract exit code specification
- All threshold operators from contract are implemented
- Sample fixture provides all-pass baseline for testing

---

**Task**: G7 — Wire ProV1 Elite contract into verifier skeleton  
**Completed**: 2026-02-23  
**Test Count**: 25 verifier tests, 38 contract tests (63 total Elite tests)  
**Status**: ✅ Ready for commit
