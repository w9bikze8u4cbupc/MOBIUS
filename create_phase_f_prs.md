# GitHub CLI Commands for Creating Phase F Pull Requests

## Overview
This document provides the exact GitHub CLI commands to create the pull requests for the Phase F feature and CI workflow branches.

## Prerequisites
- GitHub CLI installed and authenticated
- Both branch files available locally:
  - [phase_f_feature_pr_description.md](phase_f_feature_pr_description.md)
  - [phase_f_ci_pr_description.md](phase_f_ci_pr_description.md)

## Commands

### 1. Create Feature PR
```bash
gh pr create --title "Phase F Feature Implementation: Image Matcher and Script Workbench Integration" --body-file phase_f_feature_pr_description.md --head phase-f/preview-image-matcher --base main
```

### 2. Create CI Workflow PR
```bash
gh pr create --title "Phase F CI Workflow Implementation: Verification and Post-Deployment Jobs" --body-file phase_f_ci_pr_description.md --head ci/add-phase-f-verify-workflow --base main
```

## Notes
- These commands assume you're in the repository root directory
- The `--body-file` parameter reads the PR description from the prepared markdown files
- The `--head` parameter specifies the source branch (feature branches)
- The `--base` parameter specifies the target branch (main, since there is no staging branch)

## After Creating PRs
1. Request reviews from team members
2. Monitor CI checks for both PRs
3. Address any feedback or requested changes
4. Once approved, merge the feature PR first
5. After verifying the feature in the main branch, merge the CI workflow PR

## Related Documentation
- [PR_URLS.txt](PR_URLS.txt)
- [PHASE-F-DEPLOYMENT-PLAN.md](PHASE-F-DEPLOYMENT-PLAN.md)
- [PHASE-F-IMPLEMENTATION-SUMMARY.md](PHASE-F-IMPLEMENTATION-SUMMARY.md)