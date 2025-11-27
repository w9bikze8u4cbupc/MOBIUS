# CI Audio Metrics Pipeline Summary

The CI audio metrics pipeline converts the EBUR128 analyzer output into a
reviewer-friendly summary while enforcing a strict, cross-platform KPI
contract. The workflow is symmetric across Unix/macOS and Windows runners so
automation and humans see the same results regardless of environment.

## Pipeline Flow

1. **Parse EBUR128 output** to obtain loudness measurements for the preview
   asset.
2. **Emit `preview_audio_metrics.json`** with the current KPI contract.
3. **Validate the schema** on Unix/macOS (Bash) and Windows (PowerShell) before
   any summary is rendered. A failure on either platform halts the workflow and
   surfaces the validation error in CI logs.
4. **Publish the PR summary** with a fenced JSON block so reviewers can skim the
   metrics directly in the GitHub UI.

## KPI Contract

`preview_audio_metrics.json` must contain exactly these metrics:

- `integrated_lufs`
- `true_peak_dbfs`

Quick reference example:

```json
{
  "integrated_lufs": -16.8,
  "true_peak_dbfs": -0.9
}
```

## Cross-Platform Schema Validation

Both operating system families perform the same validation prior to rendering
the PR summary:

- **Unix/macOS (Bash)**: `jq`-based check ensures the JSON contains both keys
  and exits early on any mismatch.
- **Windows (PowerShell)**: Uses native JSON parsing to enforce the identical
  contract, guaranteeing parity with the Unix path.
- Validation gates the summary step on both operating systems; the pipeline
  never renders a PR summary if either platform reports a contract violation.

Any validation failure blocks the summary step and the job surfaces the error in
the corresponding CI log.

## PR Summary Rendering

- Metrics appear in the PR as a fenced JSON block for readability.
- The artifact remains machine-readable for downstream automation.
- Reviewers no longer need to download CI artifacts for loudness checks.

## QA Quick-Check

- Confirm both **Validate audio metrics** steps succeed on Unix and Windows.
- Verify the PR comment renders the fenced JSON with the two KPI keys.
- Spot-check that loudness and true-peak values match across runners for the
  same build.

## Acceptance / Verification Notes

- Schema validation runs on both Unix/macOS and Windows before the summary
  step, so any failure stops the pipeline from publishing metrics and surfaces
  the error in CI logs.
- The PR UI always displays the JSON payload inside a fenced block with exactly
  the two KPIs, while automation continues to consume the stable
  `preview_audio_metrics.json` artifact.
- Artifact naming, retention policy, and concurrency behavior remain unchanged
  from the legacy pipeline, so downstream integrations do not require updates.

## Failure Modes and Responses

| Condition | Pipeline behavior |
| --- | --- |
| Missing `integrated_lufs` or `true_peak_dbfs` | Validation step fails and the PR summary is skipped. |
| Empty or malformed EBUR128 output | Pipeline surfaces the parser failure and blocks downstream jobs. |
| Summary step runs after a validation failure | Job exits with a clear error note; no stale metrics are published. |

## Optional Future Enhancements

- Add a lightweight trend collector (e.g., retain the last five runs) to help
  catch regressions.
- Introduce a `"schema_version"` field once the KPI contract expands.
