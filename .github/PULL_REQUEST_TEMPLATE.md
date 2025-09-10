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

<details>
  <summary>Reference checklist coverage (auto-validated in CI unless marked Manual)</summary>

- CFG (Inputs & Config): CFG-01..CFG-05
- GEN (Rulebook Ingestion & Script): GEN-01..GEN-05
- AST (Assets): AST-01..AST-04
- REN (Rendering): REN-01..REN-08
- AUD (Audio): AUD-01..AUD-05
- SUB (Subtitles/Accessibility): SUB-01..SUB-04
- I18N (Localization): I18N-01..I18N-03
- OUT (Packaging/Delivery): OUT-01..OUT-05
- DET (Determinism): DET-01..DET-03
- GOLD (Golden Harness QA): GOLD-01..GOLD-07
- CI (CI/CD): CI-01..CI-07
- PERF (Performance): PERF-01..PERF-04
- OBS (Observability): OBS-01..OBS-03
- SEC (Security/Licensing): SEC-01..SEC-03
- FAIL (Failure Handling): FAIL-01..FAIL-04
- DOC (Docs/Runbooks): DOC-01..DOC-03
- REL (Release Mgmt): REL-01..REL-03
- UAT/QUALITY: UAT-01..UAT-03
- AUTO (Optional automated gates): AUTO-01..AUTO-03
- EXIT (Go/No-Go): EXIT-01..EXIT-05

</details>