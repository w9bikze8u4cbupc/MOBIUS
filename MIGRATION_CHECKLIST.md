# Storage Canonicalization - Migration Checklist

## Pre-Migration

- [ ] **Backup current data**
  ```bash
  # Create backup of entire data directory
  tar -czf mobius-data-backup-$(date +%Y%m%d).tar.gz data/ src/api/projects.db src/api/uploads/ uploads/ out/
  ```

- [ ] **Stop all running services**
  - [ ] Stop backend server
  - [ ] Stop any render workers
  - [ ] Stop any cron jobs or scheduled tasks

- [ ] **Review current state**
  ```bash
  npm run storage:validate
  ```

## Migration

- [ ] **Run dry-run migration**
  ```bash
  npm run storage:migrate:dry-run
  ```
  - [ ] Review what will be migrated
  - [ ] Verify file counts and sizes
  - [ ] Check destination paths

- [ ] **Perform actual migration**
  ```bash
  npm run storage:migrate --force
  ```
  - [ ] Verify "All data migrated successfully" message
  - [ ] Check for any errors in output

- [ ] **Verify migrated data**
  ```bash
  # Check database exists
  ls -lh data/db/projects.sqlite
  
  # Check uploads directory
  ls -lh data/uploads/ | head -20
  
  # Check outputs directory
  ls -lh data/outputs/
  ```

## Testing

- [ ] **Run validation**
  ```bash
  npm run storage:validate
  ```
  - [ ] Note: Will still show legacy paths (expected)

- [ ] **Start application with legacy check disabled**
  ```bash
  SKIP_LEGACY_CHECK=true npm start
  ```

- [ ] **Test core functionality**
  - [ ] Application starts without errors
  - [ ] Can view existing projects
  - [ ] Can upload a new file
  - [ ] Can create a new project
  - [ ] Can render a preview
  - [ ] Can access uploaded files via browser
  - [ ] Can access rendered videos via browser

- [ ] **Verify data locations**
  ```bash
  # Check that new uploads go to canonical location
  ls -lt data/uploads/ | head -5
  
  # Check that new renders go to canonical location
  ls -lt data/outputs/ | head -5
  ```

- [ ] **Run automated tests**
  ```bash
  npm test -- src/__tests__/storage.test.js
  npm test -- tests/integration/storage-integration.test.js
  ```

## Cleanup (Only After Successful Testing)

- [ ] **Document current state**
  - [ ] Take screenshots of working application
  - [ ] Note any issues encountered
  - [ ] Document any custom configurations

- [ ] **Remove legacy database files**
  ```bash
  # Windows PowerShell
  Remove-Item -Force src/api/projects.db
  Remove-Item -Force data/projects.db  # If exists
  
  # Unix/Linux/Mac
  rm -f src/api/projects.db
  rm -f data/projects.db  # If exists
  ```

- [ ] **Remove legacy upload directories**
  ```bash
  # Windows PowerShell
  Remove-Item -Recurse -Force src/api/uploads
  Remove-Item -Recurse -Force uploads
  
  # Unix/Linux/Mac
  rm -rf src/api/uploads
  rm -rf uploads
  ```

- [ ] **Remove legacy output directories**
  ```bash
  # Windows PowerShell
  Remove-Item -Recurse -Force out
  Remove-Item -Recurse -Force output
  
  # Unix/Linux/Mac
  rm -rf out
  rm -rf output
  ```

- [ ] **Verify cleanup**
  ```bash
  npm run storage:validate
  ```
  - [ ] Should show: "✅ No legacy paths detected"

## Post-Migration

- [ ] **Enable legacy path validation**
  - [ ] Remove `SKIP_LEGACY_CHECK=true` from environment
  - [ ] Restart application
  - [ ] Verify it starts without errors

- [ ] **Update deployment configuration**
  - [ ] Update Docker volumes to mount `data/` directory
  - [ ] Update CI/CD scripts to use canonical paths
  - [ ] Update backup scripts to backup `data/` directory
  - [ ] Update monitoring to check `data/` directory

- [ ] **Update team documentation**
  - [ ] Share storage canonicalization docs with team
  - [ ] Update onboarding guides
  - [ ] Update deployment runbooks
  - [ ] Update troubleshooting guides

- [ ] **Monitor for issues**
  - [ ] Check logs for path-related errors
  - [ ] Monitor disk usage in `data/` directory
  - [ ] Verify backups include `data/` directory

## Rollback Plan (If Issues Found)

If critical issues are discovered:

1. **Stop the application**
   ```bash
   # Stop all services
   ```

2. **Restore from backup**
   ```bash
   # Extract backup
   tar -xzf mobius-data-backup-YYYYMMDD.tar.gz
   ```

3. **Revert code changes** (if needed)
   ```bash
   git revert <commit-hash>
   ```

4. **Restart with old configuration**
   ```bash
   SKIP_LEGACY_CHECK=true npm start
   ```

5. **Document issues**
   - What went wrong?
   - What data was affected?
   - What needs to be fixed?

## Success Criteria

Migration is successful when:

- ✅ All data exists in canonical locations
- ✅ Application starts without errors
- ✅ All core functionality works
- ✅ Automated tests pass
- ✅ No legacy paths remain
- ✅ Validation script shows no issues
- ✅ Team is trained on new structure

## Timeline Estimate

- Pre-migration: 30 minutes
- Migration: 15 minutes
- Testing: 1-2 hours
- Cleanup: 15 minutes
- Post-migration: 30 minutes

**Total: 3-4 hours** (schedule during maintenance window)

## Support

If you encounter issues:

1. Check `docs/storage-canonicalization.md` for detailed documentation
2. Run `npm run storage:validate` to diagnose issues
3. Review `STORAGE_CANONICALIZATION_SUMMARY.md` for implementation details
4. Check `STORAGE_QUICK_REFERENCE.md` for quick answers

## Notes

- Migration is **non-destructive** - original files are preserved
- You can run migration multiple times safely
- Dry-run mode lets you preview changes without making them
- Legacy path validation can be disabled temporarily with `SKIP_LEGACY_CHECK=true`
- All changes are reversible if issues are found

## Sign-off

- [ ] Migration completed by: _________________ Date: _________
- [ ] Testing verified by: _________________ Date: _________
- [ ] Cleanup completed by: _________________ Date: _________
- [ ] Production deployment approved by: _________________ Date: _________
