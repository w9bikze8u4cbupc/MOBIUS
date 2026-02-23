# API Corruption Repair Summary

**Status**: ✅ SYNTAX FIXED (Blocked by missing dependencies)  
**Date**: 2026-02-03  
**Branch**: `fix/api-index-corruption-unblock-tests`

## Executive Summary

Successfully repaired all syntax errors in `src/api/index.js` that were preventing the Express app from loading. The file now parses correctly as valid ESM. However, execution is blocked by missing npm dependencies (express, axios, etc.) that need to be installed.

## Syntax Errors Fixed

### 1. Corrupted Template String in /summarize Endpoint ✅

**Location**: Lines 1657-1690

**Problem**: Malformed `.replace()` chain with broken template literals
- Missing backticks
- Broken string interpolation (`JSON.stringify(components)∗∗GameMetadata:∗∗`)
- Unclosed parentheses
- Mixed indentation causing parser confusion

**Before** (Corrupted):
```javascript
const finalPrompt =
(resummarize && previousSummary)
? englishBasePrompt.replace(
'Here is the rulebook text:',
`Here is the rulebook text and additional context:

Components List: JSON.stringify(components)∗∗GameMetadata:∗∗JSON.stringify(components)∗∗GameMetadata:∗∗{JSON.stringify(metadata)}
Previous Summary: ${previousSummary}

Rulebook Text:        )       : englishBasePrompt           .replace(             'Here is the rulebook text:',            Here is the rulebook text and additional context:
// ... more corruption
```

**After** (Fixed):
```javascript
// Build final prompt with optional resummarize context
const finalPrompt = (resummarize && previousSummary)
  ? englishBasePrompt.replace(
      'Here is the rulebook text:',
      `Here is the rulebook text and additional context:

Components List: ${JSON.stringify(components)}
Game Metadata: ${JSON.stringify(metadata)}
Previous Summary: ${previousSummary}

Rulebook Text:`
    )
  : englishBasePrompt
      .replace(
        'Here is the rulebook text:',
        `Here is the rulebook text and additional context:

Components List: ${JSON.stringify(components)}
Game Metadata: ${JSON.stringify(metadata)}

Rulebook Text:`
      )
      .replace(
        'Component Overview:',
        `Component Overview:
    Use the provided components list: ${JSON.stringify(components)}
    Provide exact quantities and clear descriptions for each component
    Add visual cues like "[Show close-up of resource tokens]" or "[Display all cards fanned out]"
    Mention any unique or unusual pieces that distinguish this game`
      )
      .replace(
        'Setup:',
        `Setup:
    Reference the components list for accurate quantities: ${JSON.stringify(components)}
    Walk through setup step-by-step with detailed instructions (e.g., "Shuffle the 40 mission cards thoroughly, then place them face-down in the center")
    Add visual placeholders like "[Overhead shot: Initial board setup]" or "[Animation: Card placement]"
    Highlight common setup mistakes and how to avoid them`
      );
```

**Changes**:
- Fixed template literal syntax
- Proper string interpolation with `${}`
- Balanced parentheses and braces
- Consistent indentation
- Proper ternary operator structure

### 2. Typo in System Message ✅

**Location**: Line 1693

**Problem**: "YoYou" instead of "You"

**Fixed**: Changed to "You are a master boardgame educator..."

### 3. Duplicate System Message in Translation ✅

**Location**: Line 1726

**Problem**: "You are a You are a professional..."

**Fixed**: Removed duplicate "You are a"

### 4. Duplicate HephaestusService Import ✅

**Location**: Lines 3130 and 3572

**Problem**: Imported twice (once as default, once as named export)

**Fixed**: Removed first import, kept named export at line 3572

### 5. Duplicate hephaestusService Instance ✅

**Location**: Lines 3132 and 3579

**Problem**: `const hephaestusService = new HephaestusService()` declared twice

**Fixed**: Removed second declaration, kept first at line 3132

## Verification

### Syntax Check
```bash
node -e "import('./src/api/index.js').then(()=>console.log('✓ OK')).catch(e=>{console.error('✗', e.message); process.exit(1);})"
```

**Result**: ✅ File parses successfully (no SyntaxError)

**Blocked By**: Missing npm dependencies

## Blocking Issue: Missing Dependencies

### Problem

The project's `package.json` is missing runtime dependencies. Only dev dependencies are present:

**Current dependencies**:
```json
{
  "dependencies": {
    "better-sqlite3": "^9.0.0",
    "typescript": "^5.0.0"
  }
}
```

**Missing** (required by src/api/index.js):
- express
- cors
- axios
- cheerio
- openai
- pdf-to-img
- sharp
- fast-xml-parser
- fs-extra
- multer
- pdf-parse
- xml2js
- dotenv
- And many more...

### Solution Required

Someone needs to:

1. **Restore package.json dependencies** from git history or backup
2. **Or manually add** all required dependencies
3. **Run** `npm install`

### Temporary Workaround

If dependencies were previously installed but `package.json` was corrupted:

```bash
# Check if node_modules exists with packages
ls node_modules/express

# If yes, the app might run despite package.json being incomplete
# But this is not sustainable
```

## Files Modified

```
src/api/index.js  - Fixed 5 syntax/duplication errors
```

## Files Created

```
API_CORRUPTION_REPAIR_SUMMARY.md  - This document
```

## Next Steps

### Immediate (Required)

1. **Restore package.json dependencies**
   ```bash
   # Option A: Restore from git
   git checkout HEAD~10 -- package.json  # Adjust commit as needed
   
   # Option B: Check git history for last good version
   git log --oneline -- package.json
   git show <commit>:package.json
   
   # Option C: Manually add dependencies (see list below)
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Verify server starts**
   ```bash
   $env:NODE_ENV="test"
   node -e "import('./src/api/index.js').then(()=>console.log('✓ Server loads')).catch(e=>{console.error('✗', e); process.exit(1);})"
   ```

4. **Run integration tests**
   ```bash
   npm run test:integration
   ```

### Required Dependencies (Minimum)

Based on imports in `src/api/index.js`:

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12",
    "openai": "^4.20.0",
    "pdf-to-img": "^3.0.0",
    "sharp": "^0.33.0",
    "fast-xml-parser": "^4.3.0",
    "fs-extra": "^11.2.0",
    "multer": "^1.4.5-lts.1",
    "pdf-parse": "^1.1.1",
    "xml2js": "^0.6.2",
    "dotenv": "^16.3.0",
    "better-sqlite3": "^9.0.0",
    "typescript": "^5.0.0"
  }
}
```

## Testing After Fix

Once dependencies are installed:

### 1. Verify Syntax
```bash
node -e "import('./src/api/index.js').then(()=>console.log('✓ Syntax OK')).catch(console.error)"
```

### 2. Run Integration Tests
```bash
$env:NODE_ENV="test"
npm run test:integration
```

### 3. Expected Output
```
> node --test tests/integration/hephaestus-extract.node.test.mjs

✓ Test server started on http://localhost:xxxxx
✓ HEPHAESTUS Integration Tests (XXXms)
  ✓ Feature Flag Enforcement (XXms)
    ✓ should block extraction when HEPHAESTUS disabled
    ✓ should not block by feature flag when enabled
  ✓ Path Validation (XXms)
    ✓ should reject missing pdfPath
    ✓ should reject non-existent PDF
  ✓ Extraction Status (XXms)
    ✓ should return extraction status
  ✓ Import Validation (XXms)
    ✓ should validate import request
    ✓ should return imported assets
  ✓ Gate Enforcement (XXms)
  ✓ Canonical Path Enforcement (XXms)
✓ Test server stopped

ℹ tests 10
ℹ suites 6
ℹ pass 10
```

## Locked Invariants Maintained

All repairs maintained existing behavior:

- ✅ Gate enforcement unchanged (/summarize still uses enforceGates)
- ✅ Script authority model intact (append-only candidates)
- ✅ Storage canonicalization preserved
- ✅ No new dependencies added
- ✅ Export surface unchanged (app, startServer)
- ✅ Conditional auto-start preserved (not in tests)

## Root Cause Analysis

### How Did This Happen?

The corruption appears to be from a failed string replacement or copy-paste operation that:
1. Broke template literal syntax
2. Introduced Unicode characters (`∗∗` instead of `**`)
3. Left unclosed parentheses
4. Mixed up indentation

### Prevention

- Use version control checkpoints before major edits
- Run syntax checks after edits: `node -c file.js` (for CommonJS) or import test (for ESM)
- Use linters (ESLint) to catch syntax errors early
- Test server startup after API changes

## References

- [Node Test Runner Migration](NODE_TEST_RUNNER_MIGRATION_SUMMARY.md)
- [HEPHAESTUS Integration](HEPHAESTUS_EXTERNAL_WORKSPACE.md)
- [Script Authority Model](docs/script-authority.md)
- [Gate Enforcement](docs/ingestion-truth-gates.md)

## Approval

**Status**: ✅ SYNTAX FIXED  
**Blocked By**: Missing package.json dependencies  
**Next Action**: Restore dependencies, install, test

---

**Repair Complete**: All syntax errors fixed. Ready to run once dependencies are installed.
