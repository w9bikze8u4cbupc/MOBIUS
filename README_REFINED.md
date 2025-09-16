# Mobius Games Tutorial Generator

## Translation Modes

### TRANSLATE_MODE
Control translation behavior with the `TRANSLATE_MODE` environment variable:

- `disabled`: Skip translation entirely (CI default). Returns source text.
- `optional`: Attempt translation, fallback to source on error with a warning.
- `required`: Attempt translation, fail the run on error.

### LT_URL
Override the LibreTranslate endpoint with the `LT_URL` environment variable. Default: `http://localhost:5002/translate`

### Examples
```powershell
# Windows (PowerShell)
$env:TRANSLATE_MODE="disabled"; npm run ci:validate
$env:LT_URL="http://localhost:5002/translate"; $env:TRANSLATE_MODE="required"; npm run generate
```

```bash
# macOS/Linux
TRANSLATE_MODE=disabled npm run ci:validate
LT_URL=http://localhost:5002/translate TRANSLATE_MODE=required npm run generate
```

## Baseline Compare and Warn-Only

### Compare against baseline
```bash
PERF_BASELINE_PATH=baselines/perf.json node scripts/compare_perf_to_baseline.cjs
```

### Warn-only on feature branches
```bash
GITHUB_REF_NAME=feature/foo PERF_WARN_ONLY=1 node scripts/compare_perf_to_baseline.cjs
```
- Regressions map to JUnit "skipped" (exit 0) off main
- By default, non-main branches use warn-only mode automatically

## Promotion Guardrails

### Promotion rules (scripts/promote_baselines.cjs)
- Only main branch can promote baselines
- Commit must include [baseline] or [perf-baseline] trailer
- Baseline lowering requires ALLOW_REGRESSION_REASON
- DRY_RUN=1 prints intent without changing files

### Examples (PowerShell)
```powershell
$env:GITHUB_REF_NAME="main"
$env:GIT_LAST_COMMIT_MESSAGE="feat: update perf [perf-baseline]"
$env:ALLOW_REGRESSION_REASON="Renderer refactor, accepted by perf team"
$env:DRY_RUN="1"
node scripts\promote_baselines.cjs
```

## CI Configuration

### Job Environment
```yaml
env:
  TRANSLATE_MODE: disabled
  PERF_BASELINE_PATH: baselines/perf.json
```

### Artifact Upload
```yaml
- uses: actions/upload-artifact@v4
  with:
    name: junit-xml
    path: reports/junit/*.xml
    if-no-files-found: error
```

### Matrix Configuration
```yaml
fail-fast: false
```

### Caching
Caches are pinned for stable builds.

### Step Summary
The step summary includes performance metrics and artifact pointers.