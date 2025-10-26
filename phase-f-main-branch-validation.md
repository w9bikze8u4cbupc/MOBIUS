# Phase F Main Branch Validation Checklist

## Overview
This checklist ensures proper validation of Phase F features after merging to the main branch.

## Pre-Merge Validation (Before Merging PRs)

### Feature PR (#167)
- [ ] All reviewers approved
- [ ] All CI checks passed
- [ ] No outstanding feedback
- [ ] Merge ready

### CI Workflow PR (#168)
- [ ] All reviewers approved
- [ ] All CI checks passed
- [ ] No outstanding feedback
- [ ] Merge ready

## Post-Merge Validation (After Merging to Main)

### Feature Validation
- [ ] Pull latest main branch
- [ ] Verify ImageMatcher component loads
- [ ] Test drag-and-drop functionality
- [ ] Confirm Script Workbench integration
- [ ] Validate UI responsiveness
- [ ] Check error handling
- [ ] Verify asset matching persistence

### CI Workflow Validation
- [ ] Trigger main branch workflow
- [ ] Verify verify_phase_f job appears
- [ ] Confirm Bash script execution
- [ ] Confirm PowerShell script execution
- [ ] Test artifact upload on failure
- [ ] Validate job completion status
- [ ] Check logs for errors

## Validation Test Cases

### ImageMatcher Component
1. [ ] Component renders without errors
2. [ ] Image library displays placeholder images
3. [ ] Drag-and-drop works between library and steps
4. [ ] Images can be removed from steps
5. [ ] State persists during session
6. [ ] Component handles empty states gracefully

### Script Workbench Integration
1. [ ] ImageMatcher appears in workbench layout
2. [ ] Component receives proper props
3. [ ] Asset matches are stored in state
4. [ ] Integration works with existing editor features
5. [ ] Undo/redo works with image matching actions

### CI Verification Jobs
1. [ ] Job triggers on main branch push
2. [ ] All verification tests execute
3. [ ] Results are properly reported
4. [ ] Artifacts are uploaded on failure
5. [ ] Job handles API unavailability gracefully
6. [ ] Metrics are collected and reported

## Validation Environment
- **Branch**: main
- **Environment**: [Specify after merge]
- **Test Data**: [Specify after merge]

## Validation Results
| Test Case | Result | Notes | Date |
|-----------|--------|-------|------|
|           |        |       |      |

## Issues Tracking
| Issue | Severity | Status | Resolution |
|-------|----------|--------|------------|
|       |          |        |            |

## Next Steps After Validation
- [ ] Document validation results
- [ ] Address any issues found
- [ ] Prepare for production deployment
- [ ] Update stakeholders on status

## Related Documentation
- [PHASE-F-DEPLOYMENT-CHECKLIST.md](PHASE-F-DEPLOYMENT-CHECKLIST.md)
- [PHASE-F-IMPLEMENTATION-SUMMARY.md](PHASE-F-IMPLEMENTATION-SUMMARY.md)
- [GITHUB_WORKFLOW_RUN_RESULTS.md](GITHUB_WORKFLOW_RUN_RESULTS.md)

## PR Links
- Feature PR: [#167](https://github.com/w9bikze8u4cbupc/MOBIUS/pull/167)
- CI Workflow PR: [#168](https://github.com/w9bikze8u4cbupc/MOBIUS/pull/168)