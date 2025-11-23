# Section 9–10 QA/UAT Governance and Priorities (Locked)

## 9) QA/UAT – “1 Task per Checkbox” (Finalized)
- **Canonical checklist**: Adopt the Simple End-to-End Checklist (A–K) with per-ID status tracking.
- **Target game & OSes**: Sushi Go! as flagship; validate first on **Windows**, **macOS**, then **Linux** once first two are green.
- **Must-pass for ship-ready** (automation where possible):
  - **A01–A08**: Project creation & save (manual + some automation).
  - **B01–B14**: BGG metadata autofill + overrides (partially auto-checkable).
  - **C01–C10**: PDF ingestion & script save (mixed).
  - **D01–D11**: Visual assets & layout (mostly manual; persistence auto).
  - **E01–E09**: Audio & TTS (levels, ducking, save).
  - **F01–F05**: Captions generated, editable, burn-in toggle.
  - **G01–G07**: Renders & duration (auto via manifest + ffprobe).
  - **H01–H10**: Visual/auditory quality (mixed manual + auto such as duration, thumbnail).
  - **I01–I04**: Packaging (container.json, captions, checksums, archive).
  - **J01–J04**: Golden & checklist validators.
  - **K01–K06**: Delivery, logs, timing, confidence (semi-manual; human confirmation required).
- **golden:validate expectations**:
  - Auto-check everything clearly machine-verifiable in **A–J**.
  - Emit JSON report with per-ID status: `"A01": "pass" | "fail" | "manual"`.
  - Require manual confirmation for **K01–K06**.
- **Director rule**: A tutorial cannot be marked “publishable” unless all auto-checkable items pass **and** a human marks **K01–K06** complete.

## 10) Priorities & Timeline (Director-Decided)
### 10.1 Priority Ranking (1 = highest)
1. Encoding consistency (baseline cross-platform stability, golden frames, CI success).
2. Packaging/manifest (repeatable exports, debug bundles, GENESIS inspector integration).
3. Captions (accessibility, multi-language, polish).
4. Audio quality (-14 LUFS, no clipping).
5. CLI/CI UX (fast dev loop, reduced human error).
6. Branding polish (iterable without breaking contracts).
7. Localization (follows once EN baseline is solid).

### 10.2 “Professional” Must-Haves (Top 3)
- **Encoding consistency & golden checks**: 1080p30, SSIM ≥ 0.95 vs golden, valid `container.json`, checksums present.
- **Packaging & manifest correctness**: `container.json`, `checksums.json`, `chapters.json`, `poster.jpg`, EN SRT at minimum.
- **Captions + audio quality**: Readable SRT, sync within 200ms, loudness -14 LUFS ±0.5, no clipping.

### 10.3 Nice-to-Haves (Top 3)
- Full localization (FR parity): FR script + SRT + TTS with term locking.
- Branding polish & motion refinements: smoother transitions, richer lower thirds, nuanced callouts.
- Advanced CLI/CI ergonomics: helpers, auto-detection of games, enhanced PR summaries.

### 10.4 Target Date for First Publishable Tutorial
- **Game**: Sushi Go!
- **OS**: Windows + macOS passing golden checks (Linux follows once green).
- **Language**: English required (FR stub optional for milestone).
- **Gate**: All must-pass items in **A–J** green; **K01–K06** manually confirmed for at least one OS.
- **Target date**: **December 15, 2025**.

---
Banner reference provided: `/mnt/data/Banner.png`.
