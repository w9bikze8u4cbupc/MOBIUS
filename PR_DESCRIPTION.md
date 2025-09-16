# feat: perf validation + baseline compare, warn-only, promotion guardrails, and translation toggles [perf-baseline]

## Summary

Added PERF_BASELINE_PATH support + branch-aware warn-only default in compare_perf_to_baseline.cjs
Introduced promotion guardrails (main-only, trailer required, reason for lowering) in promote_baselines.cjs
Translation toggles (TRANSLATE_MODE: disabled|optional|required) + LT_URL override + health check

## Changes

- scripts/compare_perf_to_baseline.cjs
- scripts/promote_baselines.cjs
- src/utils/translation.js
- README additions (modes, CI env, examples)

## Validation Evidence

- `npm audit --omit=dev` => 0 vulnerabilities
- Compare vs baseline: PASS with PERF_BASELINE_PATH=baselines/perf.json
- Forced regression => FAIL in normal; "skipped" with PERF_WARN_ONLY=1 on feature branch
- JUnit strictness: negative test fails when JUnit XMLs absent
- Promotion guardrails: correct blocking/allowance per scenarios (dry-run)

## CI Config Notes

Job env:
```yaml
TRANSLATE_MODE: disabled
PERF_BASELINE_PATH: baselines/perf.json
```

Artifact upload for JUnit with if-no-files-found: error
Matrix fail-fast disabled; caches pinned; step summary shows perf and artifact pointers

## Security

pdfjs-dist bumped; audit clean

## Risk & Rollout

Low risk; guarded by envs and dry-run
Roll out via PR merge to main; baseline promotion only on main with trailer
Rollback: revert scripts or set TRANSLATE_MODE=disabled globally

## Checklist

- [x] CI green on all OS runners
- [x] Baseline compare step uses PERF_BASELINE_PATH
- [x] Step summary includes perf metrics and artifacts
- [x] Docs merged (translation modes, promotion rules)