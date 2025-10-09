#!/bin/bash
# Script to output the exact gh command with placeholders for reviewer handles
# Replace REPLACE_HANDLE_X with actual GitHub handles before running

echo "gh pr create --base staging --head phase-f/preview-image-matcher \\"
echo "  --title \"Phase F: Image Matcher UI + Preview backend stub\" \\"
echo "  --body-file ./pr_body.md \\"
echo "  --label feature --label phase-f --label needs-review --label ready-for-staging \\"
echo "  --reviewer REPLACE_HANDLE_1 \\"
echo "  --reviewer REPLACE_HANDLE_2 \\"
echo "  --assignee REPLACE_HANDLE_3"