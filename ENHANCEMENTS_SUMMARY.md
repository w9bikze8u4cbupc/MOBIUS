# Enhanced Component Extraction Features

## Overview
This document summarizes the enhancements made to the component extraction system for the mobius-games-tutorial-generator project.

## Key Enhancements

### 1. "Why Kept/Why Dropped" Debug Tags
- Added verbose logging that shows exactly why each line was kept or dropped
- Each candidate line is tagged with a reason during processing
- Makes it easy to understand the extraction decisions for debugging

### 2. OCR Normalization
- Added normalization for common OCR glitches:
  - `l0rd` → `lord`
  - `L0rd` → `Lord`
  - `expl0ration` → `exploration`
  - `Expl0ration` → `Exploration`
  - `m0nster` → `monster`
  - `M0nster` → `Monster`
  - `b0ard` → `board`
  - `B0ard` → `Board`
  - Smart quotes (`'` and `"`) → ASCII quotes
  - En/em dashes → hyphens
  - `ca rd` → `card`
  - `to ken` → `token`

### 3. Additional Synonyms
- Added normalization rules for common variations:
  - `Pearl token(s)` → `Pearls`
  - `Cups (plastic)` → `Plastic cups`
  - `Board(s)` → `Game board`
  - `Location(s)` → `Location tiles`

### 4. Breakdown Reconstruction Fallback
- Added logic to identify breakdown-only lines like "65 Allies & 6 Monsters"
- These are captured in the dead letter system for potential future processing

### 5. Dead-Letter Capture
- Suspicious but excluded lines are captured for review
- Lines containing component-related terms but excluded for other reasons are logged
- Helps identify potential false negatives or edge cases

## Test Results

### Golden Test
- ✅ All 8 canonical components correctly extracted
- ✅ "Threat token" correctly excluded
- ✅ Supply items show quantity: 'supply'
- ✅ Canonical labels normalized and deduplicated
- ✅ Caption/reward/instruction lines excluded
- ✅ Parenthetical breakdowns preserved

### Negative Tests
- ✅ All negative cases correctly return empty arrays
- ✅ Threat token explicitly disallowed
- ✅ Reward text, captions, and instructions excluded

### OCR Test
- ✅ OCR normalization working correctly
- ✅ Common glitches properly converted
- ✅ Component extraction still accurate with OCR issues

## Files Modified

1. `src/api/utils.js` - Main extraction logic with all enhancements
2. `package.json` - Added new test scripts
3. `fixtures/abyss.contents.txt` - Sample data for testing
4. `test-enhanced-features.js` - New test for enhanced features

## New Test Scripts

- `npm run extract:text` - Verbose extraction with debugging info
- `npm run golden:abyss` - Run the golden test
- `npm run test:negative` - Run negative case tests

## Usage Examples

### Verbose Mode
```bash
npm run extract:text -- fixtures/abyss.contents.txt
```

This will show:
- Scoped lines (only the components section)
- Candidate line analysis with keep/drop reasons
- Final components extracted
- Dead letter capture of suspicious lines

## Benefits

1. **Improved Debugging**: The verbose mode makes it easy to understand why lines are included or excluded
2. **Better OCR Handling**: Common OCR issues are now automatically corrected
3. **Enhanced Flexibility**: Additional synonyms make the system more robust
4. **Future-Proofing**: Dead letter capture helps identify edge cases for future improvements
5. **Maintainability**: Clear logging makes it easier to maintain and extend the system