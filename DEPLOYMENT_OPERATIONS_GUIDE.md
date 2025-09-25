# MOBIUS Complete Deployment Operations Guide

> **Quick Access:** [Cheat Sheet](#deployment-quick-reference) | [Notification Templates](#notification-templates) | [Troubleshooting](#troubleshooting)

---

## Deployment Quick Reference

### Essential Commands

#### Core Deployment Pipeline
```bash
# Install dependencies
npm ci

# Build client (if needed)
cd client && npm run build && cd ..

# Run tests
npm test

# Render preview videos (when files exist)
npm run render:proxy

# Generate golden baselines
npm run golden:approve

# Validate against baselines
npm run golden:check
```

#### Golden Baseline Operations
```bash
# Update baselines for specific games
npm run golden:update:sushi
npm run golden:update:loveletter

# Check specific game baselines
npm run golden:check:sushi
npm run golden:check:loveletter

# Generate custom baseline
node scripts/generate_golden.js --game "GameName" --in "out/game/preview.mp4" --out "tests/golden/game" --frames "5,10,20"

# Check with custom settings
node scripts/check_golden.js --game "GameName" --in "out/game/preview.mp4" --golden "tests/golden/game" --frames "5,10,20" --ssim "0.995" --lufs_tol "1.0" --tp_tol "1.0"
```

#### Video Processing
```bash
# Note: Some scripts referenced in package.json are not yet implemented
# Available commands:
npm run render:proxy       # Basic preview rendering
npm run golden:update      # Generate all baselines
npm run golden:check       # Check all baselines
npm run golden:approve     # Update sushi-go and love-letter baselines

# Direct script usage:
node scripts/generate_golden.js --game "GameName" --in "input.mp4" --out "tests/golden/game"
node scripts/check_golden.js --game "GameName" --in "input.mp4" --golden "tests/golden/game"

# Audio compliance check (when preview exists)
ffmpeg -hide_banner -nostats -i out/preview_with_audio.mp4 -filter_complex ebur128 -f null - 2> artifacts/preview_with_audio_ebur128.txt
```

### Key File Locations

#### Configuration
- `package.json` - Main project config & scripts
- `client/package.json` - React client config
- `.github/workflows/` - CI/CD workflows

#### Input/Output
- `out/` - Rendered video outputs
- `artifacts/` - Build artifacts & reports
- `tests/golden/` - Golden baseline files
- `uploads/` - API upload directory
- `src/api/uploads/MobiusGames/` - Game data storage

#### Scripts
- `scripts/generate_golden.js` - Generate baselines ✓
- `scripts/check_golden.js` - Validate against baselines ✓
- `scripts/compile-shotlist.mjs` - Shot list compilation (referenced but not implemented)
- `scripts/render-ffmpeg.mjs` - Video rendering (referenced but not implemented)

### Quality Gates

#### Audio Standards
- LUFS tolerance: ±1.0
- True Peak tolerance: ±1.0  
- EBU R128 compliance required

#### Video Standards
- SSIM threshold: ≥0.995
- Frame comparison at: 5s, 10s, 20s
- Container format validation

#### Platform Support
- **Ubuntu**: Primary testing platform
- **macOS**: Full FFmpeg support required
- **Windows**: PowerShell + Chocolatey FFmpeg

---

## Notification Templates

### T-30: Pre-deployment

**Slack:**
```
🚀 **MOBIUS Deployment Starting** - T-30 minutes
Repository: `w9bikze8u4cbupc/MOBIUS`
Release: `RELEASE_TAG`
Environment: `PRODUCTION`

**Pre-flight checklist:**
✅ Dependencies installed (`npm ci`)  
🔄 Tests running (`npm test`)
🔄 Golden baselines checking
🔄 FFmpeg verification

📊 **Status Dashboard:** <GITHUB_ACTIONS_URL>
🔗 **PR:** <PR_LINK>
👤 **Deploy Lead:** <@DEPLOY_LEAD>

#mobius #deployment #pre-flight
```

### T-5: Final Validation

**Slack:**
```
⚡ **MOBIUS Deployment** - T-5 minutes - Final validation
Repository: `w9bikze8u4cbupc/MOBIUS`

**Validation Status:**
✅ Client build completed (`cd client && npm run build`)
✅ Render pipeline tested (`npm run render:proxy`)  
✅ Audio compliance verified
✅ Artifacts generated

**Multi-platform CI:**
🐧 Linux: PASSING
🍎 macOS: PASSING  
🪟 Windows: PASSING

**Ready for deployment** ✅
👤 **Deploy Lead:** <@DEPLOY_LEAD>

#mobius #deployment #go-live
```

### T-0: Go Live

**Slack:**
```
🎬 **MOBIUS DEPLOYMENT LIVE** - T-0
Repository: `w9bikze8u4cbupc/MOBIUS`
Release: `RELEASE_TAG`

**Deployment initiated:**
🔄 Push to main branch completed
🔄 GitHub Actions workflows triggered
🔄 Multi-platform builds running (Ubuntu, macOS, Windows)

**Monitoring:**
📊 CI Dashboard: <GITHUB_ACTIONS_URL>
📈 Artifact uploads: IN PROGRESS
🔍 Quality gates: MONITORING

**Next check:** T+15 minutes
👤 **Deploy Lead:** <@DEPLOY_LEAD>

#mobius #deployment #live
```

### T+15: Post-deploy Verification

**Slack:**
```
✅ **MOBIUS Deployment** - T+15 - Post-deploy verification
Repository: `w9bikze8u4cbupc/MOBIUS`

**Platform Status:**
🐧 Ubuntu: ✅ PASSED (artifacts uploaded)
🍎 macOS: ✅ PASSED (artifacts uploaded)  
🪟 Windows: ✅ PASSED (artifacts uploaded)

**Quality Gates:**
🎵 Audio compliance: ✅ PASSED
🎬 Video quality (SSIM ≥0.995): ✅ PASSED
🎯 Golden baseline comparison: ✅ PASSED

**Artifacts:**
📁 Preview videos: GENERATED
📊 Quality reports: AVAILABLE
🔍 JUnit test results: PASSED

👤 **Deploy Lead:** <@DEPLOY_LEAD>

#mobius #deployment #success
```

### T+60: Deployment Complete

**Slack:**
```
🎯 **MOBIUS Deployment Complete** - T+60 - Final status
Repository: `w9bikze8u4cbupc/MOBIUS`
Release: `RELEASE_TAG` 

**Final Status:** 🟢 **SUCCESSFUL**

**Summary:**
✅ All platforms deployed successfully
✅ Quality gates passed across all environments
✅ Artifacts retained and accessible
✅ No regression issues detected
✅ Golden baselines up to date

**Post-deployment actions:**
📈 Monitoring active for delayed failures
🔄 Baseline validation complete
📁 Artifact retention: 90 days
📊 Performance metrics: STABLE

**Deployment complete.** System ready for operations.
👤 **Deploy Lead:** <@DEPLOY_LEAD>

#mobius #deployment #complete
```

---

## Deployment Workflow Timeline

### T-30: Pre-deployment
1. Ensure all dependencies installed: `npm ci`
2. Run tests: `npm test` (basic jest setup)
3. Check golden baselines: `npm run golden:check` (if videos exist)
4. Verify FFmpeg installation: `ffmpeg -version`

### T-5: Final validation
1. Build client: `cd client && npm run build` (React app)
2. Test render pipeline: `npm run render:proxy` (if prerequisites met)
3. Validate audio compliance: Check `artifacts/preview_with_audio_ebur128.txt`
4. Confirm artifact generation: Verify `artifacts/` directory

### T-0: Deploy
1. Push to main branch (triggers CI)  
2. Monitor GitHub Actions: 3 OS builds (Ubuntu, macOS, Windows)
3. Verify all workflow steps pass
4. Check artifact uploads complete

### T+15: Post-deploy verification
1. Check CI status across all platforms
2. Validate generated preview videos
3. Verify audio/video quality gates passed
4. Confirm golden baseline comparisons passed

### T+60: Monitoring
1. Review any quality regression reports
2. Check artifact retention (uploaded videos)
3. Monitor for any delayed failures
4. Update baselines if new content deployed

---

## Troubleshooting

### Common Issues
```bash
# FFmpeg not found
# Ubuntu: sudo apt-get install ffmpeg
# macOS: brew install ffmpeg  
# Windows: choco install ffmpeg

# Golden baseline mismatch
npm run golden:approve  # Updates all baselines

# Audio compliance failure
# Check: artifacts/preview_with_audio_ebur128.txt
# Regenerate: npm run render:proxy

# Missing artifacts
mkdir -p out artifacts
npm run render:proxy
```

### Emergency Recovery
```bash
# Force regenerate all baselines
npm run golden:approve

# Clean rebuild
rm -rf node_modules out artifacts
npm ci
npm test

# Platform-specific baseline reset
GOLDEN_PER_OS=1 npm run golden:update
```

### Incident Response Templates

**Deployment Failure:**
```
🚨 **MOBIUS DEPLOYMENT FAILURE** 
Repository: `w9bikze8u4cbupc/MOBIUS`
Release: `RELEASE_TAG`

**Failed Stage:** `STAGE_NAME`
**Platform:** `PLATFORM` (Ubuntu/macOS/Windows)
**Error:** `ERROR_MESSAGE`

**Immediate Actions:**
1️⃣ Deployment halted
2️⃣ Rollback initiated  
3️⃣ Incident response team notified

**War Room:** <TEAMS_CHANNEL_OR_MEET_LINK>
🚨 **All hands:** <@ops-team>

#mobius #incident #deployment-failure
```

---

## Environment Variables

- `GOLDEN_PER_OS=1` - Use platform-specific baselines
- `OUTPUT_DIR` - Override default output directory
- `PORT` - API server port (default: 5001)
- `OPENAI_API_KEY` - OpenAI API access
- `IMAGE_EXTRACTOR_API_KEY` - Image processing API

## Contact & Escalation

- **Repository**: `w9bikze8u4cbupc/MOBIUS`
- **CI Dashboard**: GitHub Actions tab
- **Artifacts**: Check workflow runs for downloads
- **Logs**: Available in GitHub Actions job details

---

## Template Placeholders

Replace these with actual values when using templates:

- `RELEASE_TAG` - Git tag or commit hash
- `GITHUB_ACTIONS_URL` - Link to GitHub Actions dashboard
- `PR_LINK` - Link to the pull request  
- `@DEPLOY_LEAD` - Slack/Teams handle of deployment lead
- `@ops-team` - Operations team notification group
- `PLATFORM` - ubuntu-latest, macos-latest, or windows-latest
- `STAGE_NAME` - Specific build/deployment stage that failed
- `ERROR_MESSAGE` - Brief error description

---
*MOBIUS Complete Deployment Operations Guide*  
*Generated for w9bikze8u4cbupc/MOBIUS Game Tutorial Video Generator*  
*Last updated: September 2024*