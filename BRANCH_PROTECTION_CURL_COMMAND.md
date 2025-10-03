# Branch Protection cURL Command

Use this command to set up branch protection for the main branch. This requires a GitHub personal access token with appropriate permissions.

```bash
curl -X PUT \
  -H "Authorization: token YOUR_GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/w9bikze8u4cbupc/mobius-games-tutorial-generator/branches/main/protection \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": [
        "tutorial-visibility-ci (node 20.x)",
        "tutorial-visibility-ci (node 18.x)"
      ]
    },
    "enforce_admins": true,
    "required_pull_request_reviews": {
      "required_approving_review_count": 1
    },
    "restrictions": null
  }'
```

## Instructions

1. Replace `YOUR_GITHUB_TOKEN` with your actual GitHub personal access token
2. Run this command from your terminal
3. The command will:
   - Require status checks to pass before merging
   - Enforce the rules for administrators as well
   - Require at least 1 approving review before merging
   - Apply to the main branch

## Notes

- Make sure your GitHub token has the necessary permissions (repo:admin or equivalent)
- The status check names must match exactly what appears in your GitHub Actions runs
- You may need to adjust the status check names after the first CI run if they appear differently
