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

### Tracked Source Files (Commit These)

- Application code (`src/`, `client/src/`)
- Configuration files (`package.json`, `tsconfig.json`, etc.)
- Documentation (`docs/`, `README.md`)
- Test fixtures (`data/fixtures/`, `tests/fixtures/`)
- CI/CD workflows (`.github/workflows/`)
- Infrastructure as code (`k8s/`, `systemd/`)
- Essential scripts (`scripts/`)

### Generated Artifacts (Do NOT Commit)

- **Logs:** `*.log`, `logs/`, `validation/**/logs/`
- **Build outputs:** `dist/`, `build/`, `out/`, `coverage/`
- **Data outputs:** `data/output/`, `data/exports/`, `data/previews/`
- **Database files:** `data/projects.db`, `*.db`
- **Media files:** `*.mp3`, `*.mp4`, `*.wav` (except fixtures)
- **Test PDFs:** `test-*.pdf`, generated test files
- **Caches:** `node_modules/`, `__pycache__/`, `.cache/`
- **Temporary files:** `tmp/`, `temp/`, `quarantine/`

### Review Required (Manual Decision)

- New documentation files in root
- New scripts without clear purpose
- Configuration changes
- Patch files (`.patch`)

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

#### 1. Snapshot Local State

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

#### 2. Quarantine Untracked Files

```powershell
# Dry run (see what would be moved)
.\scripts\workspace\quarantine-untracked.ps1

# Actually move files (with safety snapshot)
.\scripts\workspace\quarantine-untracked.ps1 -Confirm -SnapshotFirst
```

**What it does:**
- Identifies clearly-generated artifacts using pattern matching
- Moves them to `quarantine/artifacts/<timestamp>/`
- Preserves original directory structure
- Leaves source files and docs for manual review
- Creates manifest for restoration

#### 3. Restore from Quarantine

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

### Initial Cleanup (One-Time)

```powershell
# 1. Create safety snapshot
.\scripts\workspace\snapshot-local-state.ps1 -BackupUntracked

# 2. Review what will be quarantined (dry run)
.\scripts\workspace\quarantine-untracked.ps1

# 3. Actually quarantine artifacts
.\scripts\workspace\quarantine-untracked.ps1 -Confirm

# 4. Check git status (should be much cleaner)
git status

# 5. Review remaining untracked files manually
git ls-files --others --exclude-standard
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
