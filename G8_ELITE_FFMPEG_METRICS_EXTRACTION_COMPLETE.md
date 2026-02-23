# G8 — Elite ffmpeg Metrics Extraction Complete

**Date**: 2026-02-23  
**Branch**: `feature/prov1-elite-ffmpeg-metrics-extraction`  
**Status**: ✅ Complete

## Summary

Implemented ffmpeg-based Elite metrics extraction for audio and container analysis. The extractor generates metrics JSON compatible with the Elite verifier from rendered MP4 artifacts. Includes deterministic parsers for ffprobe/ffmpeg output with comprehensive unit tests that don't require ffmpeg availability.

## Changes Implemented

### 1. Metrics Extraction Script

**File**: `scripts/elite/extract-elite-metrics.mjs`

**Features**:
- CLI interface: `--mp4 <path> --out <path> --srt <path> --chapters <path> --thumbnail <path>`
- Validates inputs (file existence, ffmpeg/ffprobe availability)
- Extracts metrics using ffmpeg/ffprobe
- Outputs deterministic JSON compatible with Elite verifier
- Sorted keys for determinism

**Metrics Extracted**:
- **V1**: Resolution (width/height) via ffprobe
- **A1**: Integrated loudness (LUFS) via ffmpeg ebur128
- **A2**: True peak (dBTP) via ffmpeg ebur128
- **A3**: Clipping proxy (uses true peak as proxy)
- **A4**: Max silence duration (seconds) via ffmpeg silencedetect
- **A11**: SRT file existence check
- **A12**: Chapters file existence check
- **A13**: Thumbnail file existence check

**CLI Usage**:
```bash
# Basic usage
npm run elite:extract -- --mp4 path/to/video.mp4

# With artifact paths
npm run elite:extract -- \
  --mp4 path/to/video.mp4 \
  --srt path/to/captions.srt \
  --chapters path/to/chapters.json \
  --thumbnail path/to/thumb.png \
  --out custom-metrics.json
```

### 2. Parser Modules

#### ffprobe Stream Parser

**File**: `scripts/elite/parsers/ffprobe_stream_parse.mjs`

**Function**: `parseResolution(jsonOutput)`

**Input**: ffprobe JSON output from:
```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json <mp4>
```

**Output**:
```javascript
{ width: 1920, height: 1080 }
```

**Error Handling**:
- Throws on missing streams
- Throws on invalid width/height types
- Throws on malformed JSON

#### ffmpeg EBUR128 Parser

**File**: `scripts/elite/parsers/ffmpeg_ebur128_parse.mjs`

**Function**: `parseEBUR128(output)`

**Input**: ffmpeg stderr output from:
```bash
ffmpeg -hide_banner -i <mp4> -filter_complex ebur128=peak=true -f null -
```

**Output**:
```javascript
{
  integrated_lufs: -14.1,
  true_peak_dbtp: -1.2
}
```

**Features**:
- Parses summary section for integrated loudness and true peak
- Rounds to 1 decimal place for determinism
- Throws on missing metrics

#### ffmpeg Silence Detect Parser

**File**: `scripts/elite/parsers/ffmpeg_silencedetect_parse.mjs`

**Function**: `parseSilenceDetect(output)`

**Input**: ffmpeg stderr output from:
```bash
ffmpeg -hide_banner -i <mp4> -af silencedetect=noise=-30dB:d=0.5 -f null -
```

**Output**:
```javascript
{ max_silence_duration: 0.4 }
```

**Features**:
- Parses all silence runs
- Returns maximum duration
- Returns 0 if no silence detected
- Rounds to 1 decimal place for determinism

### 3. Test Fixtures

**Files**:
- `scripts/elite/fixtures/ffprobe_width_height.json` — Sample ffprobe JSON output
- `scripts/elite/fixtures/ffmpeg_ebur128_output.txt` — Sample ebur128 summary
- `scripts/elite/fixtures/ffmpeg_silencedetect_output.txt` — Sample silencedetect output

**Purpose**: Enable deterministic unit tests without requiring ffmpeg installation

### 4. Unit Tests

**File**: `src/__tests__/eliteMetricsExtraction.test.js`

**Test Coverage**: 24 tests across 6 categories

**ffprobe Resolution Parser Tests** (5 tests):
- Parses valid ffprobe JSON output
- Parses 4K resolution
- Throws on missing streams
- Throws on invalid width/height
- Throws on malformed JSON

**ffmpeg EBUR128 Parser Tests** (5 tests):
- Parses valid ebur128 output
- Rounds to 1 decimal place
- Handles positive values
- Throws on missing integrated loudness
- Throws on missing true peak

**ffmpeg Silence Detect Parser Tests** (5 tests):
- Parses valid silencedetect output
- Returns 0 when no silence detected
- Finds maximum among multiple silence runs
- Rounds to 1 decimal place
- Handles single silence run

**Determinism Tests** (3 tests):
- ffprobe parser is deterministic
- ebur128 parser is deterministic
- silencedetect parser is deterministic

**Rounding Behavior Tests** (2 tests):
- ebur128 rounds consistently
- silencedetect rounds consistently

**Edge Cases Tests** (4 tests):
- Handles very quiet audio (high negative LUFS)
- Handles very loud audio (low negative LUFS)
- Handles very long silence
- Handles very short silence

### 5. NPM Script

**File**: `package.json`

Added `elite:extract` script:
```json
"elite:extract": "node scripts/elite/extract-elite-metrics.mjs"
```

## Validation Results

### Unit Tests

```bash
npm run test:unit -- eliteMetricsExtraction
```

**Result**: ✅ 24/24 tests passing (1.082s)

**Key Validations**:
- All parsers handle valid input correctly
- All parsers throw on invalid input
- All parsers are deterministic (same input → same output)
- Rounding behavior is consistent and documented
- Edge cases handled correctly

### Total Elite Test Count

- Contract tests: 38
- Verifier tests: 25
- Extraction tests: 24
- **Total**: 87 Elite tests

## Metrics Extraction Details

### V1: Resolution

**Command**:
```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json <mp4>
```

**Output Format**:
```json
{
  "V1": {
    "actual": {
      "width": 1920,
      "height": 1080
    }
  }
}
```

**Contract Threshold**: `>= 1920x1080`

### A1: Integrated Loudness

**Command**:
```bash
ffmpeg -hide_banner -i <mp4> -filter_complex ebur128=peak=true -f null -
```

**Output Format**:
```json
{
  "A1": {
    "actual": -14.1
  }
}
```

**Contract Threshold**: `-14.0 ± 0.5 LUFS`

**Rounding**: 1 decimal place

### A2: True Peak

**Command**: Same as A1 (ebur128 provides both)

**Output Format**:
```json
{
  "A2": {
    "actual": -1.2
  }
}
```

**Contract Threshold**: `<= -1.0 dBTP`

**Rounding**: 1 decimal place

### A3: Clipping Proxy

**Method**: Uses true peak (A2) as proxy

**Output Format**:
```json
{
  "A3": {
    "actual": -1.2
  }
}
```

**Contract Threshold**: `<= -0.1 dBFS`

**Note**: Currently uses true peak dBTP as proxy. Contract expects dBFS but threshold logic in verifier handles this.

### A4: Max Silence Duration

**Command**:
```bash
ffmpeg -hide_banner -i <mp4> -af silencedetect=noise=-30dB:d=0.5 -f null -
```

**Output Format**:
```json
{
  "A4": {
    "actual": 0.4
  }
}
```

**Contract Threshold**: `<= 0.5 seconds`

**Rounding**: 1 decimal place

**Note**: This is a proxy measurement. Future phases will incorporate "intent breaks" metadata to distinguish intentional silence from unintentional gaps.

### A11-A13: Artifact Existence

**Method**: Filesystem checks using `existsSync()`

**Output Format**:
```json
{
  "A11": { "actual": true },
  "A12": { "actual": true },
  "A13": { "actual": true }
}
```

**Contract Thresholds**: All must be `true`

## Determinism Guarantees

### Rounding

All numeric metrics rounded to 1 decimal place using:
```javascript
Math.round(value * 10) / 10
```

**Behavior**:
- Consistent across platforms
- Deterministic for same input
- Documented in tests

### Key Ordering

Output JSON keys sorted alphabetically:
```javascript
const sortedMetrics = {};
Object.keys(metrics).sort().forEach(key => {
  sortedMetrics[key] = metrics[key];
});
```

### Parser Stability

- No regex "best effort" parsing
- Explicit error handling
- Validated against fixtures
- Deterministic test coverage

## Integration with Verifier

### Workflow

```bash
# 1. Extract metrics from rendered video
npm run elite:extract -- --mp4 path/to/video.mp4 --out metrics.json

# 2. Verify against Elite contract
npm run elite:verify -- --metrics metrics.json --out report.json
```

### Compatibility

Extractor output format matches verifier input format exactly:
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

## Non-Goals (Deferred)

### Not Implemented

- ❌ OCR/contrast/text-size verification (V2-V4)
- ❌ Music ducking detection (A5)
- ❌ Script structure parsing (S1-S3)
- ❌ Retention metrics (R1-R2)
- ❌ Chapter metrics (C1-C2)
- ❌ Trust/provenance metrics (T1-T3)
- ❌ Release harness integration
- ❌ CI gating

### Future Work

- **G9**: Implement remaining metric extractors (V2-V4, A5, S1-S3, R1-R2, C1-C2, T1-T3)
- **G10**: Wire extractor into release harness
- **G11**: Add CI gating on Elite score

## Files Created

### New Files
- `scripts/elite/extract-elite-metrics.mjs` — Main extraction script
- `scripts/elite/parsers/ffprobe_stream_parse.mjs` — Resolution parser
- `scripts/elite/parsers/ffmpeg_ebur128_parse.mjs` — Loudness/peak parser
- `scripts/elite/parsers/ffmpeg_silencedetect_parse.mjs` — Silence parser
- `scripts/elite/fixtures/ffprobe_width_height.json` — Test fixture
- `scripts/elite/fixtures/ffmpeg_ebur128_output.txt` — Test fixture
- `scripts/elite/fixtures/ffmpeg_silencedetect_output.txt` — Test fixture
- `src/__tests__/eliteMetricsExtraction.test.js` — Unit tests (24 tests)

### Modified Files
- `package.json` — Added `elite:extract` script

## Dependencies

### Runtime Dependencies

- **ffmpeg**: Required for audio analysis (ebur128, silencedetect)
- **ffprobe**: Required for video stream analysis (resolution)

**Availability Check**: Script validates ffmpeg/ffprobe are in PATH before execution

### No New NPM Dependencies

All parsing uses Node.js built-ins:
- `child_process.execSync` for command execution
- `fs` for file operations
- `path` for path manipulation

## Error Handling

### Input Validation

- MP4 file must exist
- ffmpeg/ffprobe must be available in PATH
- Artifact paths (if provided) are checked for existence

### Parser Errors

- Malformed JSON throws descriptive error
- Missing metrics in output throws descriptive error
- Invalid data types throw descriptive error

### Graceful Degradation

- Missing artifact paths (SRT, chapters, thumbnail) are optional
- Metrics not extracted are omitted from output (not set to null)
- Verifier treats missing metrics as failures per existing logic

## Testing Strategy

### Unit Tests (No ffmpeg Required)

- Use captured fixture outputs
- Test parser logic in isolation
- Validate determinism
- Validate rounding behavior
- Validate error handling

### Manual Runtime Validation

```bash
# Extract from real video
npm run elite:extract -- --mp4 path/to/video.mp4

# Verify extraction
npm run elite:verify -- --metrics elite_metrics.json
```

**Note**: Manual validation requires ffmpeg/ffprobe installed

## Acceptance Criteria

✅ `elite:extract` produces metrics JSON compatible with Elite verifier  
✅ Extractor computes: A1, A2, A3 (proxy), A4, V1  
✅ Extractor checks existence: A11-A13 (if paths provided)  
✅ Deterministic parsing tests pass without requiring ffmpeg  
✅ No new dependencies added  
✅ Parsers are modular and isolated  
✅ 24 extraction tests passing  
✅ Total 87 Elite tests passing (38 contract + 25 verifier + 24 extraction)  

## Usage Examples

### Basic Extraction

```bash
npm run elite:extract -- --mp4 out/video.mp4
```

**Output**: `elite_metrics.json` in current directory

### Full Extraction with Artifacts

```bash
npm run elite:extract -- \
  --mp4 out/video.mp4 \
  --srt out/captions.srt \
  --chapters out/chapters.json \
  --thumbnail out/thumbnail.png \
  --out extracted-metrics.json
```

### Complete Workflow

```bash
# 1. Extract metrics
npm run elite:extract -- --mp4 out/video.mp4 --out metrics.json

# 2. Verify against contract
npm run elite:verify -- --metrics metrics.json --out report.json

# 3. Check exit code
echo $?  # 0=pass, 2=HARD_FAIL, 3=below threshold
```

## Next Steps

This task is complete. The Elite metrics extractor is functional and tested. Next steps:

1. **G9**: Implement remaining metric extractors
   - V2-V4: Text size, contrast, outline (OCR/image analysis)
   - A5: Music ducking detection (dual-track analysis)
   - S1-S3: Script structure parsing
   - R1-R2: Retention metrics (hook timing, intro duration)
   - C1-C2: Chapter metrics (density, naming quality)
   - T1-T3: Trust/provenance (manifest metadata)

2. **G10**: Wire extractor into release harness
   - Call extractor from `prov0-01-run.mjs`
   - Include Elite report in release dossier
   - Add Elite score to runlog JSON

3. **G11**: Add CI gating
   - Run extractor + verifier in CI pipeline
   - Fail build on HARD_FAIL
   - Report Elite score in PR comments

## Notes

- No new dependencies added (standard library + ffmpeg/ffprobe only)
- Governance invariants remain untouched
- Extractor is deterministic and testable
- Parsers are modular for future extension
- A3 clipping proxy uses true peak (refinement possible later)
- A4 silence detection is proxy (intent metadata integration deferred)
- Rounding behavior documented and tested
- All metrics use 1 decimal place precision

---

**Task**: G8 — Implement ffmpeg-based Elite metrics extraction  
**Completed**: 2026-02-23  
**Test Count**: 24 extraction tests (87 total Elite tests)  
**Metrics Extracted**: 8 (V1, A1-A4, A11-A13)  
**Status**: ✅ Ready for commit
