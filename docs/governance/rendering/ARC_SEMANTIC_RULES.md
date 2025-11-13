# ARC Semantic Rules

The Audio/Rendering Contract (ARC) codifies the baseline expectations for preview renders, audio mastering, and validation thresholds used across the rendering consistency workflow. Sections 1–6 describe the contract pillars and enforcement hooks; the addendum below documents how those values surface in automated reporting.

---

## 7. ARC in JUnit / CI Reports

The rendering consistency workflow publishes ARC metadata into its JUnit XML
as `<properties>`. This allows CI dashboards and external test-reporting tools
to display the active rendering contract alongside test results.

Key properties (examples):

- `arc.version` — ARC version string (e.g., `1.0.1`)
- `arc.video.width`, `arc.video.height`, `arc.video.fps`
- `arc.video.pixFmt`, `arc.video.sar`
- `arc.audio.sampleRate`, `arc.audio.channels`
- `arc.audio.targetLufs`, `arc.audio.truePeakCeiling`
- `arc.extraction.method`, `arc.extraction.frameCountTolerancePct`
- `arc.validation.ssim.min`

If JUnit parsing is enabled in CI, these properties will be visible in the
rendering-consistency testsuite details. When debugging rendering regressions,
first confirm that the properties match the expected ARC values before
investigating frame-level SSIM or metadata mismatches.

Validation (1–2 lines)

This doc change explains why new JUnit properties exist and how to use them, aligning CI metadata with governance.

No code impact; once committed, reviewers immediately understand the properties they see in JUnit.
