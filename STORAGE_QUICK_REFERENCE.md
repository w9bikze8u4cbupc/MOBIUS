# Storage Paths - Quick Reference

## 🔒 MILESTONE STATUS: LOCKED

**Storage canonicalization is complete and authoritative.**  
Any deviation is a regression requiring explicit proposal.

## 📂 Canonical Structure

```
data/
├── db/projects.sqlite       ← Single database (MANDATORY)
├── uploads/                 ← All uploads
├── outputs/                 ← All renders
└── tmp/                     ← Temp files
```

## 🔧 Commands

```bash
# Validate storage paths (mechanical)
npm run storage:validate

# Validate coherence (MANDATORY - includes DB)
npm run storage:coherence

# Preview migration (safe, no changes)
npm run storage:migrate:dry-run

# Perform migration (copy-only)
npm run storage:migrate

# Perform cutover (LOCKS milestone)
npm run storage:cutover

# Run tests
npm test -- src/__tests__/storage.test.js
```

## 🔒 Locked Invariants

After cutover, these are **MANDATORY**:

✅ DB ↔ filesystem coherence (requires better-sqlite3)  
✅ Legacy path write blocking (hard-fail)  
✅ Artifact authority tracking (explicit)  
✅ Coherence validation (CI enforced)

## 💻 Code Usage

```javascript
// Import canonical storage functions
import { 
  getDataDirs,
  getDbPath,
  getUploadPath,
  getOutputPath 
} from './src/config/storage.mjs';

// Get all directories
const dirs = getDataDirs();
// dirs.db, dirs.uploads, dirs.outputs, dirs.tmp

// Get database path
const dbPath = getDbPath();
// → data/db/projects.sqlite

// Get upload path
const uploadPath = getUploadPath('game.pdf');
// → data/uploads/game.pdf

// Get output path
const outputPath = getOutputPath('project-123', 'video.mp4');
// → data/outputs/project-123/video.mp4
```

## 🌍 Environment Variables

```bash
# Override data root location
MOBIUS_DATA_ROOT=/custom/path/to/data
```

### DEV-ONLY Overrides (UNSUPPORTED in production)

```bash
# Skip legacy validation (DEV-ONLY)
SKIP_LEGACY_CHECK=true

# Skip legacy write blocking (DEV-ONLY)
SKIP_LEGACY_WRITE_GUARD=true
```

⚠️ **WARNING**: Using these in production is a REGRESSION.

## ⚠️ Legacy Paths (DO NOT USE)

```
❌ src/api/projects.db
❌ src/api/uploads/
❌ uploads/
❌ output/
❌ out/

✅ data/db/projects.sqlite
✅ data/uploads/
✅ data/outputs/
```

## 🚨 Troubleshooting

### "Legacy paths detected" error

```bash
# Run migration
npm run storage:migrate

# Or skip check temporarily
SKIP_LEGACY_CHECK=true npm start
```

### Database not found

```bash
# Check environment
echo $MOBIUS_DATA_ROOT

# Validate setup
npm run storage:validate
```

### Files in wrong location

```bash
# Re-run migration
npm run storage:migrate
```

## 📚 Documentation

- Full docs: `docs/storage-canonicalization.md`
- Summary: `STORAGE_CANONICALIZATION_SUMMARY.md`
- This reference: `STORAGE_QUICK_REFERENCE.md`

## ✅ Checklist for New Code

- [ ] Import from `src/config/storage.mjs`
- [ ] Use `getUploadPath()` for uploads
- [ ] Use `getOutputPath()` for renders
- [ ] Use `getDbPath()` for database
- [ ] Never hardcode paths
- [ ] Test with `npm run storage:coherence`
- [ ] Verify CI passes

## 🔒 Locked Milestone

This implementation is **COMPLETE and LOCKED**.

Any changes require:
1. Explicit proposal with justification
2. Rollback plan
3. Team approval

See `STORAGE_MILESTONE_COMPLETE.md` for details.
