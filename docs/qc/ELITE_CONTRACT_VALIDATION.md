# Elite Contract Validation Guide

**Version**: 1.0  
**Date**: 2026-02-23

## Overview

The ProV1 Elite Video Standard contract (`config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json`) is the authoritative, machine-enforceable quality specification. This guide explains how to validate the contract locally.

## Quick Start

### Run Elite Contract Tests

```bash
npm run test:elite-contract
```

**Expected Output**:
```
Test Suites: 1 passed, 1 total
Tests:       38 passed, 38 total
```

**Duration**: ~1-2 seconds

## What Gets Validated

### Contract Structure (7 tests)
- Required top-level fields present
- Contract ID and version format
- Elite threshold = 900
- Score total = 1000
- Severity order correct

### Categories (7 tests)
- Array structure valid
- Required fields present
- Unique IDs
- ID pattern matching
- Weights sum to 1000
- Expected categories present

### Rules (9 tests)
- Array structure valid
- Required fields present
- Unique IDs
- ID pattern matching ([A-Z]\\d+)
- Sorted by ID
- Valid category references
- Valid severities
- Blocking behavior correct

### Metrics (1 test)
- Required metric fields present

### Thresholds (2 tests)
- Required threshold fields present
- Valid operators

### Scoring (4 tests)
- Required scoring fields present
- Non-negative points
- Total points sum to 1000
- Per-category points match weights

### Schema Compliance (2 tests)
- Contract structure matches schema
- No unexpected properties

### Determinism (4 tests)
- Serialization/parsing identity
- Stable rule ordering
- 2-space indentation
- Strict lexicographic order

### Specific Rules (4 tests)
- A1 (Loudness) structure
- V1 (Resolution) structure
- S1 (Segment Order) sequence
- Trust rules all HARD_FAIL

## Contract Normalization

If you modify the contract JSON manually, normalize it to ensure deterministic formatting:

```bash
npm run elite:normalize
```

**What it does**:
- Sorts rules by ID (lexicographic order)
- Formats with 2-space indentation
- Adds trailing newline

**When to use**:
- After manually editing contract JSON
- Before committing contract changes
- To fix formatting inconsistencies

### Check Mode (Non-Destructive)

Verify formatting without modifying files:

```bash
npm run elite:normalize:check
```

**Exit codes**:
- `0`: Contract is properly formatted
- `1`: Contract formatting differs from canonical format

**Use in CI**: This command is ideal for CI pipelines to enforce formatting without modifying files.

## Integration with Test Suite

The Elite contract tests are automatically included in:

```bash
# Run all unit tests (includes Elite contract)
npm run test:unit

# Run full test suite (smoke + unit + integration)
npm run test:all
```

## Continuous Integration

The Elite contract tests run automatically in CI as part of the unit test suite. Any contract violations will fail the build.

## Common Issues

### "No tests found"

**Issue**: Running tests with full path fails

**Solution**: Use the dedicated script:
```bash
# ✅ Correct
npm run test:elite-contract

# ❌ Incorrect (may fail on Windows)
npm test -- tests/elite/elite-standard-contract.test.js
```

### Rules not sorted

**Issue**: Test fails with "rules maintain stable ordering"

**Solution**: Run normalizer:
```bash
npm run elite:normalize
npm run test:elite-contract
```

### Weights don't sum to 1000

**Issue**: Test fails with "category weights sum to 1000" or "total rule points sum to 1000"

**Solution**: Check your math:
```javascript
// Category weights must sum to 1000
audio: 200 + visual: 150 + pedagogy: 200 + retention: 150 + 
chapters: 100 + accessibility: 100 + trust: 100 = 1000

// Rule points within each category must sum to category weight
// Example for audio (200 points):
A1: 60 + A2: 50 + A3: 50 + A4: 20 + A5: 20 = 200
```

### Formatting issues

**Issue**: Test fails with "contract JSON is formatted with 2-space indentation"

**Solution**: Run normalizer:
```bash
npm run elite:normalize
```

## Development Workflow

### Before Committing Contract Changes

1. **Edit contract**: Modify `config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json`
2. **Normalize**: `npm run elite:normalize`
3. **Validate**: `npm run test:elite-contract`
4. **Commit**: If tests pass, commit changes

### Adding New Rules

1. Add rule to `rules` array in contract JSON
2. Ensure rule has:
   - Unique ID matching pattern [A-Z]\\d+
   - Valid category_id
   - Valid severity (HARD_FAIL or SOFT_WARN)
   - Complete metric, threshold, and scoring objects
3. Update category points to maintain sum = category weight
4. Run normalizer to sort rules
5. Run tests to validate

### Modifying Scoring

1. Update rule `scoring.points` values
2. Ensure per-category sums still match category weights
3. Ensure total still sums to 1000
4. Run tests to validate

## Files

### Contract
- **Contract JSON**: `config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json`
- **Schema**: `config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.schema.json`

### Tests
- **Test File**: `src/__tests__/eliteStandardContract.test.js`
- **Test Count**: 38 tests

### Scripts
- **Normalizer**: `scripts/elite/normalize-contract.mjs`

### Documentation
- **Standard Spec**: `docs/standards/ELITE_VIDEO_STANDARD_V1.md`
- **This Guide**: `docs/qc/ELITE_CONTRACT_VALIDATION.md`

## NPM Scripts

```bash
# Run Elite contract tests only
npm run test:elite-contract

# Normalize contract formatting (writes file)
npm run elite:normalize

# Check contract formatting (read-only, CI-friendly)
npm run elite:normalize:check

# Run all unit tests (includes Elite contract)
npm run test:unit

# Run full test suite
npm run test:all
```

## Trusted Commands

For information on adding these commands to your Kiro Trusted Commands list to eliminate approval prompts, see:

**[Elite Contract Trusted Commands Guide](./ELITE_CONTRACT_TRUSTED_COMMANDS.md)**

This guide provides:
- Exact commands to trust (Full command mode)
- Security considerations
- What NOT to trust
- Verification procedures

## Exit Codes

- **0**: All tests passed
- **1**: One or more tests failed

## Support

For issues with Elite contract validation:
1. Check this guide for common issues
2. Run normalizer: `npm run elite:normalize`
3. Verify contract structure against schema
4. Check test output for specific failures

---

**Guide Version**: 1.0  
**Last Updated**: 2026-02-23
