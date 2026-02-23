# ProV0-01 Quick Start Guide

**Version**: 1.0  
**Date**: 2026-02-23

## Prerequisites

- Node.js 18+ installed
- FFmpeg installed
- Git repository at known commit
- Rulebook PDF ready
- 5GB+ free disk space

## One-Command Production Run

### Step 1: Prepare Confirmation File

```bash
cp docs/releases/prov0-01-confirmations.example.json my-confirmations.json
```

Edit `my-confirmations.json`:
- Replace `[OPERATOR_NAME]` with your name
- Replace `[ISO_8601_TIMESTAMP]` with current timestamp (e.g., `2026-02-23T10:00:00Z`)
- Review each gate confirmation

### Step 2: Run ProV0-01

```bash
npm run release:prov0-01 -- \
  --pdf path/to/rulebook.pdf \
  --confirm-file my-confirmations.json \
  --bgg-url "https://boardgamegeek.com/boardgame/XXXXX"
```

### Step 3: Wait for Completion

The harness will automatically:
1. ✅ Start API server
2. ✅ Run E2E commissioning
3. ✅ Verify artifacts
4. ✅ Generate dossier
5. ✅ Stop server

Duration: ~5-15 minutes depending on PDF complexity

### Step 4: Review Outputs

**Artifacts** (in `data/outputs/project_prov0-01/`):
- `output.mp4` - Final video
- `captions_en.srt` - Captions
- `thumbnail.jpg` - Thumbnail
- `chapters_en.json` - Chapters
- `render_manifest.json` - Manifest with checksums
- `objective_qc.json` - QC report

**Documentation** (in repo root and `docs/releases/`):
- `FIRST_FULL_E2E_RUN.json` - E2E report (JSON)
- `FIRST_FULL_E2E_RUN.md` - E2E report (Markdown)
- `docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json` - Runlog
- `docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md` - QC review

### Step 5: Manual QC

Open `output.mp4` and verify:
- [ ] Video plays without errors
- [ ] Audio is clear and synchronized
- [ ] Captions are synchronized
- [ ] No visual corruption

Complete subjective QC section in `PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md`.

## Dry-Run (Test Wiring)

Before production run, test the harness:

```bash
npm run release:prov0-01:dry
```

This validates:
- Script syntax
- Harness orchestration
- Stub file generation

**No server or artifacts produced.**

## Smoke Checks

Verify all scripts parse cleanly:

```bash
npm run smoke:all
```

Fast-fail syntax validation (< 1 second).

## Full Test Suite

Run all tests before production:

```bash
npm run test:all
```

Includes:
- Smoke checks (syntax)
- Unit tests (93 tests)
- Integration tests (10 tests)

## Troubleshooting

### Server Won't Start

**Error**: "Server did not become ready within 30000ms"

**Solution**:
- Check port 5001 is not in use: `netstat -an | grep 5001`
- Try different port: `--port 5002`

### E2E Fails with "Gate not confirmed"

**Error**: "Gate confirm_metadata requires confirmation"

**Solution**:
- Ensure confirmation file includes all required gates
- Check `gateId` spelling matches exactly
- Verify `decision: "CONFIRM"` (uppercase)

### Objective QC Fails

**Error**: "Artifact verification failed with N errors"

**Solution**:
- Check `objective_qc.json` for specific errors
- Common issues:
  - Missing FFmpeg
  - Corrupted video file
  - Invalid SRT format
  - Checksum mismatch

### Dry-Run Produces No Output

**Issue**: Stub files not created

**Solution**:
- Check console for errors
- Verify write permissions in `docs/releases/`
- Run with explicit logging: `node scripts/releases/prov0-01-run.mjs --dry-run`

## Next Steps

After successful run:

1. **Commit Documentation**:
   ```bash
   git add docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_*
   git add FIRST_FULL_E2E_RUN.*
   git commit -m "release: ProV0-01 first professional video"
   ```

2. **Tag Release**:
   ```bash
   git tag -a prov0-01 -m "ProV0-01: First Professional Video v0"
   git push origin prov0-01
   ```

3. **Create Archive**:
   ```bash
   mkdir -p releases/prov0-01
   cp data/outputs/project_prov0-01/* releases/prov0-01/
   tar -czf releases/prov0-01.tar.gz releases/prov0-01/
   sha256sum releases/prov0-01.tar.gz > releases/prov0-01.tar.gz.sha256
   ```

4. **Upload to Platform** (YouTube/Vimeo):
   - Video: `output.mp4`
   - Captions: `captions_en.srt`
   - Thumbnail: `thumbnail.jpg`
   - Chapters: Copy from `chapters_en.json`

## Support

- **Full Guide**: `docs/releases/AUTONOMOUS_EXECUTION.md`
- **Production Guide**: `docs/releases/PRO_VIDEO_V0_PRODUCTION_GUIDE.md`
- **Technical Spec**: `docs/rendering/PRO_VIDEO_V0.md`

---

**Quick Start Version**: 1.0  
**Last Updated**: 2026-02-23
