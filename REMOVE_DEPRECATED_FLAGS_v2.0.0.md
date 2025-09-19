# Ticket: Remove Deprecated Flags for v2.0.0

## Description
Remove all deprecated flags and aliases that have been marked for removal in v2.0.0. These were introduced for backward compatibility but should now be removed to clean up the API.

## Deprecated Flags to Remove

### Bash Script (`mobius_golden_path.sh`)
- `--json-out` → `--json-summary`
- `--junit-out` → `--junit`
- `--timeout` → `--timeout-default`
- `--retries` → `--retry`
- `--metrics-token-legacy` → `--metrics-token`

### PowerShell Script (`mobius_golden_path.ps1`)
- `-JsonOut` → `-JsonSummary`
- `-JunitOut` → `-JUnitPath`
- `-Timeout` → `-TimeoutDefault`
- `-Retries` → `-RetryCount`
- `-MetricsToken` → `-MetricsTok`

## Implementation Steps

1. Remove deprecated flag handling from bash script argument parsing
2. Remove deprecated parameter aliases from PowerShell script param block
3. Remove deprecation warning messages
4. Update documentation to remove references to deprecated flags
5. Update tests to use only canonical flags

## Acceptance Criteria
- [ ] All deprecated flags are removed from bash script
- [ ] All deprecated aliases are removed from PowerShell script
- [ ] No deprecation warnings are emitted
- [ ] Documentation is updated to reflect only canonical flags
- [ ] All tests pass with canonical flags only
- [ ] CI/CD pipelines updated to use canonical flags

## Target Release
v2.0.0

## Dependencies
None

## Estimated Effort
Small - 2-3 hours