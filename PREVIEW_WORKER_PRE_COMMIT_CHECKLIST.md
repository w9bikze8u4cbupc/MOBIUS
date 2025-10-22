# Preview Worker Pre-Commit Checklist

This checklist ensures all safety measures are followed before committing changes to the Preview Worker manifests.

## 📋 Pre-Commit Validation Steps

### 1. Image Tag Replacement Verification
- [ ] Image tag has been replaced from placeholder `ghcr.io/your-org/mobius-preview-worker:latest`
- [ ] Correct image tag format: `registry/organization/image:tag`
- [ ] Only the deployment.yaml file was modified
- [ ] No other files were accidentally changed

```bash
# Verify changes
git status
git diff -- k8s/preview-worker/
```

### 2. Test Suite Execution
- [ ] Dependencies installed: `npm ci`
- [ ] Payload validation tests pass: `npm run test:preview-payloads`
- [ ] Unit tests pass: `npm test`
- [ ] Linter passes (if present): `npm run lint --if-present`

```bash
# Run all tests
npm ci
npm run test:preview-payloads
npm test
npm run lint --if-present
```

### 3. Secret Safety Check
- [ ] No secrets in git diff: `git diff --staged`
- [ ] Secret template does not contain real values
- [ ] No passwords, tokens, or keys in manifests

```bash
# Check for secrets
git diff --staged
```

### 4. Manifest Validation
- [ ] Manifests are syntactically correct
- [ ] All required fields are present
- [ ] No placeholder values remain (except in secret-example.yaml)

```bash
# Validate manifests
kubectl apply --dry-run=client -f k8s/preview-worker/
```

### 5. Cross-Platform Compatibility
- [ ] Scripts work on target platforms
- [ ] Line endings are consistent
- [ ] File permissions are appropriate

### 6. Documentation Updates
- [ ] README files updated if needed
- [ ] Comments in code are clear and accurate
- [ ] No placeholder text remains in documentation
- [ ] Documentation-only testing protocol completed:
  - [ ] Run `npm run docs:dry-run` (or equivalent automation) and attach log to PR **or**
  - [ ] File a waiver entry in the OPS1 evidence ledger with link to supporting artifacts

## 🚀 Commit and PR Preparation

### Before Committing:
- [ ] All checklist items completed
- [ ] Changes are focused and minimal
- [ ] Commit message follows convention: `chore(k8s): update preview worker image to registry/org/image:tag`

### Before Creating PR:
- [ ] Branch is up to date with main
- [ ] PR body is prepared (use PR_BODY_PREVIEW_WORKER_FINAL.md)
- [ ] GitHub CLI is installed and authenticated (or ready to use web UI)

## ⚠️ Common Pitfalls to Avoid

1. **Accidental Secret Commits**: Always check `git diff --staged` for sensitive data
2. **Incomplete Image Replacement**: Verify only the intended image tag was changed
3. **Untested Changes**: Always run the full test suite before committing
4. **Missing Manifest Validation**: Use `kubectl apply --dry-run=client` to validate syntax
5. **Cross-Platform Issues**: Test scripts on target platforms before committing

## 🛡️ Emergency Rollback Plan

If issues are discovered after commit but before merge:
```bash
# Revert the last commit
git reset --soft HEAD~1
# Or if already pushed
git revert HEAD
```

If issues are discovered after merge:
```bash
# Create a revert commit
git revert <commit-hash>
# Push the fix
git push origin main
```

## ✅ Final Verification

Before finalizing the PR:
- [ ] All tests pass locally
- [ ] Manifests validate successfully
- [ ] No secrets are staged
- [ ] Image tag is correct
- [ ] Documentation is complete
- [ ] PR body is ready

Once this checklist is complete, you're ready to create the PR.