#!/bin/bash
# Create PR for phase-f/preview-image-matcher

gh pr create \
  --base staging \
  --head phase-f/preview-image-matcher \
  --title "Phase F: Image Matcher UI + Preview backend stub" \
  --body-file ./pr_body.md \
  --label "feature" \
  --label "phase-f" \
  --label "needs-review" \
  --label "ready-for-staging" \
  --reviewer "developer" \
  --reviewer "ops" \
  --reviewer "team-lead" \
  --assignee "developer" \
  --web