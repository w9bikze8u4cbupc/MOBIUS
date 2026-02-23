# G5 — ProV1 Elite Contract Hardening Complete

**Date**: 2026-02-23  
**Branch**: `chore/prov1-elite-contract-hardening`  
**Status**: ✅ Complete

## Summary

Hardened the ProV1 Elite contract workflow with Jest discoverability, trustlist-safe test commands, and contract invariant enforcement. The Elite contract tests are now reliably discoverable, deterministic, and integrated into the standard test suite.

## Changes Implemented

### 1. Dedicated Test Script

**File**: `package.json`

Added `test:elite-contract` script:
```json
"test:elite-contract": "node --experimental-vm-modules node_modules/jest/bin/jest.js eliteStandardContract"
```

**Benefits**:
- No path ambiguity or "No tests found" errors
- Works reliably on Windows without trust prompts
- Uses name-based matching instead of full paths
- Integrates with existing Jest configuration

### 2. Enhanced Determinism Tests

**File**: `src/__tests__/eliteStandardContract.test.js`

Added 2 new tests (36 → 38 total):
- **2-space indentation formatting**: Validates contract JSON uses consistent 2-space indentation
- **Strict lexicographic ordering**: Ensures rules are sorted by ID using `localeCompare()`

**Test Coverage**:
- Contract Structure: 7 tests
- Categories: 7 tests
- Rules: 9 tests
- Metrics: 1 test
- Thresholds: 2 tests
- Scoring: 4 tests
- Schema Compliance: 2 tests
- Determinism: 4 tests (including 2 new)
- Specific Rules: 4 tests

### 3. Contract Normalizer Script

**File**: `scripts/elite/normalize-contract.mjs`

Created normalizer that:
- Sorts rules by ID (lexicographic order)
- Formats with 2-space indentation
- Adds trailing newline

**Usage**:
```bash
npm run elite:normalize
```

**Replaces**: Manual `node -e` one-liners for sorting

### 4. Validation Documentation

**File**: `docs/qc/ELITE_CONTRACT_VALIDATION.md`

Comprehensive guide covering:
- Quick start commands
- What gets validated (38 tests)
- Contract normalization workflow
- Integration with test suite
- Common issues and solutions
- Development workflow
- File references
- NPM scripts reference

## Validation Results

### Elite Contract Tests
```bash
npm run test:elite-contract
```

**Result**: ✅ 38/38 tests passing (1.876s)

### Unit Test Suite
```bash
npm run test:unit
```

**Result**: ✅ 131 tests passing (includes Elite contract tests)

### Integration Tests
```bash
npm run test:integration
```

**Result**: ✅ 10 tests passing

### Smoke Tests
```bash
npm run smoke:all
```

**Result**: ✅ All smoke checks passing

## Files Modified

### New Files
- `scripts/elite/normalize-contract.mjs` — Contract normalizer
- `docs/qc/ELITE_CONTRACT_VALIDATION.md` — Validation guide

### Modified Files
- `package.json` — Added `test:elite-contract` and `elite:normalize` scripts
- `src/__tests__/eliteStandardContract.test.js` — Added 2 determinism tests (38 total)
- `config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json` — Normalized (sorted, formatted)

## NPM Scripts Added

```bash
# Run Elite contract tests only
npm run test:elite-contract

# Normalize contract formatting
npm run elite:normalize
```

## Acceptance Criteria

✅ `npm run test:elite-contract` exists and runs reliably on Windows  
✅ Elite contract tests discoverable by default `npm run test:unit`  
✅ No manual `node -e` sorting steps needed  
✅ Ordering regressions cause failing unit tests  
✅ Contract determinism enforced by tests  
✅ Documentation provided for validation workflow  

## Development Workflow

### Before Committing Contract Changes

1. Edit contract: `config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json`
2. Normalize: `npm run elite:normalize`
3. Validate: `npm run test:elite-contract`
4. Commit if tests pass

### Adding New Rules

1. Add rule to `rules` array
2. Ensure unique ID, valid category, complete structure
3. Update category points to maintain sum = category weight
4. Run normalizer to sort rules
5. Run tests to validate

## Next Steps

This task is complete. Future work:
- **G6**: Implement Elite verifier script (`verify-pro-video-elite.mjs`)
- **G7**: Implement Elite scoring computation
- **G8**: Add CI gating on Elite score

## Notes

- No new dependencies added (standard library only)
- Governance invariants remain untouched
- Changes are surgical and focused on test/dev experience
- All existing tests remain green
- Contract content unchanged (only formatting/ordering)

---

**Task**: G5 — Harden ProV1 Elite contract workflow  
**Completed**: 2026-02-23  
**Test Count**: 38 Elite contract tests, 131 total unit tests  
**Status**: ✅ Ready for commit
