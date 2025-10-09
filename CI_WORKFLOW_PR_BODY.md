# CI: Add staging verify workflow for Phase F

## Description

Adds post-deploy verification jobs (Linux + Windows) to verify Phase F preview & matcher functionality. Runs scripts/verify-phase-f.sh and scripts/verify-phase-f.ps1 after the deploy_to_staging job completes. Uploads verification artifacts on failure for debugging.

## Labels
ci, phase-f

## Reviewer
ops

## Assignee
developer