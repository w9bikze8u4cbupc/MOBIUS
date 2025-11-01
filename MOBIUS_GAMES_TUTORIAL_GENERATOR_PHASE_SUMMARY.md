# Mobius Games Tutorial Generator Phase Summary

## ✅ Executive Summary

**Mobius Games Tutorial Generator** is a multi-phase system that automatically turns a board game’s rulebook and BoardGameGeek (BGG) metadata into a polished, bilingual (EN/FR) YouTube tutorial video. It unifies **Node.js/Express**, **React**, and **FFmpeg/Python** pipelines into one reproducible, CI-validated workflow with full observability, branch protection, and end-to-end QA.

## 🧩 Architecture Overview

| Layer | Technology | Key Purpose |
| --- | --- | --- |
| **Frontend (React + CRACO)** | CRA React SPA | Operator interface for uploading rulebooks, reviewing extractions, matching images, editing scripts, generating audio, and previewing renders. |
| **Backend (Express / Node ESM)** | Express + SQLite + Sharp + pdf-parse + OpenAI SDK | Orchestrates PDF ingestion, BGG fetch, AI extraction, image handling, and rendering orchestration. |
| **Python Utilities** | PyMuPDF, OpenCV, ultralytics YOLOv8, FFmpeg | Handles PDF→image conversion, component detection, and low-level video/audio operations. |
| **LLM Services** | OpenAI, Cohere, Anthropic, Bing, Unsplash, ElevenLabs | Text extraction, translation, image search, and TTS synthesis. |
| **Observability Layer** | Prometheus + Grafana + NDJSON logging | Metrics and logs for render jobs, durations, and error tracking. |
| **Data Storage** | SQLite + filesystem (uploads, pdf_images, output/) | Minimal persistence for per-project JSON data and artifacts. |

## 🧱 Implementation Phases

### Phase A – Foundation & Core Pipeline

- FFmpeg rendering module with preview/full render, dry-run, timeout, thumbnail generation.
- ESM-safe architecture with cross-platform Node 18/20 support.
- Core CLI (`scripts/render.js`) for local/CI runs.
- Multi-node CI matrix and automated smoke tests.
- All tests green; verified deterministic outputs.

### Phase B – Feature & Quality Expansion

- Subtitles system (SRT/VTT sidecar + optional burn-in).
- Audio ducking with envelope/sidechain compression.
- Extended renderer API for subtitles/audio.
- Cross-platform escaping, docs, and unit tests.

### Phase C – Hardening & Scale

- Progress parsing, ETA tracking, checkpointing/resumability.
- Containerized runner (Dockerfile with FFmpeg/fonts).
- Artifact verification (size/hash).
- End-to-end tests and scheduled validation jobs.
- Robust resource cleanup and graceful shutdown.

### Phase D – Observability & Operations

- Prometheus metrics (counters, histograms).
- NDJSON structured logs with session/job IDs.
- SLIs/SLOs for success rate, render duration, and timeout rate.
- Grafana dashboards + alert rules.
- Incident response runbook, log retention, and compliance.

## ⚙️ Supporting Systems

### Ingestion & Extraction (Phase E)

- PDF ingestion via `pdf-parse` with OCR fallback (Tesseract).
- BGG fetcher: title, year, designers, box art.
- Storyboard generator: rule-based, outputs JSON scenes.
- CLI: `node scripts/ingest-sample.js --pdf tests/fixtures/rulebook.pdf --bgg "<URL>" --out story.json`
- Future: heading detection, layout heuristics, image extraction, OCR CI.

## 🎬 Video Rendering Pipeline

- Modular rendering engine (`src/render/index.js`).
- Real-time progress, checkpointing, and resumability.
- Containerization with resource constraints.
- Prometheus + NDJSON observability.
- Loudness normalization compliance (-16 LUFS target).
- 37/37 tests passing across all OSes.
- Production-ready for full render workloads.

### Render Examples

```bash
# Preview (5s)
node scripts/render.js --project-id mygame --mode preview --preview-seconds 5

# Full render with subtitles + ducking
node scripts/render.js --project-id mygame --mode full --burn-captions --ducking-mode sidechain

# Containerized run
docker run -v /input:/input -v /output:/output mobius-renderer --project-id mygame --mode full
```

## 🧭 QA & Validation

### End-to-End Checklist

- C02–C10: PDF parse, TOC detection, editable steps.
- D07–D10: Callout placement + palette persistence.
- E01–E09: TTS voice generation and audio QC.
- F01–F05: Caption generation + sync.
- G01–G07: Rendering sequence.
- H01–H10: Visual/audio QC.
- I/J/K: Packaging, manifest validation, delivery feedback.

## 🔐 Security & Governance

- Branch protection and token safety enforced.
- Pre-commit hooks (`.githooks/pre-commit`, PowerShell/bash).
- Setup scripts for both platforms.
- `BRANCH_PROTECTION_TOKEN_GUIDE.md` guides secret handling.

## 🎨 Brand & Motion Framework

- Standard JSON schema for brand colors, typography, layout, motion, callouts, and cursor highlights.
- Defines intro/outro bumpers, transitions, watermarking.
- Voice & pacing config (TTS/human, WPM, pauses).
- Captions & accessibility rules (SRT/VTT, CPS limits).
- Rendering specs: 1080p–4K, 30/60 fps, -14 LUFS target.
- Packaging schema: `container.json` + SHA-256 checksums.
- CLI UX and UAT checklist integration with golden tests.

## 🧰 Developer & CI Details

- Cross-platform CI: Node 18/20 matrix + FFmpeg smoke runs.
- Golden baselines: SSIM ≥ 0.95 per platform.
- Promotion script: `node scripts/promote_baselines.cjs --game <name> --platform <os>`.
- Branch protection: `.githooks/` + PowerShell/bash parity.
- Tooling: ESLint/Prettier planned; Ruff/Black for Python.

## 📈 Project Technical Overview

- Backend: Express + SQLite + pdf-parse + Sharp + OpenAI.
- Frontend: React + CRACO + pdfjs-dist + react-beautiful-dnd.
- Python side: YOLOv8 + OpenCV + FFmpeg utilities.
- LLM abstraction: `ServiceFactory` for provider swap.
- Known issues resolved: duplicate `projects.db` → unified; upload paths normalized; improved CORS and naming.
- Onboarding path (15 min): Node 18+, Python 3.10+, FFmpeg; `npm run server`, `npm start` (frontend).

## 🚀 Current Release Status

| Module | Phase | Status | Notes |
| --- | --- | --- | --- |
| **Ingestion (PDF/BGG)** | E | ✅ POC complete | OCR + BGG metadata working |
| **Rendering Engine** | D | ✅ Production-ready | 37 tests green, containerized |
| **Gateway / Exports** | F | ✅ Stable | 404 cache-fix merged |
| **CI/CD & QA** | F | ⚙️ Ongoing | CDN validation next |
| **Docs & Runbooks** | F | 🟡 Updating | `cdn-edge-runbook.md` pending |
| **Mac/Linux Baselines** | Validation | 🧩 Finalizing | SSIM ≥ 0.95 expected |

## 🧭 Next Actions

1. Finalize CDN edge tests and merge v0.87.1.
2. Run macOS/Linux SSIM validation and promote goldens.
3. Update runbook & CHANGELOG with 404/no-store fix.
4. Extend Python YOLO pipeline for component visual detection.
5. Prepare Phase G: cloud render orchestration + dashboard integration.

**Mobius Games Tutorial Generator** now represents a full production-grade, cross-platform system with secure workflows, robust CI, and clear branding/audio/UX standards—ready for public YouTube content generation.
