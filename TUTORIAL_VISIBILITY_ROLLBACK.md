# Quick Rollback Instructions

If the merge introduces a regression and you need to undo it quickly:

## Revert the merge commit from the main branch:

1. Identify the merge commit hash on main (e.g. MERGE_HASH)

2. Create a revert commit:

```bash
git checkout main
git pull origin main
git revert -m 1 MERGE_HASH
git push origin main
```

## Alternative approach using branch reset (more drastic):

```
