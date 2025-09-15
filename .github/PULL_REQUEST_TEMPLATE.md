# Mobius Tutorial Generator — Production Readiness

## Scope
- Game(s): …
- Locales: …
- Changes: Assets | Rendering | Audio | Captions | Logic | Docs (select all)
- CI Matrix Target: Ubuntu | macOS | Windows (all three required unless exempted)

## Golden Harness Status (CI)
- Link to PR Checks tab: …
- Artifacts: JUnit XML, visual diff PNGs (if failures), container.json per OS
- Baselines updated? Yes/No (If visuals intentionally changed, run approval workflow and commit)

## Manual Review (required)
- [ ] [UAT-01] Watch-through review (clarity, pacing, correctness) approved by SME
- [ ] [UAT-02] Accessibility review (captions accuracy, contrast, no flashing)
- [ ] [BRAND] Branding matches style guide (logos, colors, typography)
- [ ] [CFG-04] Licenses/attribution reviewed for fonts/images/VO/SFX/BGM
- [ ] [REL-03] Product/SME sign-off recorded (game variation + locale)

## Notes for Reviewers
- Summary of intent/changes:
- Known non-functional diffs (if any):
- Approval workflow runs (if used): link(s)

```
## Automated Per-OS Video Validation (Mobius)

Automated per-OS video validation now green across Windows, macOS, and Linux with SSIM ≥ 0.95. Enforced SSIM_MIN in CI, deterministic extraction (fps=30, SAR=1:1, yuv420p), Ajv schema validation for container.json, and ffprobe cross-checks. Per-OS goldens are default with safe, interactive promotion. CI matrix uses pinned toolchains, uploads artifacts/JUnit per matrix, and includes platform resolution in logs for fast triage.

### Summary of Changes

- [x] SSIM ≥ 0.95 validation across all platforms
- [x] Per-OS goldens with safe promotion
- [x] Deterministic frame extraction (fps=30, SAR=1:1, yuv420p)
- [x] Container.json validation with Ajv schema
- [x] ffprobe vs container.json cross-checks
- [x] 3-OS CI matrix with pinned toolchains
- [x] JUnit reporting and artifact upload per matrix
- [x] Platform resolution in logs for fast triage

### Validation Checklist

- [ ] All platforms green (Windows, macOS, Linux)
- [ ] SSIM ≥ 0.95 on all platforms
- [ ] Per-OS goldens used (no cross-platform copying)
- [ ] Container.json validation passes
- [ ] ffprobe vs container.json consistency check passes
- [ ] JUnit reports generated and uploaded
- [ ] Artifacts uploaded per matrix job
- [ ] README and documentation updated

### Screenshots (if applicable)

<!-- Add any relevant screenshots or GIFs to demonstrate the changes -->

### Notes for Reviewers

<!-- Add any additional notes for reviewers, such as areas to focus on or questions -->
