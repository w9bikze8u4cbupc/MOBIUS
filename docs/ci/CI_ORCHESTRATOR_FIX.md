# CI Orchestrator YAML Parse Error Fix

**Date**: 2026-02-23  
**Branch**: `fix/ci-orchestrator-rectification`  
**Status**: ✅ Ready for PR

## Problem

The `.github/workflows/ci.yml` orchestrator had a persistent "workflow file issue" with 0 jobs instantiated on every run. GitHub Actions validation failed silently, preventing any CI jobs from executing.

## Root Cause

**YAML parse error** in the "Validate audio metrics (Unix)" step (lines 188-190):

```yaml
python -c "import json; d=json.load(open('artifacts/preview_audio_metrics.json'));\
assert {'integrated_lufs','true_peak_dbfs'} <= d.keys(), 'Missing expected audio metric keys'"
```

The Python `-c` command was split across two lines using a backslash (`\`) inside a YAML `run: |` block. This is **invalid YAML syntax** because:
- The `run: |` block uses literal scalar style
- Backslash line continuation is a shell feature, not YAML
- YAML parser sees the backslash as part of the string, causing a parse error

**Local verification**:
```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
# Error: yaml.scanner.ScannerError: could not find expected ':'
#   in ".github/workflows/ci.yml", line 189, column 1
```

## Solution

Merge the Python command onto a single line:

```yaml
python -c "import json; d=json.load(open('artifacts/preview_audio_metrics.json')); assert {'integrated_lufs','true_peak_dbfs'} <= d.keys(), 'Missing expected audio metric keys'"
```

**Validation**:
```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
# ✓ YAML valid
```

## Changes

### Modified
- `.github/workflows/ci.yml` - Fixed Python command line split (lines 188-189)

### Removed
- No files removed (debug workflow `ci-minimal-test.yml` was never committed to this final state)

## Verification

### Local YAML Validation
```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('✓ Valid')"
# Output: ✓ Valid
```

### GitHub Actions Validation
After fix, GitHub Actions:
- ✅ Parses workflow file successfully
- ✅ Instantiates jobs (total_count > 0)
- ✅ No "workflow file issue" banner
- ✅ Jobs execute (may have test failures, but validation passes)

## Impact

**Before**: 0 jobs instantiated, CI completely blocked  
**After**: All jobs instantiate and execute normally

**Scope**: Minimal - single line change, no semantic changes to job logic, no changes to Elite scoring, governance thresholds, or path gating.

## Acceptance Criteria

✅ `.github/workflows/ci.yml` parses as valid YAML locally  
✅ GitHub Actions instantiates jobs on push/PR  
✅ No "workflow file issue" in Actions UI  
✅ Diff limited to syntax fix only  
✅ No debug workflows or speculative changes remain  

---

**Fix Type**: Syntax correction  
**Risk**: None (restores intended behavior)  
**Breaking Changes**: None
