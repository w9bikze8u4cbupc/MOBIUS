# MOBIUS Workspace Hygiene Guide

**Last Updated:** 2025-01-20  
**Status:** Active Policy

## Overview

This document defines the canonical workspace structure, artifact management policy, and quarantine procedures for the MOBIUS Tutorial Generator project. Following these guidelines ensures a clean, reproducible development environment and prevents accidental commits of generated artifacts.

## Canonical Repository

**Location:** `C:\Users\danie\Documents\mobius-games-tutorial-generator`  
**Remote:** `https://github.com/w9bikze8u4cbupc/MOBIUS.git`  
**Policy:** Single source of truth for all development work

### Branch Strategy

- **main** - Production-ready code, protected
- **develop** - Integration branch for features
- **feature/** - Feature development branches
- **chore/** - Maintenance and hygiene tasks
- **test/** - Experimental branches (may contain noise)

## Artifact Classification

The triage system classifies untracked files into three buckets:

### 1. Commit-Candidates (Source/Config Files)

Files that appear to be legitimate source code or configuration:

- Application code (`src/`, `client/src/`)
- Configuration files (`package.json`, `tsconfig.json`, `postcss.config.js`, `tailwind.config.js`)
- Client source: `client/src/*.css`, `client/src/ErrorBoundary.js`, `client/public/favicon.ico`
- API endpoints: `src/api/*.js`
- UI components: `src/ui/*.jsx`
- Documentation (`docs/`, `README.md`)
- Test fixtures (`data/fixtures/`, `tests/fixtures/`)
- CI/CD workflows (`.github/workflows/`)
- Infrastructure as code (`k8s/`, `systemd/`)
- Essential scripts: `scripts/launch-mobius.bat`, `scripts/test_endpoints.ps1`

**Action:** Review and stage with `git add <file>` if appropriate.

### 2. Quarantine-Candidates (Artifacts/Logs/Scratch)

Files that are clearly generated artifacts safe to auto-quarantine:

- **Logs:** `*.log`, `logs/`, `validation/**/logs/`
- **Build outputs:** `dist/`, `build/`, `out/`, `coverage/`
- **Data outputs:** `data/output/`, `data/exports/`, `data/previews/`
- **Database files:** `data/projects.db`, `*.db`
- **Media files:** `*.mp3`, `*.mp4`, `*.wav` (except fixtures)
- **Test PDFs:** `test-*.pdf`, generated test files
- **Zip archives:** `*.zip` (logs, backups)
- **Test data:** `data/test-*.txt`
- **Ad-hoc test scripts:** `test-*.js`, `check-db.js`, `run-batch2-*.js`
- **Backup files:** `*.bak`
- **Caches:** `node_modules/`, `__pycache__/`, `.cache/`
- **Temporary files:** `tmp/`, `temp/`

**Action:** Auto-quarantine with `.\scripts\workspace\quarantine-untracked.ps1 -Confirm`

### 3. Hold-Candidates (Documentation/Notes)

Files that can remain but may clutter the workspace:

- Root-level markdown docs (status reports, planning: `PHASE-F-*.md`, `BATCH2_*.md`)
- Validation documentation: `validation/batch2/*.md`, `validation/batch2/*.json`
- Validation tracker: `validation_tracker.md`
- Phase/feature descriptions: `phase_f_*.md`

**Action:** Keep if actively used, move to `docs/` if archival, or quarantine if obsolete.

### Protected Files (Never Auto-Quarantine)

These files require manual review and will never be auto-quarantined:

- Client configuration: `client/postcss.config.js`, `client/tailwind.config.js`
- Client source: `client/src/*.css`, `client/src/ErrorBoundary.js`
- API endpoints: `src/api/*.js`
- UI components: `src/ui/*.jsx`
- Launcher scripts: `scripts/launch-mobius.bat`
- Utility scripts: `scripts/test_endpoints.ps1`, `scripts/update-desktop-shortcut-icon.ps1`
- Validation scripts: `validation/scripts/*.ps1`

## Quarantine System

**IMPORTANT: Operator Gates and Safety**

All quarantine operations require explicit confirmation to prevent accidental file moves:
- Dry-run mode is the default (safe, shows what would happen)
- Actual moves require BOTH `-Confirm` AND `-Acknowledge "I_UNDERSTAND_THIS_WILL_MOVE_FILES"`
- Snapshots are recommended before any move operation

### Required Gates

**STOP Checkpoints:**
1. ✋ **After Triage** - Review the classification report before proceeding
2. ✋ **After Dry-Run** - Verify the quarantine list is correct
3. ✋ **Before Move** - Confirm you have a snapshot and understand files will be moved
4. ✋ **Before Commit** - Review each commit-candidate file individually

**Command Trust Policy:**
- ❌ **NEVER approve** `Base: git *` or broad partial patterns
- ✅ **ONLY approve** exact full commands you understand
- ⚠️ When prompted, select "Full command" option only

## Quarantine System

The quarantine system safely moves generated artifacts out of the working tree without data loss.

### Directory Structure

```
quarantine/
├── .keep                    # Tracked placeholder (ensures directory exists in repo)
├── snapshots/               # Timestamped workspace state
│   └── YYYYMMDD_HHMMSS/
│       ├── SUMMARY.txt
│       ├── git-status.txt
│       ├── git-diff.txt
│       ├── git-diff-staged.txt
│       ├── untracked-files.txt
│       └── untracked-backup.zip (optional)
└── artifacts/               # Quarantined files
    └── YYYYMMDD_HHMMSS/
        ├── MANIFEST.txt
        └── [original directory structure]
```

### Quarantine Scripts

Located in `scripts/workspace/`:

#### 1. Triage Untracked Files (NEW)

```powershell
# Analyze and classify all untracked files
.\scripts\workspace\triage-untracked.ps1
```

**What it does:**
- Reads latest snapshot's untracked file list
- Classifies files into commit/quarantine/hold buckets
- Generates detailed report in `quarantine/reports/`
- Shows counts and file lists for each bucket

**When to use:**
- Before deciding what to commit or quarantine
- To understand what's cluttering your workspace
- After major development work to review artifacts

#### 2. Snapshot Local State

#### 2. Snapshot Local State

```powershell
# Create safety snapshot (manifest only)
.\scripts\workspace\snapshot-local-state.ps1

# Create snapshot with full backup zip
.\scripts\workspace\snapshot-local-state.ps1 -BackupUntracked
```

**When to use:**
- Before running quarantine operations
- Before major git operations (rebase, merge, reset)
- When you want to preserve current state for reference

#### 3. Quarantine Untracked Files

```powershell
# Dry run (safe, see what would be moved)
.\scripts\workspace\quarantine-untracked.ps1

# Actually move files (requires explicit acknowledgement)
.\scripts\workspace\quarantine-untracked.ps1 -Confirm -Acknowledge "I_UNDERSTAND_THIS_WILL_MOVE_FILES" -SnapshotFirst
```

**What it does:**
- Identifies clearly-generated artifacts using conservative pattern matching
- Protects source/config files from accidental quarantine
- Moves only quarantine-candidates to `quarantine/artifacts/<timestamp>/`
- Preserves original directory structure
- Leaves commit-candidates and hold-candidates for manual review
- Creates manifest for restoration

**Safety gates:**
- Requires `-Confirm` flag (not default)
- Requires `-Acknowledge "I_UNDERSTAND_THIS_WILL_MOVE_FILES"` exact token
- Shows final file list and waits for keypress before moving
- Recommended: use `-SnapshotFirst` for safety

**Protected files (never auto-quarantined):**
- Client config: `postcss.config.js`, `tailwind.config.js`
- Source files: `src/api/*.js`, `src/ui/*.jsx`, `client/src/*.css`
- Launcher scripts: `scripts/launch-mobius.bat`
- Utility scripts: `scripts/test_endpoints.ps1`

#### 4. Review Commit-Candidates (NEW)

```powershell
# Generate detailed review report for commit-candidates
.\scripts\workspace\review-commit-candidates.ps1
```

**What it does:**
- Lists all commit-candidate files with sizes and timestamps
- Shows git diff for any modified tracked files
- Previews first 10 lines of text files
- Generates suggested `git add` commands (does NOT execute)
- Saves full report to `quarantine/reports/`

**When to use:**
- Before staging any commit-candidates
- To understand what new files are being added
- To review changes before committing

#### 5. Restore from Quarantine

```powershell
# Dry run (see what would be restored)
.\scripts\workspace\restore-from-quarantine.ps1 -QuarantineSession "20250120_143000"

# Actually restore files
.\scripts\workspace\restore-from-quarantine.ps1 -QuarantineSession "20250120_143000" -Confirm
```

**When to use:**
- If you accidentally quarantined needed files
- To restore test artifacts for debugging
- To recover from overly aggressive cleanup

## Workflow: Clean Workspace

### Recommended Sequence (STOP-Gated)

This workflow has explicit STOP checkpoints to prevent accidental actions.

### Initial Cleanup (One-Time)

```powershell
# ═══════════════════════════════════════════════════════════════
# STEP 1: Create Safety Snapshot
# ═══════════════════════════════════════════════════════════════
.\scripts\workspace\snapshot-local-state.ps1 -BackupUntracked

# ✋ STOP: Verify snapshot created in quarantine/snapshots/

# ═══════════════════════════════════════════════════════════════
# STEP 2: Triage Untracked Files
# ═══════════════════════════════════════════════════════════════
.\scripts\workspace\triage-untracked.ps1

# ✋ STOP: Review the triage report
# - Check commit-candidates list (should be source/config files)
# - Check quarantine-candidates list (should be artifacts only)
# - Verify no important files are in quarantine list

# ═══════════════════════════════════════════════════════════════
# STEP 3: Dry-Run Quarantine (Safe Preview)
# ═══════════════════════════════════════════════════════════════
.\scripts\workspace\quarantine-untracked.ps1

# ✋ STOP: Review what will be moved
# - Verify list matches quarantine-candidates from triage
# - Ensure no source/config files are in the list
# - Check that protected files are NOT being moved

# ═══════════════════════════════════════════════════════════════
# STEP 4: Actually Quarantine Artifacts
# ═══════════════════════════════════════════════════════════════
# REQUIRES EXPLICIT ACKNOWLEDGEMENT:
.\scripts\workspace\quarantine-untracked.ps1 -Confirm -Acknowledge "I_UNDERSTAND_THIS_WILL_MOVE_FILES" -SnapshotFirst

# Script will:
# 1. Create another snapshot (if -SnapshotFirst used)
# 2. Show final file list
# 3. Wait for keypress confirmation
# 4. Move files to quarantine/artifacts/<timestamp>/

# ✋ STOP: Verify quarantine completed successfully
git status  # Should show fewer untracked files

# ═══════════════════════════════════════════════════════════════
# STEP 5: Review Commit-Candidates
# ═══════════════════════════════════════════════════════════════
.\scripts\workspace\review-commit-candidates.ps1

# ✋ STOP: Review the generated report
# - Read quarantine/reports/commit-candidates-review-*.txt
# - Examine each file individually
# - Verify these are files you want to commit

# Optional: Show suggested git commands
.\scripts\workspace\triage-untracked.ps1 -ShowDiffHints

# ═══════════════════════════════════════════════════════════════
# STEP 6: Stage and Commit Source Files (Separate PR)
# ═══════════════════════════════════════════════════════════════
# Review each file before staging:
git diff -- client/postcss.config.js
git diff -- src/api/assets.js
# ... etc

# Stage appropriate files:
git add client/postcss.config.js client/tailwind.config.js
git add src/api/assets.js src/api/projects.js src/api/summarize.js src/api/tts.js
git add src/ui/ErrorBoundary.jsx
# ... etc

# ✋ STOP: Review what will be committed
git status
git diff --cached

# Commit with descriptive message:
git commit -m "Add new API endpoints and client configuration"

# ═══════════════════════════════════════════════════════════════
# STEP 7: Handle Hold-Candidates (Documentation)
# ═══════════════════════════════════════════════════════════════
# Review the 54 hold-candidates (docs/notes)
# Options:
# - Keep in place if actively used
# - Move to docs/ if archival
# - Quarantine if obsolete (manually move to quarantine/)
```

### Daily Development

```powershell
# Before starting work
git status                    # Should be clean
git pull origin develop       # Stay up to date

# During development
# ... make changes ...

# Before committing
git status                    # Review changes
npm test                      # Ensure tests pass
git add <files>               # Stage only source files
git commit -m "..."           # Commit with clear message

# If workspace gets noisy
.\scripts\workspace\quarantine-untracked.ps1 -Confirm
```

### Before Pull Requests

```powershell
# 1. Ensure workspace is clean
git status

# 2. Run full test suite
npm test

# 3. Verify no generated artifacts are staged
git diff --cached --name-only

# 4. Push only if tests pass
git push origin <branch>
```

## Commit Policy

### ✅ DO Commit

- Source code changes
- Test files (not test outputs)
- Documentation updates
- Configuration changes (reviewed)
- Infrastructure as code
- Intentional fixture files

### ❌ DO NOT Commit

- Log files
- Build outputs
- Database files
- Generated media
- Test artifacts
- Temporary files
- Personal notes (unless in docs/)
- Backup files

### 🔍 Review Before Committing

- New root-level files
- New scripts
- Patch files
- Large files (>1MB)
- Binary files

## Git Status Hygiene

A clean `git status` should show:

```
On branch <branch-name>
Your branch is up to date with 'origin/<branch-name>'.

Changes not staged for commit:
  (only intentional source file modifications)

Untracked files:
  (only new source files or docs you're adding)
```

If you see dozens of untracked files, run the quarantine script.

## Troubleshooting

### "I accidentally quarantined a needed file"

```powershell
# Find the quarantine session
ls quarantine/artifacts/

# Restore from that session
.\scripts\workspace\restore-from-quarantine.ps1 -QuarantineSession "<timestamp>" -Confirm
```

### "Git status shows too many files"

```powershell
# Quarantine generated artifacts
.\scripts\workspace\quarantine-untracked.ps1 -Confirm -SnapshotFirst
```

### "I need to recover a deleted tracked file"

```powershell
# Restore from git history
git restore <file>

# Or from a specific commit
git restore --source=<commit> <file>
```

### "Quarantine script moved something it shouldn't have"

1. Check the snapshot: `quarantine/snapshots/<timestamp>/`
2. Restore the session: `.\scripts\workspace\restore-from-quarantine.ps1 -QuarantineSession "<timestamp>" -Confirm`
3. Report the pattern issue so we can fix the script

## Integration with CI/CD

The `.gitignore` rules ensure that:

- CI runs against clean source code only
- No generated artifacts pollute the repository
- Build outputs are reproducible
- Test fixtures are available but test outputs are not committed

## Maintenance

### Periodic Cleanup

```powershell
# Monthly: Clean old quarantine sessions (keep last 3)
ls quarantine/snapshots/ | Sort-Object -Descending | Select-Object -Skip 3 | Remove-Item -Recurse
ls quarantine/artifacts/ | Sort-Object -Descending | Select-Object -Skip 3 | Remove-Item -Recurse
```

### Updating Quarantine Patterns

If new artifact types appear, update `scripts/workspace/quarantine-untracked.ps1`:

1. Add pattern to `$artifactPatterns` array
2. Test with dry run: `.\scripts\workspace\quarantine-untracked.ps1`
3. Commit the script update

## References

- `.gitignore` - Defines what Git should ignore (note: `quarantine/**` ignores all contents except `.keep`)
- `scripts/workspace/` - Quarantine automation scripts
- `quarantine/` - Local artifact storage (not committed except `.keep` placeholder)

## Questions?

If you're unsure whether to commit a file:

1. Is it source code or documentation? → Commit
2. Is it generated by a build/test/run? → Do not commit
3. Is it a log or output file? → Do not commit
4. Still unsure? → Ask in team chat or leave it untracked

**Golden Rule:** When in doubt, quarantine it. You can always restore later.
