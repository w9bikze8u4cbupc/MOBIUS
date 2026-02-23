# Professional Video v0 - First Video Production Guide

**Version**: 1.0  
**Date**: 2026-02-23  
**Status**: Production-Ready

## Overview

This guide walks through producing the first publishable Professional Video v0 tutorial using MOBIUS v1 with full governance enforcement and quality documentation.

## Prerequisites

### System Requirements
- Node.js 18+ installed
- FFmpeg installed and in PATH
- Git repository at known commit
- At least 5GB free disk space

### Required Files
- Game rulebook PDF
- (Optional) BGG URL for metadata
- (Optional) Brand assets (intro/outro clips)

### Environment Setup
```bash
# Ensure all dependencies installed
npm ci

# Verify tests pass
npm run test:all

# Set environment variables
export NODE_ENV=production
export SKIP_LEGACY_CHECK=false  # Enforce storage validation
```

## Step-by-Step Production

### Step 1: Prepare Input Materials

1. **Select Game**: Choose a game with clear, well-structured rulebook
2. **Obtain PDF**: Ensure PDF is readable and not corrupted
3. **Verify BGG**: Confirm BGG URL is correct (optional but recommended)
4. **Review Rulebook**: Manually review to understand content

**Checklist**:
- [ ] PDF file exists and is readable
- [ ] BGG URL verified (if using)
- [ ] Rulebook content appropriate for tutorial
- [ ] No copyright issues with using rulebook

### Step 2: Start API Server

```bash
# Terminal 1: Start API server
cd mobius-games-tutorial-generator
npm start

# Wait for "Server listening on port 5001"
```

**Verify**:
- [ ] Server starts without errors
- [ ] No legacy path warnings (or SKIP_LEGACY_CHECK=true set)
- [ ] API accessible at http://localhost:5001

### Step 3: Run E2E Commissioning with Pro v0 Profile

```bash
# Terminal 2: Run E2E commissioning
npm run e2e:commission -- \
  --project-id pro-v0-first \
  --pdf path/to/rulebook.pdf \
  --bgg-url "https://boardgamegeek.com/boardgame/XXXXX" \
  --profile pro_v0 \
  --lang en

# Follow interactive prompts to confirm gates
```

**Expected Flow**:
1. PDF upload and component extraction
2. BGG metadata fetch (if URL provided)
3. Ingestion report generation
4. **GATE**: Confirm metadata
5. **GATE**: Confirm components
6. **GATE**: Confirm setup logic (if applicable)
7. **GATE**: Confirm turn structure (if applicable)
8. **GATE**: Confirm OCR hazards (if applicable)
9. Script generation
10. **GATE**: Confirm script
11. (Optional) HEPHAESTUS image extraction
12. (Optional) **GATE**: Confirm component images
13. Render with pro_v0 profile
14. Verification

**Checklist**:
- [ ] All gates confirmed explicitly
- [ ] No errors during ingestion
- [ ] Script generated successfully
- [ ] Render completed successfully
- [ ] All artifacts produced

### Step 4: Verify Artifacts

```bash
# Check output directory
ls -lh data/outputs/project_pro-v0-first/

# Expected files:
# - output.mp4 (or preview_Xs.mp4)
# - thumbnail.jpg
# - captions_en.srt
# - chapters_en.json
# - render_manifest.json
```

**Verification Steps**:

1. **Video (MP4)**:
   ```bash
   # Check file exists and size
   ls -lh data/outputs/project_pro-v0-first/output.mp4
   
   # Play video (use your preferred player)
   # Verify: plays without errors, audio/video sync, no corruption
   ```

2. **Captions (SRT)**:
   ```bash
   # Check format
   head -20 data/outputs/project_pro-v0-first/captions_en.srt
   
   # Verify: valid SRT format, timestamps reasonable, text matches script
   ```

3. **Chapters (JSON)**:
   ```bash
   # Check format
   cat data/outputs/project_pro-v0-first/chapters_en.json | jq .
   
   # Verify: valid JSON, chapter titles descriptive, timestamps align
   ```

4. **Manifest (JSON)**:
   ```bash
   # Check format
   cat data/outputs/project_pro-v0-first/render_manifest.json | jq .
   
   # Verify: all artifacts listed, checksums present, settings documented
   ```

**Checklist**:
- [ ] All 5 required artifacts exist
- [ ] Video plays without errors
- [ ] Captions are valid SRT
- [ ] Chapters are valid JSON
- [ ] Manifest is valid JSON
- [ ] File sizes reasonable (video > 1MB, others < 1MB typically)

### Step 5: Generate Runlog

```bash
# Generate structured runlog
node scripts/releases/generate-pro-v0-runlog.mjs \
  FIRST_FULL_E2E_RUN.json \
  docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json \
  data/outputs/project_pro-v0-first/render_manifest.json

# Verify runlog created
cat docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json | jq .
```

**Checklist**:
- [ ] Runlog generated successfully
- [ ] Commit SHA recorded
- [ ] All artifacts listed with checksums
- [ ] Gate confirmations documented
- [ ] Render settings captured

### Step 6: Perform Quality Review

1. **Open QC Template**:
   ```bash
   cp docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md \
      docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW_$(date +%Y%m%d).md
   ```

2. **Fill in Template**:
   - Copy commit SHA from runlog
   - Copy artifact paths and checksums from manifest
   - Perform all quality checks
   - Document any issues or deviations

3. **Technical Quality Checks**:
   - [ ] Play video start to finish
   - [ ] Verify audio loudness is consistent
   - [ ] Check caption synchronization
   - [ ] Verify chapter timestamps
   - [ ] Validate manifest checksums

4. **Content Quality Checks**:
   - [ ] Introduction is clear
   - [ ] Components are explained
   - [ ] Setup instructions are accurate
   - [ ] Gameplay mechanics are covered
   - [ ] Conclusion is appropriate

5. **Governance Compliance**:
   - [ ] All required gates were confirmed
   - [ ] No bypass flags used
   - [ ] Provenance documented
   - [ ] Canonical paths used

**Checklist**:
- [ ] QC review document completed
- [ ] All checks performed
- [ ] Issues documented
- [ ] Final verdict recorded

### Step 7: Verify Checksums

```bash
# Verify all artifact checksums match manifest
node -e "
const fs = require('fs');
const crypto = require('crypto');
const manifest = JSON.parse(fs.readFileSync('data/outputs/project_pro-v0-first/render_manifest.json', 'utf8'));

for (const [key, artifact] of Object.entries(manifest.artifacts)) {
  if (artifact.exists && artifact.checksum) {
    const fileBuffer = fs.readFileSync(artifact.path);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const calculated = hashSum.digest('hex');
    const match = calculated === artifact.checksum;
    console.log(\`\${key}: \${match ? '✅' : '❌'} \${artifact.filename}\`);
    if (!match) {
      console.log(\`  Expected: \${artifact.checksum}\`);
      console.log(\`  Calculated: \${calculated}\`);
    }
  }
}
"
```

**Expected Output**:
```
video: ✅ output.mp4
thumbnail: ✅ thumbnail.jpg
captions: ✅ captions_en.srt
chapters: ✅ chapters_en.json
manifest: ✅ render_manifest.json
```

**Checklist**:
- [ ] All checksums verified
- [ ] No mismatches found
- [ ] Artifacts not corrupted

### Step 8: Finalize Documentation

1. **Commit All Documentation**:
   ```bash
   git add docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW_*.md
   git add docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json
   git add FIRST_FULL_E2E_RUN.md
   git add FIRST_FULL_E2E_RUN.json
   git commit -m "docs: Professional Video v0 first video QC review"
   ```

2. **Tag Release**:
   ```bash
   git tag -a pro-video-v0-first -m "First Professional Video v0 tutorial"
   git push origin pro-video-v0-first
   ```

**Checklist**:
- [ ] All documentation committed
- [ ] Release tagged
- [ ] Tag pushed to remote

### Step 9: Archive Artifacts

```bash
# Create release archive
mkdir -p releases/pro-video-v0-first
cp data/outputs/project_pro-v0-first/* releases/pro-video-v0-first/
cp docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW_*.md releases/pro-video-v0-first/
cp docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json releases/pro-video-v0-first/

# Create tarball
tar -czf releases/pro-video-v0-first.tar.gz releases/pro-video-v0-first/

# Calculate archive checksum
sha256sum releases/pro-video-v0-first.tar.gz > releases/pro-video-v0-first.tar.gz.sha256
```

**Checklist**:
- [ ] Archive created
- [ ] All artifacts included
- [ ] Documentation included
- [ ] Checksum calculated

## Troubleshooting

### Issue: Render Fails with "No images found"

**Solution**: Ensure project has images or use placeholder assets
```bash
# Check project images
curl http://localhost:5001/api/projects/pro-v0-first | jq .images
```

### Issue: Chapters Not Generated

**Solution**: Ensure script has timing information
```bash
# Check script segments have startTime/endTime
curl http://localhost:5001/api/projects/pro-v0-first/script/authoritative | jq '.script.scriptSegments[0]'
```

### Issue: Manifest Missing Artifacts

**Solution**: Verify all artifacts were produced before manifest generation
```bash
# Check render stage completed
cat FIRST_FULL_E2E_RUN.json | jq '.stages.render.status'
```

### Issue: Checksum Mismatch

**Solution**: Artifact may have been modified after manifest generation
```bash
# Regenerate manifest
# (This requires re-running render or manually updating manifest)
```

## Success Criteria

### Minimum Requirements (PASS)
- [ ] All 5 required artifacts produced
- [ ] Video plays without errors
- [ ] Audio loudness within ±2 LUFS of target
- [ ] Captions synchronized (±0.5s tolerance)
- [ ] Chapters align with content
- [ ] All checksums verify
- [ ] All gates confirmed
- [ ] No governance bypasses

### Quality Requirements (PUBLISHABLE)
- [ ] Video duration appropriate (5-15 minutes typical)
- [ ] Audio clear and understandable
- [ ] Captions readable and accurate
- [ ] Chapters descriptive and useful
- [ ] Thumbnail representative
- [ ] No technical issues
- [ ] Content accurate and complete

### Documentation Requirements (RELEASE-READY)
- [ ] QC review completed
- [ ] Runlog generated
- [ ] Commit SHA recorded
- [ ] All artifacts checksummed
- [ ] Final verdict documented
- [ ] Release tagged

## Post-Production

### Platform Upload (YouTube Example)

1. **Upload Video**:
   - File: `output.mp4`
   - Title: [From metadata]
   - Description: [Include chapter timestamps]

2. **Upload Captions**:
   - File: `captions_en.srt`
   - Language: English

3. **Set Thumbnail**:
   - File: `thumbnail.jpg`

4. **Add Chapters**:
   - Copy timestamps from `chapters_en.json`
   - Format: `00:00 Introduction`

### Verification
- [ ] Video uploaded successfully
- [ ] Captions display correctly
- [ ] Chapters work in player
- [ ] Thumbnail displays
- [ ] Metadata correct

## Appendix

### File Locations

```
mobius-games-tutorial-generator/
├── data/outputs/project_pro-v0-first/
│   ├── output.mp4                    # Final video
│   ├── thumbnail.jpg                 # Thumbnail
│   ├── captions_en.srt              # Captions
│   ├── chapters_en.json             # Chapters
│   └── render_manifest.json         # Manifest
├── docs/releases/
│   ├── PRO_VIDEO_V0_FIRST_VIDEO_REVIEW_YYYYMMDD.md
│   └── PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json
├── FIRST_FULL_E2E_RUN.md            # E2E report (markdown)
└── FIRST_FULL_E2E_RUN.json          # E2E report (JSON)
```

### Command Reference

```bash
# Run E2E with pro_v0 profile
npm run e2e:commission -- --project-id ID --pdf PATH --profile pro_v0

# Generate runlog
node scripts/releases/generate-pro-v0-runlog.mjs E2E.json OUTPUT.json MANIFEST.json

# Verify checksums
sha256sum -c releases/pro-video-v0-first.tar.gz.sha256

# Check artifact
ffprobe -v error -show_format -show_streams output.mp4
```

---

**Production Guide Version**: 1.0  
**Last Updated**: 2026-02-23  
**Status**: Production-Ready
