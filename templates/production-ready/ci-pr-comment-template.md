## 🤖 CI Build Summary

### Build Status: {{BUILD_STATUS}}
**PR:** {{PR_NUMBER}} | **Branch:** `{{BRANCH_NAME}}` | **Commit:** `{{COMMIT_SHA}}`

---

### 📊 Test Results
| Platform | Unit Tests | Golden Checks | Audio Gates | Container Gates |
|----------|------------|---------------|-------------|-----------------|
| Ubuntu   | {{UBUNTU_UNIT}} | {{UBUNTU_GOLDEN}} | {{UBUNTU_AUDIO}} | {{UBUNTU_CONTAINER}} |
| macOS    | {{MACOS_UNIT}} | {{MACOS_GOLDEN}} | {{MACOS_AUDIO}} | {{MACOS_CONTAINER}} |
| Windows  | {{WINDOWS_UNIT}} | {{WINDOWS_GOLDEN}} | {{WINDOWS_AUDIO}} | {{WINDOWS_CONTAINER}} |

### 🎥 Generated Artifacts
- **Preview Video**: [📹 Download]({{PREVIEW_VIDEO_URL}})
- **Audio Analysis**: [📊 EBU R128 Report]({{AUDIO_REPORT_URL}})
- **FFProbe Data**: [🔍 Container Analysis]({{FFPROBE_DATA_URL}})
- **Golden Test Reports**: [📋 JUnit Results]({{JUNIT_REPORTS_URL}})
- **Debug Assets**: [🐛 Diff Images]({{DEBUG_ASSETS_URL}})

### 📈 Quality Metrics
- **Audio Loudness**: {{LUFS_VALUE}} LUFS (Target: -23.0 ±{{LUFS_TOLERANCE}})
- **True Peak**: {{TRUE_PEAK_VALUE}} dBTP (Max: -1.0 dBTP ±{{TP_TOLERANCE}})
- **Video Quality**: {{SSIM_SCORE}} SSIM (Threshold: {{SSIM_THRESHOLD}})
- **Container Format**: {{CONTAINER_FORMAT}}
- **Codec**: {{VIDEO_CODEC}} / {{AUDIO_CODEC}}

---

### 🚀 Next Steps

{{#if BUILD_SUCCESS}}
✅ **All checks passed!** This PR is ready for review.

**For Reviewers:**
- Review code changes and architecture decisions
- Check the generated preview video for quality
- Validate that golden tests accurately represent expected output
- Ensure breaking changes are properly documented

**For Deployment:**
```bash
# Deploy to staging
npm run deploy:staging

# Run integration tests
npm run test:integration

# Deploy to production (after approval)
npm run deploy:production
```
{{/if}}

{{#if BUILD_FAILURE}}
❌ **Build failed.** Please address the following issues:

{{#each FAILURES}}
- **{{platform}}**: {{issue}}
{{/each}}

**Common Solutions:**
- Check the build logs: [View Details]({{BUILD_LOG_URL}})
- Ensure all dependencies are properly installed
- Verify FFmpeg is available and properly configured
- Check that golden test baselines are up to date

**Re-run Commands:**
```bash
# Update golden baselines if expected
npm run golden:approve

# Re-run specific platform tests
npm run golden:check:{{PLATFORM}}

# Full CI simulation
npm run test-pipeline
```
{{/if}}

### 📋 Deployment Checklist
- [ ] Code review approved
- [ ] All CI checks passing
- [ ] Documentation updated
- [ ] Breaking changes communicated
- [ ] Database migrations ready (if applicable)
- [ ] Environment variables configured
- [ ] Monitoring alerts configured

---

*Generated automatically by GitHub Actions - [View Workflow]({{WORKFLOW_URL}}) | Last updated: {{TIMESTAMP}}*