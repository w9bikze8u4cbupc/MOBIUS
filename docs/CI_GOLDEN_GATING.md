# Golden CI Gating - Verification and Maintenance

**Status:** Active Policy  
**Last Updated:** 2025-01-20  
**Applies To:** All golden test workflows (macOS, Windows, Linux)

## Current Implementation Status

**⚠️ IMPORTANT:** The golden workflows currently trigger on **any label addition** to a pull request. The `run-golden` label-specific gating described in this document represents the **intended** implementation but is not yet active.

**Current Behavior:**
- Golden workflows run when ANY label is added to a PR
- No label-specific filtering is implemented
- Cost control is limited to manual dispatch only

**Planned Behavior (Not Yet Implemented):**
- Golden workflows should only run with `run-golden` label
- Job-level `if:` conditions should check for specific label
- This document describes the target state

**Action Required:** Implement job-level gating conditions in golden workflows before relying on this documentation.

---

## Purpose

Golden workflows execute comprehensive end-to-end tests that generate reference outputs ("golden files") for regression detection. These workflows:

- Run on expensive GitHub-hosted runners (macOS, Windows)
- Execute long-running test suites (10-30 minutes per platform)
- Consume significant CI minutes from the organization quota

**Cost Control:** Golden workflows are gated to run only when explicitly requested, preventing automatic execution on every push/PR.

## Trigger Mechanisms (Planned)

**⚠️ Note:** This section describes the intended behavior. See "Current Implementation Status" above for actual behavior.

Golden workflows should run **only** under these conditions:

### 1. PR Label: `run-golden` (Not Yet Implemented)

**Intended behavior:** When a pull request is labeled with `run-golden`:
- All golden workflows execute on the PR's head commit
- Workflows run in parallel across all platforms
- Results appear in the PR's "Checks" tab

**Current behavior:** Golden workflows run when ANY label is added to a PR.

**Usage (once implemented):**
```
1. Open the pull request in GitHub UI
2. Add label: "run-golden"
3. Wait for workflows to start (usually within 30 seconds)
4. Monitor progress in the "Checks" tab
```

### 2. Manual Dispatch: `workflow_dispatch`

Maintainers can manually trigger golden workflows from the Actions tab:
```
1. Navigate to Actions → [Workflow Name]
2. Click "Run workflow"
3. Select branch/ref
4. Click "Run workflow" button
```

### 3. Current Actual Behavior

**⚠️ As of 2025-01-20:**
- Golden workflows trigger on `pull_request: types: [labeled]`
- No job-level `if:` condition filters by label name
- ANY label addition triggers golden workflows
- Manual dispatch works as documented

**To verify current behavior:**
```bash
# Check workflow triggers
grep -A 3 "^on:" .github/workflows/golden-*.yml

# Check for job-level if conditions
grep -A 2 "^jobs:" .github/workflows/golden-*.yml | grep -A 1 "if:"
```
- ❌ Push to any branch (including `main`)
- ❌ Pull request open/sync without `run-golden` label
- ❌ Scheduled/cron triggers
- ❌ Other workflow completion events

## Implementation Invariants

### Critical Rule: Job-Level Gating Only

Golden workflows use **job-level** `if:` conditions, **never** workflow-level conditions under `on:`.

**Correct Pattern:**
```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, labeled]
  workflow_dispatch:

jobs:
  golden-test:
    if: |
      github.event_name == 'workflow_dispatch' ||
      contains(github.event.pull_request.labels.*.name, 'run-golden')
    runs-on: macos-latest
    steps:
      # ... test steps
```

**Incorrect Pattern (DO NOT USE):**
```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, labeled]
    # ❌ WRONG: if conditions not supported here
    if: contains(github.event.pull_request.labels.*.name, 'run-golden')
```

**Why:** GitHub Actions does not support `if:` conditions under `on:` triggers. Attempting to use them results in:
- Workflow syntax errors
- Workflows that never run
- Silent failures with no error messages

### Workflow Structure Requirements

Each golden workflow must:

1. **Listen to PR events:**
   ```yaml
   on:
     pull_request:
       types: [opened, synchronize, reopened, labeled]
   ```

2. **Support manual dispatch:**
   ```yaml
   on:
     workflow_dispatch:
   ```

3. **Gate at job level:**
   ```yaml
   jobs:
     golden-test:
       if: |
         github.event_name == 'workflow_dispatch' ||
         contains(github.event.pull_request.labels.*.name, 'run-golden')
   ```

4. **Use appropriate runner:**
   - `macos-latest` for macOS golden tests
   - `windows-latest` for Windows golden tests
   - `ubuntu-latest` for Linux golden tests

## Verification Procedure

### Pre-Deployment Checklist

Before merging changes to golden workflows:

1. **Syntax Validation**
   ```bash
   # Validate YAML syntax
   yamllint .github/workflows/golden-*.yml
   ```

2. **Invariant Check**
   - [ ] No `if:` conditions under `on:` section
   - [ ] Job-level `if:` includes both `workflow_dispatch` and label check
   - [ ] PR event types include `labeled`
   - [ ] Correct runner specified for platform

3. **Manual Trigger Test**
   - [ ] Navigate to Actions → [Workflow]
   - [ ] Click "Run workflow"
   - [ ] Verify workflow starts and completes

### Post-Deployment Verification

After merging workflow changes, verify gating works correctly:

#### Step 1: Create Test PR

```bash
git checkout -b test/golden-gating-verification
git commit --allow-empty -m "test: verify golden gating"
git push origin test/golden-gating-verification
# Create PR via GitHub UI
```

#### Step 2: Verify No Auto-Run

1. Open the PR in GitHub UI
2. Navigate to "Checks" tab
3. **Verify:** Golden workflows do NOT appear in the checks list
4. **Expected:** Only standard CI workflows run (lint, unit tests, etc.)

#### Step 3: Add Label and Verify Trigger

1. Add label `run-golden` to the PR
2. Wait 30-60 seconds
3. Refresh the "Checks" tab
4. **Verify:** Golden workflows now appear and are running/queued
5. **Expected:** All platform-specific golden workflows start

#### Step 4: Remove Label and Verify No Re-Run

1. Remove the `run-golden` label
2. Push a new commit to the PR branch
3. **Verify:** Golden workflows do NOT run on the new commit
4. **Expected:** Only standard CI workflows run

#### Step 5: Re-Add Label and Verify Re-Run

1. Re-add the `run-golden` label
2. **Verify:** Golden workflows run on the latest commit
3. **Expected:** Fresh workflow runs appear in checks

#### Step 6: Cleanup

```bash
# Close and delete the test PR
gh pr close test/golden-gating-verification --delete-branch
```

## Common Failure Modes

### Symptom: Workflows Never Run

**Possible Causes:**
1. `if:` condition under `on:` section (syntax error)
2. Missing `labeled` event type in `pull_request` trigger
3. Incorrect label name (case-sensitive: must be `run-golden`)
4. Job-level `if:` condition syntax error

**Diagnosis:**
```bash
# Check workflow syntax
yamllint .github/workflows/golden-*.yml

# Verify label exists
gh pr view <PR_NUMBER> --json labels

# Check workflow runs
gh run list --workflow=golden-macos.yml --limit 5
```

**Fix:**
- Move `if:` from `on:` to job level
- Add `labeled` to PR event types
- Verify label name matches exactly
- Test `if:` condition syntax in a test workflow

### Symptom: Workflows Run on Every Push

**Possible Causes:**
1. Missing or incorrect job-level `if:` condition
2. `if:` condition always evaluates to true
3. Workflow triggered by events other than PR/dispatch

**Diagnosis:**
```bash
# Check recent workflow runs
gh run list --workflow=golden-macos.yml --limit 10

# Verify trigger events
grep -A 5 "^on:" .github/workflows/golden-*.yml
```

**Fix:**
- Add/correct job-level `if:` condition
- Remove unintended trigger events from `on:` section
- Test with label removal/re-add cycle

### Symptom: Workflows Run But Fail Immediately

**Possible Causes:**
1. Runner not available (macOS/Windows quota exceeded)
2. Checkout or setup steps failing
3. Missing required secrets/environment variables

**Diagnosis:**
```bash
# View workflow run logs
gh run view <RUN_ID> --log

# Check runner availability
# (GitHub UI: Settings → Actions → Runners)
```

**Fix:**
- Wait for runner availability
- Verify checkout action version
- Check required secrets are configured

## Maintenance

### Adding a New Golden Workflow

1. Copy an existing golden workflow as template
2. Update platform-specific runner and steps
3. Ensure job-level `if:` condition is present
4. Test using verification procedure above
5. Document in this file

### Modifying Existing Golden Workflows

1. Never add `if:` under `on:` section
2. Preserve job-level gating condition
3. Test changes using verification procedure
4. Update this documentation if behavior changes

### Monitoring

**Weekly Check:**
- Review golden workflow run frequency
- Verify workflows only run with label or manual dispatch
- Check for unexpected workflow runs

**Monthly Review:**
- Audit CI minute usage by workflow
- Verify cost control measures are effective
- Update documentation if patterns change

## References

- GitHub Actions: [Workflow syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- GitHub Actions: [Expressions](https://docs.github.com/en/actions/learn-github-actions/expressions)
- GitHub Actions: [Events that trigger workflows](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows)

## Approval and Sign-Off

Changes to golden workflow gating require:
- [ ] Code review by maintainer
- [ ] Successful verification procedure completion
- [ ] Documentation update (this file)
- [ ] Approval from repository owner

---

**Questions or Issues?** Open an issue with label `ci/golden-gating`.
