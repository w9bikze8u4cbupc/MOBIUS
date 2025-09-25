# PR Review and Merge Decision Tools

This repository includes a suite of tools to implement the recommended quick path for PR review and merge decisions (options 1, 2, and 8).

## Quick Start

### Run the Complete Workflow (Recommended)

```bash
# Run all three tools in sequence
node scripts/pr-workflow.js

# With custom risk tolerance
node scripts/pr-workflow.js --risk-tolerance conservative

# Auto-create PR after analysis
node scripts/pr-workflow.js --auto-create-pr --title "Your PR Title"
```

## Individual Tools

### 1. Focused PR Reviewer Pass

**Deliverable**: Short prioritized list (blockers, quick fixes, suggestions) with exact file/line references.

```bash
# Text output
node scripts/pr-reviewer.js

# JSON output
node scripts/pr-reviewer.js --json
```

**Features:**
- Analyzes code quality, dependencies, CI/CD setup
- Categorizes issues by priority (blockers, quick fixes, suggestions)  
- Provides exact file and line references
- Exit code 1 if blockers are found

### 2. Final Merge Decision Recommendation

**Deliverable**: Recommendation (merge now vs staged rollout), pros/cons, suggested schedule, owners, gating checklist.

```bash
# Default (normal risk tolerance)
node scripts/merge-decision.js

# Conservative approach
node scripts/merge-decision.js --risk-tolerance conservative

# Aggressive approach  
node scripts/merge-decision.js --risk-tolerance aggressive

# JSON output
node scripts/merge-decision.js --json
```

**Features:**
- Analyzes code quality, test coverage, CI status, dependencies, risk factors
- Provides merge strategy recommendation (MERGE_NOW, STAGED_ROLLOUT, or DELAY_MERGE)
- Includes deployment timeline and rollback plan
- Generates approval checklist

### 3. GitHub CLI PR Creation Command

**Deliverable**: Exact `gh` CLI one-liner to create PR with proper settings.

```bash
# Auto-detect repository and branch
node scripts/create-pr-command.js

# Explicit parameters
node scripts/create-pr-command.js \
  --repo "owner/repo" \
  --head "feature-branch" \
  --base "main" \
  --title "Your PR Title" \
  --reviewers "user1,user2" \
  --labels "enhancement,bug-fix" \
  --draft
```

**Features:**
- Auto-detects repository, branch, and generates smart defaults
- Creates PR template based on existing templates or generates default
- Suggests labels based on branch name and file changes
- Saves command to `CREATE_PR_COMMAND.txt`

## Analysis Outputs

### PR Review Categories

- **🚫 Blockers**: Must fix before merge (security issues, broken builds, empty catch blocks)
- **⚡ Quick Fixes**: Easy wins (console.log cleanup, deprecated dependencies, missing caching)
- **💡 Suggestions**: Nice to have (documentation, test coverage, linting setup)

### Merge Recommendations

- **MERGE_NOW**: High confidence (score ≥ 75 for normal risk tolerance)
- **STAGED_ROLLOUT**: Moderate confidence (score 60-74, requires gradual deployment)  
- **DELAY_MERGE**: Low confidence (score < 60, address issues first)

### Risk Tolerance Levels

- **Conservative**: Higher thresholds (immediate: 85, staged: 70)
- **Normal**: Balanced thresholds (immediate: 75, staged: 60)
- **Aggressive**: Lower thresholds (immediate: 65, staged: 50)

## Integration with Package Scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "pr:review": "node scripts/pr-reviewer.js",
    "pr:decision": "node scripts/merge-decision.js",
    "pr:create": "node scripts/create-pr-command.js", 
    "pr:workflow": "node scripts/pr-workflow.js"
  }
}
```

Then run:
```bash
npm run pr:workflow
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: PR Analysis
on: pull_request

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - run: npm ci
      - name: PR Review Analysis
        run: node scripts/pr-reviewer.js --json > pr-analysis.json
      
      - name: Upload Analysis
        uses: actions/upload-artifact@v4
        with:
          name: pr-analysis
          path: pr-analysis.json
```

## Output Files

- `CREATE_PR_COMMAND.txt`: Ready-to-execute gh CLI command
- Analysis results are printed to stdout (redirect with `>` for file output)

## Dependencies

- Node.js 18+
- Git (for repository analysis)
- `gh` CLI (for PR creation, optional)

## Error Handling

- Tools provide meaningful error messages and exit codes
- Missing dependencies or configuration issues are clearly reported
- Fallback defaults when auto-detection fails

## Examples

### Conservative Merge Process
```bash
# 1. Thorough analysis with conservative settings
node scripts/pr-workflow.js --risk-tolerance conservative

# 2. Address any blockers found
# 3. Re-run analysis
# 4. Create PR when ready
```

### Quick Merge Process
```bash  
# 1. Standard analysis
node scripts/pr-workflow.js --risk-tolerance aggressive

# 2. Auto-create PR if analysis passes
node scripts/pr-workflow.js --auto-create-pr
```

## Customization

All tools support:
- JSON output for programmatic integration
- Custom parameters via CLI flags  
- Environment-specific configuration
- Integration with existing CI/CD pipelines