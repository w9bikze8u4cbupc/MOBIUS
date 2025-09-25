# PR Review and Merge Decision Tools

This repository implements the recommended quick path for PR review and merge decisions: **options (1) + (2) + (8)**.

## Quick Start

```bash
# Run the complete workflow (recommended)
npm run pr:workflow

# Or use Node.js directly
node tools/pr-workflow.js --risk-tolerance normal
```

## Tools Overview

### 🔍 1. Focused PR Reviewer Pass

**Deliverable**: Prioritized issues list with exact file/line references

```bash
# Text output
npm run pr:review

# JSON output  
node tools/pr-reviewer.js --json
```

**Categories:**
- 🚫 **Blockers**: Must fix before merge (security, broken builds)
- ⚡ **Quick Fixes**: Easy wins (console.log cleanup, CI optimization)  
- 💡 **Suggestions**: Nice to have (documentation, test coverage)

### 📋 2. Final Merge Decision Recommendation

**Deliverable**: Merge strategy with pros/cons, timeline, and checklist

```bash
# Default (normal risk tolerance)
npm run pr:decision

# Conservative approach
node tools/merge-decision.js --risk-tolerance conservative

# Aggressive approach  
node tools/merge-decision.js --risk-tolerance aggressive
```

**Decision Types:**
- **MERGE_NOW**: High confidence, proceed immediately
- **STAGED_ROLLOUT**: Moderate confidence, gradual deployment
- **DELAY_MERGE**: Low confidence, fix issues first

### 🚀 3. GitHub CLI PR Creation Command

**Deliverable**: Exact `gh` CLI command to create PR

```bash
# Auto-detect settings
npm run pr:create

# Custom options
node tools/pr-create-command.js \
  --title "Custom PR Title" \
  --reviewers "user1,user2" \
  --labels "enhancement,bug-fix" \
  --draft
```

**Features:**
- Auto-detects repository and branch information
- Suggests labels based on branch name and analysis
- Generates PR template or uses existing templates
- Saves command to `CREATE_PR_COMMAND.txt`

## Usage Examples

### Conservative Workflow
```bash
# Thorough analysis with higher thresholds
node tools/pr-workflow.js --risk-tolerance conservative
```

### Quick Analysis
```bash
# Lower thresholds for faster iteration
node tools/pr-workflow.js --risk-tolerance aggressive --json > analysis.json
```

### Individual Tools
```bash
# Just check for blockers
npm run pr:review

# Just get merge recommendation  
npm run pr:decision

# Just generate PR command
npm run pr:create
```

## Analysis Criteria

### Code Quality Checks
- Console.log usage in production code
- Empty catch blocks (blockers)
- TODO/FIXME comments
- Large file detection

### CI/CD Analysis
- GitHub Actions workflow presence
- Missing timeout configurations  
- npm caching optimization
- Build/test job detection

### Dependencies Review
- Deprecated package detection
- Security risk assessment
- Version compatibility

### Risk Assessment
- Project structure completeness
- Documentation presence
- Change size impact

## Risk Tolerance Levels

| Level | Immediate Merge | Staged Rollout | Use Case |
|-------|----------------|----------------|----------|
| Conservative | 85+ | 75+ | Production-critical systems |
| Normal | 75+ | 60+ | Standard development workflow |
| Aggressive | 65+ | 50+ | Fast iteration, non-critical |

## Integration

### GitHub Actions
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
      - run: npm run pr:review
      - run: npm run pr:decision
```

### Package Scripts

The following scripts are available:

```json
{
  "scripts": {
    "pr:review": "node tools/pr-reviewer.js",
    "pr:decision": "node tools/merge-decision.js", 
    "pr:create": "node tools/pr-create-command.js",
    "pr:workflow": "node tools/pr-workflow.js"
  }
}
```

## Output Files

- `CREATE_PR_COMMAND.txt`: Ready-to-execute gh CLI command
- Analysis results printed to stdout (redirect with `> file.json` for storage)

## Requirements

- Node.js 14+
- Git repository
- `gh` CLI (optional, for PR creation)

## Error Handling

- Tools exit with code 1 if blockers are found
- Meaningful error messages for missing dependencies
- Fallback defaults when auto-detection fails
- JSON output available for programmatic integration

## Examples of Analysis Output

### High-Quality Codebase
```
🎯 DECISION: MERGE_NOW
📊 Score: 88/100
Strategy: immediate
→ All quality gates passed, proceed with confidence
```

### Needs Improvement  
```
🎯 DECISION: STAGED_ROLLOUT  
📊 Score: 68/100
Strategy: gradual
→ Deploy in stages with monitoring
```

### Critical Issues
```
🎯 DECISION: DELAY_MERGE
📊 Score: 45/100  
🚫 3 blockers found
→ Address critical issues before merging
```

## Support

For issues or feature requests, please use the project's issue tracker. The tools are designed to be lightweight, focused, and easily customizable for different project needs.