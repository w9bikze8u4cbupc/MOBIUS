# G6 — Elite Contract Trusted Commands Complete

**Date**: 2026-02-23  
**Branch**: `chore/trustlist-elite-contract-commands`  
**Status**: ✅ Complete

## Summary

Eliminated Trusted Commands friction for Elite contract workflows by providing a minimal, safe command set with check mode support. Users can now add specific commands to their trust list without resorting to overly-broad patterns like `npm *` or `git *`.

## Changes Implemented

### 1. Normalizer Check Mode

**File**: `scripts/elite/normalize-contract.mjs`

Enhanced normalizer with `--check` flag:
- **Check mode**: Validates formatting without modifying files (CI-friendly)
- **Write mode**: Normalizes formatting (existing behavior)
- **Exit codes**: 0 = properly formatted, 1 = formatting differs

**Usage**:
```bash
# Check formatting (read-only)
npm run elite:normalize:check

# Fix formatting (writes file)
npm run elite:normalize
```

**Benefits**:
- Non-destructive validation for CI pipelines
- Deterministic exit codes for automation
- Clear error messages with fix instructions

### 2. New NPM Script

**File**: `package.json`

Added `elite:normalize:check` script:
```json
"elite:normalize:check": "node scripts/elite/normalize-contract.mjs --check"
```

### 3. Trusted Commands Documentation

**File**: `docs/qc/ELITE_CONTRACT_TRUSTED_COMMANDS.md`

Comprehensive guide covering:
- **Recommended trust entries** (Full command mode only)
- **Command details** (purpose, side effects, duration, exit codes)
- **What NOT to trust** (broad patterns, variable arguments, destructive commands)
- **Trust strategy** (minimal blast radius, full command mode only)
- **Development workflow** (typical session, CI/CD workflow)
- **Verification procedures** (test check mode, test idempotency)
- **Security considerations** (why commands are safe, what could go wrong)
- **Troubleshooting** (common issues and solutions)

### 4. Updated Validation Guide

**File**: `docs/qc/ELITE_CONTRACT_VALIDATION.md`

Added:
- Check mode documentation
- Reference to Trusted Commands guide
- CI-friendly workflow recommendations

## Recommended Trust List

### Minimal (Elite Contract Only)

```bash
npm run test:elite-contract
npm run elite:normalize
npm run elite:normalize:check
```

**Note**: Git commands are NOT required for Elite contract validation.

### Extended (Full Development)

```bash
npm run test:elite-contract
npm run elite:normalize
npm run elite:normalize:check
npm run test:unit
npm run test:all
npm run smoke:all
```

**Note**: Git commands remain optional and are not part of the Elite enforcement surface.

### Optional: Version Control

If you choose to trust Git commands (not required for Elite validation):
```bash
git status
```

### Never Trust

```bash
npm *
npm run *
git *
node *
rm *
```

## Validation Results

### Check Mode Tests

**Test 1: Properly formatted contract**
```bash
npm run elite:normalize:check
```
**Result**: ✅ Exit 0 (contract is properly formatted)

**Test 2: Broken formatting (4-space indent)**
```bash
# Intentionally break formatting
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json','utf8'));fs.writeFileSync('config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json',JSON.stringify(c,null,4),'utf8');"

# Check formatting
npm run elite:normalize:check
```
**Result**: ✅ Exit 1 (formatting differs, clear error message)

**Test 3: Fix formatting**
```bash
npm run elite:normalize
npm run elite:normalize:check
```
**Result**: ✅ Exit 0 (formatting restored)

### Idempotency Test

```bash
npm run elite:normalize
npm run elite:normalize
git status
```
**Result**: ✅ No changes after second run (idempotent)

### Elite Contract Tests

```bash
npm run test:elite-contract
```
**Result**: ✅ 38/38 tests passing (0.95s)

### Unit Test Suite

```bash
npm run test:unit
```
**Result**: ✅ 131 tests passing (includes Elite contract tests)

## Files Modified

### New Files
- `docs/qc/ELITE_CONTRACT_TRUSTED_COMMANDS.md` — Trusted commands guide

### Modified Files
- `scripts/elite/normalize-contract.mjs` — Added `--check` mode support
- `package.json` — Added `elite:normalize:check` script
- `docs/qc/ELITE_CONTRACT_VALIDATION.md` — Added check mode docs and trust guide reference

## Command Details

### `npm run elite:normalize:check`

**Purpose**: Verify contract formatting without modifying files  
**Side effects**: None (read-only)  
**Duration**: <1 second  
**Exit codes**:
- `0`: Contract is properly formatted
- `1`: Contract formatting differs from canonical format

**Safe to trust**: ✅ Yes (read-only, deterministic, CI-friendly)

### `npm run elite:normalize`

**Purpose**: Normalize contract formatting (sort rules, 2-space indent)  
**Side effects**: Writes to `config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json`  
**Duration**: <1 second  
**Exit codes**: `0` = success

**Idempotent**: ✅ Yes (running twice produces no changes)  
**Safe to trust**: ✅ Yes (only modifies contract JSON, deterministic)

### `npm run test:elite-contract`

**Purpose**: Run Elite contract validation tests  
**Side effects**: None (read-only)  
**Duration**: ~1 second  
**Exit codes**: `0` = all tests pass, `1` = one or more tests fail

**Safe to trust**: ✅ Yes (read-only, deterministic)

## Security Considerations

### Why These Commands Are Safe

1. **Deterministic**: Same input always produces same output
2. **Scoped**: Only modify intended files in `config/elite/`
3. **Auditable**: Source code is in repo and can be reviewed
4. **No network**: No external API calls or downloads
5. **No secrets**: No environment variables or credentials used
6. **No eval**: No dynamic code execution

### Trust Strategy

- **Full command mode only**: Never use pattern matching (`npm *`, `git *`)
- **Minimal blast radius**: Trust only exact commands needed
- **Review before trusting**: Run manually once, check source code, verify determinism
- **Prefer read-only**: Prioritize commands with no side effects

## Development Workflow

### Before Committing Contract Changes

1. Edit contract: `config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json`
2. Check formatting: `npm run elite:normalize:check`
3. Fix if needed: `npm run elite:normalize`
4. Validate: `npm run test:elite-contract`
5. Commit changes

### CI/CD Workflow (Future)

```bash
# Check formatting (non-destructive)
npm run elite:normalize:check

# Run tests
npm run test:elite-contract

# Run full suite
npm run test:all
```

## Acceptance Criteria

✅ New doc exists at `docs/qc/ELITE_CONTRACT_TRUSTED_COMMANDS.md`  
✅ Lists exact Full command strings to trust  
✅ Explicitly warns against broad patterns  
✅ All Elite workflows use dedicated npm scripts (no ad-hoc CLI args)  
✅ Normalizer supports `--check` mode  
✅ `elite:normalize:check` script added to package.json  
✅ Check mode deterministic behavior verified  
✅ Idempotency verified  
✅ All tests passing  

## Next Steps

This task is complete. Users can now:
1. Add specific commands to Kiro Trusted Commands list (Full command mode)
2. Use `elite:normalize:check` in CI pipelines for formatting enforcement
3. Work with Elite contract without approval prompts

Future work:
- **G7**: Implement Elite verifier script (`verify-pro-video-elite.mjs`)
- **G8**: Implement Elite scoring computation
- **G9**: Add CI gating on Elite score

## Notes

- No new dependencies added (standard library only)
- Governance invariants remain untouched
- Changes are surgical and focused on UX improvement
- All existing tests remain green
- Check mode is CI-ready (non-destructive, deterministic exit codes)

---

**Task**: G6 — Eliminate Trusted Commands friction  
**Completed**: 2026-02-23  
**Commands Added**: 1 (`elite:normalize:check`)  
**Documentation**: 1 new guide, 1 updated guide  
**Status**: ✅ Ready for commit
