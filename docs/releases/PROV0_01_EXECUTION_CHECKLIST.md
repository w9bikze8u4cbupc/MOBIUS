# ProV0-01 Production Run Execution Checklist

**Run ID**: ProV0-01  
**Date**: [TO BE FILLED BY OPERATOR]  
**Operator**: [TO BE FILLED BY OPERATOR]  
**Commit SHA**: [TO BE FILLED - Run `git rev-parse HEAD`]

## Pre-Execution Checklist

### Environment Verification
- [ ] All tests passing: `npm run test:all` → Exit code 0
- [ ] Git repository clean: `git status` → No uncommitted changes
- [ ] Commit SHA recorded: `git rev-parse HEAD`
- [ ] Node.js version: `node --version` → v18+ required
- [ ] FFmpeg installed: `ffmpeg -version` → Verified
- [ ] Disk space: At least 5GB free

### Input Materials
- [ ] Rulebook PDF selected and verified readable
- [ ] PDF path recorded: `___________________________`
- [ ] BGG URL obtained (optional): `___________________________`
- [ ] PDF legally safe to use (no copyright issues)

### Configuration
- [ ] Project ID: `prov0-01`
- [ ] Language: `en`
- [ ] Profile: `pro_v0`
- [ ] HEPHAESTUS: Not required for this run
- [ ] Brand assets: Not required (graceful omission)

## Execution Steps

### Step 1: Start API Server

```bash
# Terminal 1
cd mobius-games-tutorial-generator
export NODE_ENV=production
export SKIP_LEGACY_CHECK=true  # If needed for testing
npm start
```

**Verification**:
- [ ] Server starts without errors
- [ ] Console shows "Server listening on port 5001"
- [ ] No fatal errors in startup logs

**Timestamp Started**: `___________________________`

### Step 2: Execute E2E Commissioning

```bash
# Terminal 2
npm run e2e:commission -- \
  --project-id prov0-01 \
  --pdf [PATH_TO_RULEBOOK_PDF] \
  --bgg-url [BGG_URL_IF_AVAILABLE] \
  --profile pro_v0 \
  --lang en
```

**Interactive Gate Confirmations** (respond to each prompt):

1. [ ] **CONFIRM_METADATA**: Review game title, designer, publisher → Confirm? [Y/n]
2. [ ] **CONFIRM_COMPONENTS**: Review component list → Confirm? [Y/n]
3. [ ] **CONFIRM_SETUP_LOGIC**: Review setup instructions (if applicable) → Confirm? [Y/n]
4. [ ] **CONFIRM_TURN_STRUCTURE**: Review turn structure (if applicable) → Confirm? [Y/n]
5. [ ] **CONFIRM_OCR_HAZARDS**: Review OCR quality (if applicable) → Confirm? [Y/n]
6. [ ] **CONFIRM_SCRIPT**: Review generated script → Confirm? [Y/n]

**Record Gate Confirmations**:
- Gate 1 confirmed at: `___________________________`
- Gate 2 confirmed at: `___________________________`
- Gate 3 confirmed at: `___________________________`
- Gate 4 confirmed at: `___________________________`
- Gate 5 confirmed at: `___________________________`
- Gate 6 confirmed at: `___________________________`

**Execution Monitoring**:
- [ ] Ingestion stage completed
- [ ] Script generation completed
- [ ] Render stage started
- [ ] Render progress visible (percentage updates)
- [ ] Render completed without errors
- [ ] Verification stage completed

**Timestamp Completed**: `___________________________`

**Exit Code**: `___________________________` (should be 0)

### Step 3: Verify Artifacts Produced

```bash
# Check output directory
ls -lh data/outputs/project_prov0-01/

# Expected files:
# - output.mp4
# - thumbnail.jpg
# - captions_en.srt
# - chapters_en.json
# - render_manifest.json
```

**Artifact Verification**:
- [ ] `output.mp4` exists
  - Size: `___________________________` bytes
  - Duration: `___________________________` seconds
  
- [ ] `thumbnail.jpg` exists
  - Size: `___________________________` bytes
  
- [ ] `captions_en.srt` exists
  - Size: `___________________________` bytes
  - Line count: `___________________________`
  
- [ ] `chapters_en.json` exists
  - Size: `___________________________` bytes
  - Chapter count: `___________________________`
  
- [ ] `render_manifest.json` exists
  - Size: `___________________________` bytes

### Step 4: Generate Runlog

```bash
node scripts/releases/generate-pro-v0-runlog.mjs \
  FIRST_FULL_E2E_RUN.json \
  docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json \
  data/outputs/project_prov0-01/render_manifest.json
```

**Verification**:
- [ ] Runlog generated successfully
- [ ] Runlog contains commit SHA
- [ ] Runlog contains all artifact checksums
- [ ] Runlog contains gate confirmations

**Runlog Path**: `docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json`

### Step 5: Verify Checksums

```bash
# Verify checksums match manifest
node -e "
const fs = require('fs');
const crypto = require('crypto');
const manifest = JSON.parse(fs.readFileSync('data/outputs/project_prov0-01/render_manifest.json', 'utf8'));

console.log('Checksum Verification:');
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

**Checksum Results**:
- [ ] video: ✅ / ❌
- [ ] thumbnail: ✅ / ❌
- [ ] captions: ✅ / ❌
- [ ] chapters: ✅ / ❌
- [ ] manifest: ✅ / ❌

**All checksums verified**: [ ] YES / [ ] NO

## Quality Control Review

### Video Playback Test

**Open video**: `data/outputs/project_prov0-01/output.mp4`

**Video Quality**:
- [ ] Video plays without errors
- [ ] No visual corruption or artifacts
- [ ] Resolution appears to be 1920x1080
- [ ] Frame rate smooth (30 fps)
- [ ] Duration matches expected: `___________________________`

**Audio Quality**:
- [ ] Audio plays without errors
- [ ] No audible clipping or distortion
- [ ] Volume consistent throughout
- [ ] Narration clear and intelligible
- [ ] Music/ducking acceptable (if present)

**Caption Synchronization**:
- [ ] Captions display during playback
- [ ] Captions synchronized with narration (±0.5s tolerance)
- [ ] Caption text readable and accurate
- [ ] No missing or duplicate captions

**Observations/Issues**:
```
[Record any quality issues here with timecodes]
```

### Chapter Verification

**Open chapters**: `data/outputs/project_prov0-01/chapters_en.json`

```bash
cat data/outputs/project_prov0-01/chapters_en.json | jq .
```

**Chapter Quality**:
- [ ] Valid JSON format
- [ ] Chapter count reasonable: `___________________________`
- [ ] Chapter titles descriptive
- [ ] Timestamps align with video content
- [ ] All major sections covered

**Chapter List**:
```
[Copy chapter titles and timestamps here]
```

### Manifest Verification

**Open manifest**: `data/outputs/project_prov0-01/render_manifest.json`

```bash
cat data/outputs/project_prov0-01/render_manifest.json | jq .
```

**Manifest Quality**:
- [ ] Valid JSON format
- [ ] All artifacts listed
- [ ] All checksums present
- [ ] Render settings documented
- [ ] Profile confirmed as "pro_v0"
- [ ] Language confirmed as "en"

**Render Settings Captured**:
- Target LUFS: `___________________________`
- True Peak: `___________________________`
- Loudness Range: `___________________________`

## QC Verdict

### Technical Quality: [ ] PASS / [ ] FAIL

**Blockers** (if FAIL):
```
[List specific technical issues that prevent publishing]
```

### Content Quality: [ ] PASS / [ ] FAIL

**Blockers** (if FAIL):
```
[List specific content issues that prevent publishing]
```

### Governance Compliance: [ ] PASS / [ ] FAIL

**Blockers** (if FAIL):
```
[List any governance violations]
```

### Overall Verdict: [ ] PASS / [ ] FAIL / [ ] CONDITIONAL PASS

**Publishable**: [ ] YES / [ ] NO / [ ] WITH MODIFICATIONS

**Rationale**:
```
[Explain the verdict]
```

## Post-Execution Tasks

### Documentation

- [ ] Fill in `docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md` with QC findings
- [ ] Update `PRO_VIDEO_V0_FIRST_VIDEO_SUMMARY.md` with actual results
- [ ] Copy artifact checksums from runlog to review document

### Release Finalization

- [ ] Commit all documentation:
  ```bash
  git add docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md
  git add docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json
  git add PRO_VIDEO_V0_FIRST_VIDEO_SUMMARY.md
  git add FIRST_FULL_E2E_RUN.md
  git add FIRST_FULL_E2E_RUN.json
  git commit -m "release: ProV0-01 first professional video production run"
  ```

- [ ] Tag release:
  ```bash
  git tag -a prov0-01 -m "ProV0-01: First Professional Video v0 production run"
  git push origin prov0-01
  ```

### Archive Creation

- [ ] Create release archive:
  ```bash
  mkdir -p releases/prov0-01
  cp data/outputs/project_prov0-01/* releases/prov0-01/
  cp docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md releases/prov0-01/
  cp docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json releases/prov0-01/
  tar -czf releases/prov0-01.tar.gz releases/prov0-01/
  sha256sum releases/prov0-01.tar.gz > releases/prov0-01.tar.gz.sha256
  ```

- [ ] Archive checksum: `___________________________`

## Sign-Off

**Operator**: `___________________________`  
**Date**: `___________________________`  
**Time**: `___________________________`  
**Signature/Approval**: `___________________________`

---

**Checklist Version**: 1.0  
**Template**: PROV0_01_EXECUTION_CHECKLIST.md  
**Status**: [ ] COMPLETE / [ ] INCOMPLETE / [ ] FAILED
