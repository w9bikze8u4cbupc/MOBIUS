## 1. Summary
- _Provide a concise summary of the change and its rendering impact._

## 2. Validation

### 2.1 Rendering Scope
- _Describe which games/platforms are affected._

### 2.2 Linked Issues / RFCs
- _Reference any related issues or RFC documents._

### 2.3 Local Validation (must be run before opening PR)

#### ARC Validation
- [ ] Run `node scripts/validate_arc.cjs` → Passed

#### Rendering Consistency (local platform)
- [ ] Run `node scripts/check_rendering_consistency.mjs \
  --game sushi-go \
  --platform local \
  --output-dir consistency_out` → Passed

#### Preview artifacts manually inspected?
- [ ] Yes

### 2.4 Golden Baselines

Does this PR require promoting baselines?

- [ ] No
- [ ] Yes (list platforms):

Platforms to promote:
- macos
- windows
- ubuntu

Promotion requirements acknowledged:

- [ ] SSIM ≥ soft-pass
- [ ] No visual regressions
- [ ] Rendering invariants unchanged
- [ ] Promotion will be done in follow-up commit or dedicated PR

## 3. CI and Tests

Expected CI jobs to pass before merge:

- [ ] Validate ARC
- [ ] Rendering Consistency (Windows)
- [ ] Rendering Consistency (macOS)
- [ ] Rendering Consistency (Linux)
- [ ] Audio Metrics Validation (Unix)
- [ ] Audio Metrics Validation (Windows)

## 4. Reviewer Notes

(Optional)

Anything special reviewers should look for?

## 5. Checklist for Merge

Author confirms:

- [ ] I have read `docs/ops/ARC_CHANGE_GUIDE.md`
- [ ] I have followed all required governance steps
- [ ] I understand that high-risk rendering PRs require an RFC summary

Reviewer confirms:

- [ ] Rendering risk label is correct
- [ ] ARC changes (if any) are correct and validated
- [ ] Required CI jobs are green
- [ ] Golden promotions are justified and follow policy
