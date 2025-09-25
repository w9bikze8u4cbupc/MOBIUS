# 🛡️ Branch Protection Setup

## Quick Command (Copy-Paste Ready)

```bash
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection -X PUT --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["build-and-qa (ubuntu-latest)", "build-and-qa (macos-latest)", "build-and-qa (windows-latest)"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true
}
EOF
```

## Alternative: Step-by-Step Commands

```bash
# Set required status checks
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection/required_status_checks -X PATCH --field strict=true --field contexts='["build-and-qa (ubuntu-latest)", "build-and-qa (macos-latest)", "build-and-qa (windows-latest)"]'

# Require PR reviews
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection/required_pull_request_reviews -X PATCH --field required_approving_review_count=1 --field dismiss_stale_reviews=true

# Block force pushes and deletions
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection -X PATCH --field allow_force_pushes=false --field allow_deletions=false
```

## Verification Command

```bash
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection | jq '.required_status_checks.contexts'
```