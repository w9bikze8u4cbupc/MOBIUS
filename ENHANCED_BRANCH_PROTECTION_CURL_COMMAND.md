# Enhanced Branch Protection cURL Command

Use this command to set up enhanced branch protection for the main branch with additional security features.

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
      "required_approving_review_count": 1,
      "dismiss_stale_reviews": true,
      "require_code_owner_reviews": true,
      "required_approving_review_count": 1
    },
    "restrictions": null,
    "required_linear_history": true,
    "allow_force_pushes": false,
    "allow_deletions": false,
    "block_creations": false,
    "required_conversation_resolution": true
  }'
```

## Enhanced Security Features

1. **dismiss_stale_reviews**: Dismiss approved reviews when new commits are pushed
2. **require_code_owner_reviews**: Require review approval from code owners
3. **required_linear_history**: Prevent merge commits and require linear history
4. **allow_force_pushes**: Disabled to prevent accidental history overwrites
5. **allow_deletions**: Disabled to prevent branch deletion
6. **required_conversation_resolution**: Require all conversations to be resolved before merging

## Instructions

1. Replace `YOUR_GITHUB_TOKEN` with your actual GitHub personal access token
2. Run this command from your terminal
3. The command will apply all the enhanced protection rules to the main branch

## Notes

- Make sure your GitHub token has the necessary permissions (repo:admin or equivalent)
- The status check names must match exactly what appears in your GitHub Actions runs
- You may need to adjust the status check names after the first CI run if they appear differently
- Some of these settings may require organization-level permissions to apply
