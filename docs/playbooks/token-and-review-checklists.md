# Token and Review Checklists for Phase F Rollout

## Files Created

1. **`GITHUB_TOKEN_PERMISSIONS_CHECKLIST.md`** - Comprehensive guide for creating and configuring GitHub tokens with minimal required permissions
2. **`PR_REVIEWER_CHECKLIST.md`** - Compact copy/paste checklist for PR reviewers
3. **`VERIFY_GITHUB_TOKEN.ps1`** - PowerShell script to set token and verify access
4. **`verify_github_token.sh`** - Bash script to set token and verify access

## 1. GitHub Token Permissions Checklist

The `GITHUB_TOKEN_PERMISSIONS_CHECKLIST.md` file contains detailed instructions for:

- Creating fine-grained personal access tokens with minimal permissions
- Setting up SAML/SSO authorization for organizational repositories
- Configuring classic PATs as an alternative
- Setting and testing tokens locally in both Bash and PowerShell
- Troubleshooting common 401 errors
- Best practices for token security and management

## 2. PR Reviewer Checklist

The `PR_REVIEWER_CHECKLIST.md` file contains a compact, copy/paste checklist that reviewers can use to validate Phase F PRs. It covers:

- User-visible behavior and test instructions
- File change verification
- CI and unit test validation
- Preview endpoint functionality
- Metrics registration
- Script verification
- Security checks
- Documentation updates
- Manual verification steps for Ops

## 3. Verification Scripts

Two verification scripts are provided to help set up and test GitHub token access:

### PowerShell Version (`VERIFY_GITHUB_TOKEN.ps1`)
- Interactive token input if not already set
- User and repository access verification
- Branch existence checking
- Environment variable setup

### Bash Version (`verify_github_token.sh`)
- Same functionality as PowerShell version
- Compatible with Unix-like systems
- Uses curl and jq for API interactions

## Usage Instructions

1. **For Token Setup**:
   - Review `GITHUB_TOKEN_PERMISSIONS_CHECKLIST.md` for detailed instructions
   - Run either `VERIFY_GITHUB_TOKEN.ps1` or `verify_github_token.sh` to set and verify your token

2. **For PR Reviews**:
   - Copy the checklist from `PR_REVIEWER_CHECKLIST.md`
   - Paste it as a comment on the PR
   - Tag appropriate reviewers

## Security Notes

- Never share your GitHub token with anyone
- Store tokens securely in environment variables or credential managers
- Use fine-grained tokens with minimal permissions when possible
- Regularly rotate tokens and remove unused ones
- Authorize tokens for SAML/SSO if required by your organization