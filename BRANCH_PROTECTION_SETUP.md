# Branch Protection Setup

To enable branch protection for the main branch with the pre-merge validation system, use the following GitHub CLI command:

**Note**: Replace `w9bikze8u4cbupc/MOBIUS` with your actual repository owner/name, and adjust the status check name to match your workflow.

```bash
# Enable branch protection with pre-merge validation
gh api -X PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection \
  -f required_status_checks='{"strict":true,"contexts":["CI / build-and-qa (ubuntu-latest)","CI / build-and-qa (macos-latest)","CI / build-and-qa (windows-latest)"]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"dismiss_stale_reviews":false,"require_code_owner_reviews":false,"required_approving_review_count":2}' \
  -f restrictions='null'
```

## Status Check Context Names

The `contexts` array must match the exact status check names from your CI workflow. Based on the existing `ci.yml` workflow, the status checks will be named:
- `CI / build-and-qa (ubuntu-latest)`
- `CI / build-and-qa (macos-latest)` 
- `CI / build-and-qa (windows-latest)`

## Verification

After running the command, verify branch protection is enabled by visiting:
`https://github.com/w9bikze8u4cbupc/MOBIUS/settings/branches`

## Pre-merge Workflow Integration

To fully integrate with the pre-merge checklist system, consider adding a workflow that runs `scripts/premerge_run.sh`:

```yaml
name: Pre-merge Validation
on:
  pull_request:
    types: [opened, synchronize, ready_for_review]

jobs:
  premerge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: ./scripts/premerge_run.sh
      - uses: actions/upload-artifact@v4
        with:
          name: premerge-artifacts
          path: premerge_artifacts/
```

Then update the branch protection to include `"Pre-merge Validation / premerge"` in the contexts array.