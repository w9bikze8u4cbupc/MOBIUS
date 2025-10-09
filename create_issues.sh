#!/bin/bash
# Create the three follow-up issues

# Preview Worker Issue
gh issue create --title "Preview Worker — render queued chapter previews (Phase F)" \
  --body-file ./preview_worker_issue.md \
  --assignee developer --label "feature" --label "phase-f"

# Asset Uploads & Hashed Storage Issue
gh issue create --title "Asset uploads & hashed storage — upload endpoint + thumbnails" \
  --body-file ./asset_uploads_issue.md \
  --assignee developer --label "feature" --label "phase-f"

# Packaging & Export Endpoint Issue
gh issue create --title "Export Packaging — create downloadable tutorial bundle (zip)" \
  --body-file ./packaging_issue.md \
  --assignee developer --label "feature" --label "phase-f" --label "packaging"