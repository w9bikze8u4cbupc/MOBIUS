# Elite Contract Trusted Commands Guide

**Version**: 1.0  
**Date**: 2026-02-23  
**Purpose**: Minimal, safe command set for Elite contract workflows without Trusted Commands friction

## Overview

This guide provides the exact commands to add to your Kiro Trusted Commands list for Elite contract work. These commands are:
- **Deterministic**: Same input → same output
- **Side-effect minimal**: Only modify intended files
- **Single-purpose**: No hidden behaviors
- **Governance-safe**: Respect append-only and canonical path invariants

## Recommended Trust Entries

Add these commands to your Trusted Commands list using **Full command** mode (not patterns):

### Elite Contract Workflows (Required)

```bash
npm run test:elite-contract
npm run elite:normalize
npm run elite:normalize:check
```

### Extended Test Workflows (Optional)

```bash
npm run test:unit
npm run test:all
npm run smoke:all
```

**Note**: Git commands are NOT required for Elite contract validation. See "Optional: Version Control Commands" section below if you choose to trust Git operations.

## Command Details

### `npm run test:elite-contract`

**Purpose**: Run Elite contract validation tests  
**Side effects**: None (read-only)  
**Duration**: ~2 seconds  
**Exit codes**:
- `0`: All 38 tests pass
- `1`: One or more tests fail

**What it does**:
- Validates contract structure (7 tests)
- Validates categories (7 tests)
- Validates rules (9 tests)
- Validates metrics, thresholds, scoring (7 tests)
- Validates schema compliance (2 tests)
- Validates determinism (4 tests)
- Validates specific rules (4 tests)

**Safe to trust**: ✅ Yes (read-only, deterministic)

---

### `npm run elite:normalize`

**Purpose**: Normalize contract formatting (sort rules, 2-space indent)  
**Side effects**: Writes to `config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json`  
**Duration**: <1 second  
**Exit codes**:
- `0`: Success

**What it does**:
- Sorts rules by ID (lexicographic order)
- Formats with 2-space indentation
- Adds trailing newline

**Idempotent**: ✅ Yes (running twice produces no changes)  
**Safe to trust**: ✅ Yes (only modifies contract JSON, deterministic)

---

### `npm run elite:normalize:check`

**Purpose**: Verify contract formatting without modifying files  
**Side effects**: None (read-only)  
**Duration**: <1 second  
**Exit codes**:
- `0`: Contract is properly formatted
- `1`: Contract formatting differs from canonical format

**What it does**:
- Loads contract JSON
- Sorts rules by ID
- Compares with file content
- Reports differences without writing

**Safe to trust**: ✅ Yes (read-only, deterministic, CI-friendly)

---

### `npm run test:unit`

**Purpose**: Run all unit tests (includes Elite contract tests)  
**Side effects**: None (read-only)  
**Duration**: ~3-5 seconds  
**Exit codes**:
- `0`: All tests pass
- `1`: One or more tests fail

**Test count**: 131 tests (38 Elite contract + 93 other unit tests)

**Safe to trust**: ✅ Yes (read-only, deterministic)

---

### `npm run test:all`

**Purpose**: Run complete test suite (smoke + unit + integration)  
**Side effects**: None (read-only)  
**Duration**: ~10-15 seconds  
**Exit codes**:
- `0`: All tests pass
- `1`: One or more tests fail

**What it runs**:
- `npm run smoke:all` (smoke checks)
- `npm run test:unit` (131 unit tests)
- `npm run test:integration` (10 integration tests)

**Safe to trust**: ✅ Yes (read-only, deterministic)

---

### `npm run smoke:all`

**Purpose**: Run all smoke checks (syntax + dry-run validation)  
**Side effects**: Creates dry-run stub files in `docs/releases/` (intentional)  
**Duration**: ~2-3 seconds  
**Exit codes**:
- `0`: All smoke checks pass
- `1`: One or more checks fail

**What it runs**:
- `npm run smoke:e2e-syntax` (syntax validation)
- `npm run smoke:prov0-01-dry` (dry-run stub generation + verification)

**Safe to trust**: ✅ Yes (deterministic, creates only stub artifacts)

---

### `git status`

**Purpose**: Show working tree status  
**Side effects**: None (read-only)  
**Duration**: <1 second  

**Safe to trust**: ✅ Yes (read-only)  
**Required for Elite validation**: ❌ No

---

### `git add -A`

**Purpose**: Stage all changes for commit  
**Side effects**: Modifies git index (staging area)  
**Duration**: <1 second  

**Safe to trust**: ⚠️ Use caution (stages all changes; prefer `git add <specific-files>` for precision)  
**Required for Elite validation**: ❌ No

---

### `git push`

**Purpose**: Push commits to remote repository  
**Side effects**: Updates remote repository  
**Duration**: Variable (network-dependent)  

**Safe to trust**: ⚠️ Use caution (publishes changes; ensure commits are reviewed first)  
**Required for Elite validation**: ❌ No

## Optional: Version Control Commands

Git commands are **NOT required** for Elite contract validation. The Elite workflow is fully functional using only npm scripts. However, if you choose to trust Git commands for convenience, here are the safest options:

### Recommended (If Trusting Git)

```bash
git status
```

**Why**: Read-only, no side effects, useful for checking working tree state.

### Use With Caution

```bash
git add -A
git push
```

**Why**: These commands modify state (staging area, remote repository). Ensure you review changes before using them.

### NOT Recommended

```bash
git commit -m "<message>"  # Message varies
git *                      # Too broad
git reset --hard           # Destructive
git clean -fd              # Destructive
```

**Why**: Variable arguments, overly broad patterns, or destructive operations.

## What NOT to Trust

### ❌ Broad Patterns

**DO NOT** add these to your trust list:

```bash
npm *
npm run *
git *
node *
```

**Why**: These patterns are overly permissive and could allow unintended commands to run without approval.

### ❌ Commands with Variable Arguments

**DO NOT** trust commands that require variable arguments:

```bash
git commit -m "<message>"  # Message varies
npm test -- <path>         # Path varies
node -e "<code>"           # Code varies
```

**Why**: Variable arguments make commands unpredictable and harder to audit.

### ❌ Destructive Commands

**DO NOT** trust commands that delete or overwrite files without explicit intent:

```bash
rm -rf *
git reset --hard
git clean -fd
```

**Why**: These commands can cause data loss.

## Trust Strategy

### Minimal Blast Radius

Trust only the **exact commands** you need for your workflow. For Elite contract work, this is:

1. `npm run test:elite-contract` (validation)
2. `npm run elite:normalize` (formatting)
3. `npm run elite:normalize:check` (CI validation)

**Git commands are NOT required for Elite validation.** Everything else is optional.

### Full Command Mode Only

Always use **Full command** mode in Trusted Commands, never pattern matching. This ensures:
- Predictable behavior
- Explicit approval
- Audit trail
- No surprises

### Review Before Trusting

Before adding a command to your trust list:
1. Run it manually once to see what it does
2. Check the script source code
3. Verify it's deterministic (same input → same output)
4. Confirm side effects are acceptable

## Development Workflow

### Typical Elite Contract Session

```bash
# 1. Edit contract
# (manual editing in IDE)

# 2. Normalize formatting
npm run elite:normalize

# 3. Validate
npm run test:elite-contract

# 4. Stage changes (optional - not required for validation)
git add -A

# 5. Commit (optional - not required for validation)
git commit -m "feat(elite): update contract rules"

# 6. Push (optional - not required for validation)
git push
```

**Trusted commands needed for validation**: 2 (`elite:normalize`, `test:elite-contract`)  
**Git commands**: Optional (not part of Elite enforcement surface)

### CI/CD Workflow (Future)

```bash
# Check formatting (non-destructive)
npm run elite:normalize:check

# Run tests
npm run test:elite-contract

# Run full suite
npm run test:all
```

**Trusted commands needed**: 3 (`elite:normalize:check`, `test:elite-contract`, `test:all`)

## Verification

### Test Normalizer Check Mode

```bash
# Should pass (contract is already normalized)
npm run elite:normalize:check

# Intentionally break formatting
# (manually edit contract JSON to add extra spaces)

# Should fail
npm run elite:normalize:check

# Fix formatting
npm run elite:normalize

# Should pass again
npm run elite:normalize:check
```

### Test Idempotency

```bash
# Run normalizer twice
npm run elite:normalize
npm run elite:normalize

# Check git status (should show no changes after second run)
git status
```

## Security Considerations

### Why These Commands Are Safe

1. **Deterministic**: Same input always produces same output
2. **Scoped**: Only modify intended files in `config/elite/`
3. **Auditable**: Source code is in repo and can be reviewed
4. **No network**: No external API calls or downloads
5. **No secrets**: No environment variables or credentials used
6. **No eval**: No dynamic code execution

### What Could Go Wrong

Even with trusted commands, be aware:
- **File overwrites**: `elite:normalize` will overwrite contract JSON (intentional)
- **Git operations**: `git push` publishes changes (ensure commits are correct first)
- **Test failures**: Tests may fail if contract is invalid (expected behavior)

### Mitigation

- Review changes with `git status` and `git diff` before committing
- Run `elite:normalize:check` before `elite:normalize` to see if changes are needed
- Use `test:elite-contract` to validate before committing
- Keep backups of important files

## Troubleshooting

### "Command not found" Error

**Issue**: `npm run elite:normalize:check` fails with "script not found"

**Solution**: Ensure you're on the correct branch with G6 changes:
```bash
git checkout chore/trustlist-elite-contract-commands
git pull
```

### Normalizer Check Fails Unexpectedly

**Issue**: `npm run elite:normalize:check` fails but contract looks correct

**Solution**: Check for invisible characters or line ending differences:
```bash
# Run normalizer to fix
npm run elite:normalize

# Verify
npm run elite:normalize:check
```

### Trust Prompt Still Appears

**Issue**: Added command to trust list but still getting prompted

**Solution**: Ensure you used **Full command** mode, not pattern matching:
- ✅ Correct: `npm run test:elite-contract`
- ❌ Incorrect: `npm run test:*`

## Summary

### Recommended Trust List (Minimal)

For Elite contract work only:
```
npm run test:elite-contract
npm run elite:normalize
npm run elite:normalize:check
```

**Git commands are NOT required for Elite validation.**

### Recommended Trust List (Extended)

For full development workflow:
```
npm run test:elite-contract
npm run elite:normalize
npm run elite:normalize:check
npm run test:unit
npm run test:all
npm run smoke:all
```

**Git commands remain optional and are not part of the Elite enforcement surface.**

### Optional: Version Control

If you choose to trust Git commands (not required):
```
git status
```

### Never Trust

```
npm *
npm run *
git *
node *
rm *
```

---

**Guide Version**: 1.0  
**Last Updated**: 2026-02-23  
**Related Docs**:
- `docs/qc/ELITE_CONTRACT_VALIDATION.md` (validation guide)
- `docs/standards/ELITE_VIDEO_STANDARD_V1.md` (standard specification)
