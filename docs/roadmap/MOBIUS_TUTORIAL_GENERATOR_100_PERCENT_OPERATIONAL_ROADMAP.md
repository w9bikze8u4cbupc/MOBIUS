# MOBIUS Tutorial Generator — 100% Operational Roadmap

## Purpose

This roadmap defines the path from the current verified state to a fully operational MOBIUS Games Tutorial Generator capable of taking a board-game rulebook PDF and game metadata, extracting the correct rules structure, selecting and using the right images, generating a beginner-friendly professional script, producing voiceover and captions, and rendering a polished YouTube-ready tutorial video.

This document is a long-term MOBIUS reference. It is not a one-time task list and must not be treated as proof that every item is already implemented.

---

## 1. Current Verified State

### Confirmed

- `main` is current at SHA `2df7a9b`.
- Historical merge/CI verification work is complete and should not be repeated.
- Authoritative CI for the last non-docs code state was green, with all 25 jobs passing.
- The React/Express pipeline shape exists.
- The system has a UI flow for:
  - project setup,
  - BGG metadata,
  - PDF/rulebook ingestion review,
  - image review,
  - script generation,
  - storyboard generation,
  - voice/TTS selection,
  - render/export.
- The deterministic E2E path passes for fixture/sample flow.
- OpenAI, Anthropic, and ElevenLabs environment configuration exists.
- Ingestion and storyboard generation have real implementation paths.
- The current E2E render path is a placeholder and does not yet prove professional tutorial rendering.

### First Real Blocker

The renderer is not production-real yet.

The current system does not have a complete renderer that consumes storyboard scenes, images, overlays, captions, and voice/audio assets to produce a real scene-by-scene tutorial video.

This is the highest-priority blocker because the rest of the pipeline cannot become operationally useful until the system can output a real video.

---

## 2. Definition of 100% Operational

MOBIUS is considered 100% operational when it can complete this flow end-to-end:

1. User creates a new project.
2. User provides:
   - BoardGameGeek URL or manual metadata,
   - PDF rulebook,
   - target language,
   - selected ElevenLabs voice,
   - optional manual images/assets.
3. System extracts:
   - game metadata,
   - component list,
   - setup steps,
   - turn/round/phase structure,
   - scoring/endgame,
   - important terminology,
   - page references/confidence where available.
4. User can review and correct extracted information.
5. System gathers and normalizes images:
   - box art,
   - component images,
   - board/setup overview images,
   - rulebook crops,
   - manually uploaded assets.
6. System matches visuals to components and setup/gameplay steps.
7. System generates a beginner-first tutorial script:
   - clear objective,
   - setup,
   - turn structure,
   - core mechanic,
   - secondary mechanics,
   - scoring/endgame,
   - edge-case referral to rulebook.
8. System generates a storyboard:
   - scene list,
   - timings,
   - image placements,
   - text overlays,
   - callouts,
   - transitions,
   - pause cues.
9. System generates voiceover using ElevenLabs.
10. System generates captions/subtitles.
11. System renders:
    - preview video,
    - full tutorial video,
    - thumbnail/poster,
    - captions sidecar,
    - chapters,
    - manifest/container metadata,
    - checksums.
12. System validates:
    - video file exists and plays,
    - audio loudness/true peak,
    - caption timing/readability,
    - visual safe area and legibility,
    - asset completeness,
    - package/checklist completeness.
13. User receives a professional YouTube-ready MP4 and supporting artifacts.

---

## 3. Roadmap Phases

### Phase 1 — Real Renderer Foundation

**Objective:** Replace the placeholder render path with a real FFmpeg-based renderer that can render storyboard scenes into a usable preview MP4.

**Deliverables:**
- `scripts/render-storyboard-ffmpeg.mjs`
- JSON render-config input contract
- Scene validation
- Per-scene image/text composition
- Basic scene concatenation
- Basic narration audio alignment
- Output MP4
- Minimal tests and smoke command

**Acceptance Criteria:**
- A minimal storyboard fixture renders into a real MP4.
- Each scene has a visual frame/background.
- Text overlays appear.
- Scene durations are respected.
- Voice/audio can be included when provided.
- Renderer exits cleanly when optional assets are missing and reports clear errors.
- Existing CI placeholder path is not broken.

**Priority:** Critical path. Do first.

---

### Phase 2 — Renderer Integration with Existing Pipeline

**Objective:** Wire the real renderer into the existing backend/UI orchestration so Render & Export no longer depends on a placeholder.

**Deliverables:**
- `RENDERER_ENTRYPOINT` default or config wiring.
- Backend render job creates real render config JSON.
- UI Render step can trigger preview render.
- Render output path is returned to the UI.
- Errors are surfaced clearly to the operator.
- Existing `renderExecutor.js` uses the real renderer path.

**Acceptance Criteria:**
- A project can proceed from storyboard to preview render from the UI or API.
- Render failure gives actionable diagnostics.
- Render config and output artifacts are persisted.
- The deterministic E2E smoke path can distinguish placeholder vs real render.

---

### Phase 3 — Image Pipeline Reliability

**Objective:** Ensure the renderer has the correct images available for real professional tutorial output.

**Deliverables:**
- Canonical `ImageAsset` normalization across BGG, rulebook, manual upload, and external sources.
- Reliable local asset references for renderer input.
- Rulebook image extraction/cropping path.
- BGG box art and image retrieval verification.
- Manual fallback for missing assets.
- Component-to-image matching confidence.

**Acceptance Criteria:**
- Each component can have one or more usable image assets.
- Setup overview image can be selected or uploaded.
- Missing image assets are clearly flagged before render.
- Renderer receives local, validated image file paths or safe placeholders.
- No inconsistent image object shapes leak into storyboard/render config.

---

### Phase 4 — PDF Extraction and Rules Understanding Upgrade

**Objective:** Improve PDF ingestion from "works on fixture" to "usable on real board-game rulebooks."

**Deliverables:**
- Robust PDF text extraction.
- OCR fallback policy.
- Components extraction.
- Setup extraction.
- Turn/phase/round extraction.
- Scoring/endgame extraction.
- Term glossary extraction.
- Page references and confidence scores.
- Operator correction UI preservation.

**Acceptance Criteria:**
- Well-structured PDFs parse without OCR.
- Scanned PDFs fail gracefully or use OCR when available.
- Extracted setup/gameplay structure is reviewable and editable.
- The system avoids hallucinating rules when confidence is low.
- Special cases are routed to "see rulebook" rather than overexplained incorrectly.

---

### Phase 5 — Script Generation Quality

**Objective:** Produce a beginner-friendly professional tutorial script that is logically strict and video-ready.

**Deliverables:**
- Script outline generator.
- Full script generator.
- EN/FR support.
- Terminology and pronunciation control.
- Pause cues during setup.
- Edge-case handling policy.
- Script review/edit persistence.

**Acceptance Criteria:**
- Script follows a reliable teaching order.
- Script avoids expansion/solo rules unless explicitly requested.
- Script is clear for complete beginners.
- Script segments map cleanly to storyboard scenes.
- French and English outputs preserve game terminology correctly.

---

### Phase 6 — Voiceover and Captions

**Objective:** Generate professional narration and captions aligned to the script/storyboard.

**Deliverables:**
- ElevenLabs TTS per script segment.
- Voice asset metadata and duration capture.
- Pronunciation override support.
- Caption generation from script/TTS timings.
- SRT and/or VTT output.
- Caption validation.

**Acceptance Criteria:**
- Each script segment can produce voice audio.
- Audio duration is captured and used by storyboard/render timing.
- Captions are readable, non-overlapping, and exported.
- User can preview voice before full render.
- Missing/failed TTS segments are clearly flagged.

---

### Phase 7 — Professional Video Polish

**Objective:** Make rendered tutorials visually professional, not just technically valid.

**Deliverables:**
- Title card, chapter/section cards, lower thirds.
- Text overlays with safe-area enforcement.
- Callouts/arrows/highlights.
- Basic motion/zoom/pan.
- Transition style.
- Intro/outro policy.
- Brand styling config.
- Thumbnail/poster generation.

**Acceptance Criteria:**
- Overlay text is legible at 1080p.
- Visual reinforcement appears regularly.
- Scene pacing feels instructional.
- Video is suitable for YouTube without manual editing.

---

### Phase 8 — Audio Quality and Mixing

**Objective:** Meet professional loudness and clarity requirements.

**Deliverables:**
- Narration/background-music mixing.
- Ducking, loudness measurement, true-peak validation.
- Clipping/silence checks.
- Audio report in manifest.

**Acceptance Criteria:**
- Integrated loudness target is enforced.
- True peak ceiling is enforced.
- Narration remains intelligible.

---

### Phase 9 — Packaging, Manifest, and Export

**Objective:** Produce complete deliverables for YouTube and future rerenders.

---

### Phase 10 — CI, Golden Baselines, and Regression Protection

**Objective:** Prevent regressions once the generator becomes operational.

---

### Phase 11 — Operator UX Hardening

**Objective:** Make the tool usable by a single operator without developer intervention.

---

### Phase 12 — Production Readiness

**Objective:** Make the generator stable enough for repeated real tutorial creation.

---

## 4. Immediate Critical Path

1. Build the real storyboard-to-video renderer.
2. Wire it into `renderExecutor.js`.
3. Render a minimal real preview from fixture data.
4. Connect render output to the UI/API.
5. Validate images/assets.
6. Add voice and captions into the rendered preview.
7. Iterate quality gates until the video is professional enough.

Do not prioritize stale docs, stale PRs, or broad refactors ahead of this path unless they block implementation.

---

## 5. Current Blocker Classification

| Class | Blocker | Impact | Priority |
|---|---|---|---|
| A | No real scene-by-scene renderer | Prevents actual tutorial output | Highest |
| B | Renderer entrypoint/env not wired | Prevents backend render execution | High |
| C | Image automation incomplete | Limits professional visual quality | High |
| D | Missing helper scripts referenced by package scripts | Breaks some developer commands | Medium |
| E | Stale open docs/governance PRs | Not operationally blocking | Low |

---

## 6. Development Rules Going Forward

- Work from verified state, not old assumptions.
- One blocker at a time.
- Prefer the shortest path to a working real video.
- Keep PRs small and scoped.
- Do not weaken quality gates.
- Do not create documents unless they guide execution.
- Every implementation task must include validation.
- Treat placeholder success as insufficient once real rendering work begins.
- Keep the generator usable by a non-developer operator.

---

## 7. Next Task After This Roadmap

Implement the first real FFmpeg storyboard renderer.

The first implementation does not need full professional polish. It must prove the core path:

`storyboard + image assets + optional audio -> real MP4 with multiple scenes`

Once this exists, every later phase can improve real output instead of validating placeholders.
