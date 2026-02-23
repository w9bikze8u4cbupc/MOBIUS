# ProV0-01 Autonomous Execution Guide

**Version**: 1.0  
**Date**: 2026-02-23  
**Status**: Production-Ready

## Overview

The ProV0-01 autonomous execution harness enables deterministic, auditable "one command" production runs with:

- Automatic API server lifecycle management
- Non-interactive gate confirmations via explicit confirm-file
- Machine-verifiable objective QC
- Automated release dossier generation
- Full governance compliance (no implicit confirmations)

## Quick Start

### 1. Prepare Confirmation File

Copy the example and fill in operator details:

```bash
cp docs/releases/prov0-01-confirmations.example.json my-confirmations.json
```

Edit `my-confirmations.json`:
- Replace `[OPERATOR_NAME]` with your name
- Replace `[ISO_8601_TIMESTAMP]` with current timestamp
- Review each gate confirmation and ensure accuracy

### 2. Run ProV0-01

```bash
npm run release:prov0-01 -- \
  --pdf path/to/rulebook.pdf \
  --confirm-file my-confirmations.json \
  --bgg-url "https://boardgamegeek.com/boardgame/XXXXX"
```

### 3. Review Output

The harness will:
1. Start API server automatically
2. Run E2E commissioning with your confirmations
3. Verify artifacts with objective QC
4. Generate release dossier
5. Stop server and cleanup

Output files:
- `FIRST_FULL_E2E_RUN.json` - E2E execution report
- `FIRST_FULL_E2E_RUN.md` - Human-readable report
- `docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json` - Release runlog
- `docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md` - QC review (auto-filled)
- `data/outputs/project_prov0-01/objective_qc.json` - Objective QC report

## Confirmation File Schema

```json
{
  "version": "1.0",
  "projectId": "prov0-01",
  "confirm": [
    {
      "gateId": "confirm_metadata",
      "decision": "CONFIRM",
      "note": "Explanation of confirmation"
    }
  ],
  "ack": {
    "operator": "Operator Name",
    "timestamp": "2026-02-23T10:00:00Z",
    "notes": "Overall acknowledgment"
  }
}
```

### Required Gates

For a typical ProV0-01 run, you must confirm:

1. `confirm_metadata` - Game title, designer, publisher
2. `confirm_components` - Component list
3. `confirm_setup_logic` - Setup instructions (if applicable)
4. `confirm_turn_structure` - Turn structure (if applicable)
5. `confirm_ocr_hazards` - OCR quality (if applicable)
6. `confirm_script` - Tutorial script content
7. `confirm_component_images` - Extracted images (if HEPHAESTUS enabled)
8. `confirm_localization_fr` - French localization (if lang=fr)

### Governance Rules

- **Explicit Only**: Gates not in confirm-file will cause hard failure
- **No Bypass**: Cannot skip required gates
- **Recorded**: All confirmations are persisted in gate records
- **Auditable**: Operator name and timestamp recorded in runlog

## Objective QC

The verification stage performs machine checks:

### Video Verification
- ✅ File exists and is readable
- ✅ Video stream present (H.264)
- ✅ Audio stream present (AAC)
- ✅ Resolution: 1920x1080
- ✅ Frame rate: 30 fps
- ✅ Duration reasonable
- ⚠️ Loudness measurement (best-effort)
  - Target: -14 LUFS ±2
  - True peak: ≤ -1.0 dBTP

### Caption Verification
- ✅ Valid SRT format
- ✅ Non-empty cues
- ✅ Monotonic timestamps
- ⚠️ No overlapping cues

### Chapter Verification
- ✅ Valid JSON format
- ✅ Required fields present
- ✅ Sorted timestamps
- ✅ Descriptive titles

### Manifest Verification
- ✅ Valid JSON format
- ✅ All artifacts listed
- ✅ SHA-256 checksums match actual files
- ✅ Render settings documented

### Thumbnail Verification
- ✅ File exists
- ✅ Valid image format
- ✅ Reasonable dimensions

## Command Reference

### Full Production Run

```bash
npm run release:prov0-01 -- \
  --project-id prov0-01 \
  --pdf path/to/rulebook.pdf \
  --confirm-file confirmations.json \
  --bgg-url "https://boardgamegeek.com/boardgame/12345" \
  --lang en \
  --profile pro_v0 \
  --port 5001
```

### Dry Run (Test Wiring)

```bash
npm run release:prov0-01:dry
```

Validates harness wiring without actual processing:
- **Skips**: Server startup, PDF ingestion, E2E commissioning, rendering
- **Generates**: Stub documentation files only

**Expected Outputs**:
- `docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json`
  - Marked with `mode: "DRY_RUN"`
  - Status: `DRY_RUN_COMPLETE`
  - Objective QC: `SKIPPED_DRY_RUN`
  - Empty artifacts list
  
- `docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md`
  - Contains "DRY RUN" marker in title
  - Verdict: `DRY_RUN`
  - Warning: "No video artifacts were produced"
  - Lists expected artifacts for production mode

**Exit Code**: 0 if stub generation succeeds

**Use Cases**:
- Verify harness installation and script syntax
- Test ESM module loading on Windows/macOS/Linux
- Validate stub generation logic
- CI/CD smoke testing (fast, no server required)
- Pre-production wiring validation

**Verification**:
```bash
# Run dry-run and verify stubs
npm run smoke:prov0-01-dry
```

This runs the dry-run and then verifies:
- Both stub files exist
- Runlog has correct `mode: "DRY_RUN"` field
- Review contains "DRY RUN" markers
- No actual artifacts are present

### Verify Existing Artifacts

```bash
npm run release:verify -- data/outputs/project_prov0-01
```

Runs objective QC on existing output directory.

## Options

### Required (Non-Dry-Run)
- `--pdf <path>` - Path to rulebook PDF
- `--confirm-file <path>` - Path to confirmation JSON

### Optional
- `--project-id <id>` - Project ID (default: prov0-01)
- `--bgg-url <url>` - BoardGameGeek URL
- `--lang <en|fr>` - Language (default: en)
- `--profile <profile>` - Render profile (default: pro_v0)
- `--port <port>` - Server port (default: 5001)
- `--dry-run` - Dry run mode

## Troubleshooting

### Error: "Gate X requires confirmation but not provided"

**Cause**: Confirmation file missing required gate.

**Solution**: Add gate to confirm array in confirmation file:
```json
{
  "gateId": "confirm_metadata",
  "decision": "CONFIRM",
  "note": "Reviewed and accurate"
}
```

### Error: "Server did not become ready"

**Cause**: API server failed to start or port already in use.

**Solution**: 
- Check if port 5001 is available
- Use `--port` to specify different port
- Check server logs for startup errors

### Error: "Artifact verification failed"

**Cause**: Objective QC detected issues with artifacts.

**Solution**:
- Review `objective_qc.json` for specific errors
- Common issues:
  - Video file corrupted or unreadable
  - Checksum mismatch (file modified after manifest)
  - Invalid SRT or JSON format

### Warning: "Loudness measurement failed"

**Cause**: FFmpeg loudness analysis failed (non-fatal).

**Solution**:
- Verify FFmpeg is installed and in PATH
- Check video file is valid
- Loudness measurement is best-effort; warning does not fail QC

## CI/CD Integration

### GitHub Actions Example

```yaml
name: ProV0-01 Release

on:
  workflow_dispatch:
    inputs:
      pdf_path:
        description: 'Path to rulebook PDF'
        required: true
      bgg_url:
        description: 'BGG URL'
        required: false

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Prepare confirmation file
        run: |
          cp docs/releases/prov0-01-confirmations.example.json confirmations.json
          # Fill in operator and timestamp
          sed -i 's/\[OPERATOR_NAME\]/GitHub Actions/g' confirmations.json
          sed -i "s/\[ISO_8601_TIMESTAMP\]/$(date -u +%Y-%m-%dT%H:%M:%SZ)/g" confirmations.json
      
      - name: Run ProV0-01
        run: |
          npm run release:prov0-01 -- \
            --pdf ${{ github.event.inputs.pdf_path }} \
            --confirm-file confirmations.json \
            --bgg-url "${{ github.event.inputs.bgg_url }}"
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: prov0-01-release
          path: |
            data/outputs/project_prov0-01/
            docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json
            docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md
            FIRST_FULL_E2E_RUN.json
            FIRST_FULL_E2E_RUN.md
```

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  prov0-01-run.mjs (Orchestrator)            │
│  - Spawns API server                                        │
│  - Runs E2E commissioning                                   │
│  - Runs verification                                        │
│  - Generates dossier                                        │
│  - Cleanup                                                  │
└────────────┬────────────────────────────────────────────────┘
             │
             ├─► API Server (ephemeral)
             │   - NODE_ENV=test
             │   - SKIP_LEGACY_CHECK=true
             │   - Dynamic port
             │
             ├─► e2e-01-commission.mjs
             │   - --non-interactive
             │   - --confirm-file
             │   - Produces E2E report + artifacts
             │
             ├─► verify-pro-video-v0.mjs
             │   - ffprobe video/audio/thumbnail
             │   - Parse SRT/JSON
             │   - Verify checksums
             │   - Measure loudness (best-effort)
             │   - Produces objective_qc.json
             │
             └─► generate-pro-v0-runlog.mjs
                 - Combines E2E report + manifest + QC
                 - Produces runlog.json
                 - Auto-fills QC review template
```

### Data Flow

```
Input:
  - rulebook.pdf
  - confirmations.json
  - bgg-url (optional)

Processing:
  1. Server starts
  2. E2E ingestion → gates → script → render
  3. Artifacts produced (MP4/SRT/thumbnail/chapters/manifest)
  4. Objective QC verification
  5. Runlog generation
  6. QC review auto-fill
  7. Server stops

Output:
  - data/outputs/project_prov0-01/
    ├── output.mp4
    ├── captions_en.srt
    ├── thumbnail.jpg
    ├── chapters_en.json
    ├── render_manifest.json
    └── objective_qc.json
  - docs/releases/
    ├── PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json
    └── PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md
  - FIRST_FULL_E2E_RUN.json
  - FIRST_FULL_E2E_RUN.md
```

## Security Considerations

### Confirmation File Integrity

- Store confirmation files in version control
- Review changes to confirmation files in PRs
- Require approval for confirmation file changes
- Audit operator names and timestamps

### Server Isolation

- Server runs in ephemeral mode (test environment)
- No persistent state between runs
- Automatic cleanup on exit
- Port can be randomized for parallel runs

### Artifact Verification

- All artifacts checksummed (SHA-256)
- Checksums verified against manifest
- Objective QC catches corruption/tampering
- Runlog includes commit SHA for reproducibility

## Best Practices

### 1. Version Control Confirmations

```bash
# Create confirmation file for specific run
cp docs/releases/prov0-01-confirmations.example.json \
   confirmations/prov0-01-run-001.json

# Edit and commit
git add confirmations/prov0-01-run-001.json
git commit -m "release: ProV0-01 run 001 confirmations"
```

### 2. Review Before Execution

- Review PDF quality manually
- Verify BGG URL is correct
- Check confirmation file completeness
- Ensure operator name/timestamp accurate

### 3. Post-Execution Review

- Review objective QC report
- Complete subjective QC checklist
- Playback video start to finish
- Verify caption synchronization
- Check chapter timestamps

### 4. Archive Release

```bash
# Create release archive
mkdir -p releases/prov0-01-run-001
cp -r data/outputs/project_prov0-01/* releases/prov0-01-run-001/
cp docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_* releases/prov0-01-run-001/
cp FIRST_FULL_E2E_RUN.* releases/prov0-01-run-001/

# Create tarball
tar -czf releases/prov0-01-run-001.tar.gz releases/prov0-01-run-001/

# Calculate checksum
sha256sum releases/prov0-01-run-001.tar.gz > releases/prov0-01-run-001.tar.gz.sha256

# Commit and tag
git add releases/
git commit -m "release: ProV0-01 run 001 archive"
git tag -a prov0-01-run-001 -m "ProV0-01 run 001"
git push origin prov0-01-run-001
```

## Governance Compliance

### ✅ Explicit Confirmations

- All gates require explicit CONFIRM decision
- Operator name and timestamp recorded
- Notes explain rationale for each confirmation
- No auto-acceptance or implied confirmations

### ✅ Audit Trail

- Commit SHA recorded in runlog
- All confirmations persisted in gate records
- Objective QC results immutable
- Artifact checksums prevent tampering

### ✅ Fail-Safe Design

- Missing confirmations cause hard failure
- Invalid artifacts fail QC
- Checksum mismatches fail verification
- Server failures stop execution

### ✅ Reproducibility

- Exact commit SHA recorded
- All inputs documented
- Render settings captured
- Deterministic output (given same inputs)

---

**Documentation Version**: 1.0  
**Last Updated**: 2026-02-23  
**Status**: Production-Ready

