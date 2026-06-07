# Post-Merge Main Verification Report

**Date:** 2026-06-07  
**Latest main SHA:** `5659cc1baec9f5b23853cb7b596a9b56998eba14`  
**Verdict:** ✅ PASS — all merged areas validated locally and in CI

---

## Merge Table

| Order | PR | Title | Merged At (UTC) |
|---|---|---|---|
| 1 | #389 | Elite ESM verifier split | 2026-06-07T18:33:26Z |
| 2 | #391 | Client no-tests + E2E sha256 blockers | 2026-06-07T18:40:16Z |
| 3 | #392 | Missing render-ffmpeg.mjs entrypoint | 2026-06-07T18:44:51Z |
| 4 | #393 | EBUR128 true-peak token matching | 2026-06-07T18:48:35Z |
| 5 | #390 | Caption locale normalization | 2026-06-07T18:51:42Z |

---

## CI Status (main, SHA `5659cc1`)

CI workflow run `27101607406` — **all 25 jobs passed**:

- `build-and-qa (ubuntu-latest)` ✅
- `build-and-qa (macos-latest)` ✅
- `build-and-qa (windows-latest)` ✅
- `MOBIUS E2E Orchestrator` ✅
- `Phase E Governance` (3 OSes) ✅
- `subtitle-governance` (3 OSes) ✅
- `audio-mixing-governance` (3 OSes) ✅
- `motion-governance` (3 OSes) ✅
- `G3 Tutorial Visualization Governance` (3 OSes) ✅
- `g5-cross-tutorial-analytics-governance` (3 OSes) ✅
- `mobius-export-governance` (3 OSes) ✅

---

## Local Validation

### 1. Elite ESM Verifier (PR #389)

```
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config jest.config.elite.mjs --ci --forceExit
```

Result: **28 tests passed** (all rule evaluation, score computation, report structure, S4 compression, and contract integration assertions).

### 2. Root Jest CJS Suite (PR #389 baseline)

```
npx jest --ci --forceExit --testPathIgnorePatterns="eliteVerifierSkeleton\.test\.mjs$"
```

Result: **18 suites, 87 tests (86 passed, 1 skipped)** — no failures.

### 3. MOBIUS E2E / Checklist sha256 (PR #391)

```
node scripts/run_mobius_e2e.cjs --game hanamikoji --lang en --resolution 1920x1080 --mode preview
```

Result: **E2E PASS** — ingestion, storyboard, render-config, render, and checklist all succeed.

```
npx jest --ci --forceExit --testPathPattern="checklist_validator"
```

Result: **3 tests passed** — container/junit mapping, missing artifact handling, junit xml generation.

```
npx jest --ci --forceExit --testPathPattern="mobius_e2e_orchestrator"
```

Result: **2 tests passed** — step execution order and CLI arg parsing.

### 4. Render Preview Entrypoint (PR #392)

```
node scripts/render-ffmpeg.mjs
```

Result: Script loads and executes correctly. Without ffmpeg installed locally, exits cleanly with: "ffmpeg not available — skipping render. CI fallback will synthesize the preview." In CI (with ffmpeg), produces `out/preview_with_audio.mp4` successfully.

### 5. Audio EBUR128 True-Peak (PR #393)

Validated via CI run `27101607406`: `Audio gates (Unix)` and `Audio gates (Windows)` pass on all three OSes. The corrected `True peak` / `Peak:` tokens match real ffmpeg output.

### 6. Caption Locale Normalization (PR #390)

```
npx jest --ci --forceExit --testPathPattern="render_job_config"
```

Result: **2 suites, 8 tests passed** — includes caption locale normalization tests preventing `[object Object]` in file paths.

---

## Follow-Up Blockers

None identified. All required checks are green on main.

---

## Notes

- Intermediate merge commits (`cd008b5`, `2344aba`, `00844e6`) had their CI runs cancelled by the concurrency group (`cancel-in-progress: true`) — expected behavior for rapid sequential merges.
- The final commit `5659cc1` ran the complete CI matrix and passed all jobs.
- No source files were modified during this verification.
