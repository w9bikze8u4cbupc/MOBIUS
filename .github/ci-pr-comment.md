# 🤖 MOBIUS CI Results

## 📊 Build Summary

| Platform | Status | Build Time | Artifacts |
|----------|--------|------------|-----------|
| 🐧 Ubuntu | {{UBUNTU_STATUS}} | {{UBUNTU_BUILD_TIME}} | [📁 Artifacts]({{UBUNTU_ARTIFACTS_URL}}) |
| 🍎 macOS | {{MACOS_STATUS}} | {{MACOS_BUILD_TIME}} | [📁 Artifacts]({{MACOS_ARTIFACTS_URL}}) |
| 🪟 Windows | {{WINDOWS_STATUS}} | {{WINDOWS_BUILD_TIME}} | [📁 Artifacts]({{WINDOWS_ARTIFACTS_URL}}) |

**Overall Status**: {{OVERALL_STATUS}}
**Total Pipeline Time**: {{TOTAL_PIPELINE_TIME}}

## 🎬 Video Processing Results

### 🎥 Preview Generation
- **Status**: {{PREVIEW_STATUS}}
- **Output**: [`preview_with_audio.mp4`]({{PREVIEW_URL}}) ({{PREVIEW_FILE_SIZE}})
- **Duration**: {{VIDEO_DURATION}}
- **Resolution**: {{VIDEO_RESOLUTION}}
- **Framerate**: {{VIDEO_FRAMERATE}}

### 🔊 Audio Compliance
| Metric | Value | Standard | Status |
|--------|-------|----------|--------|
| **Integrated Loudness (LUFS)** | {{LUFS_VALUE}} dB | -23.0 ±1.0 dB | {{LUFS_STATUS}} |
| **Loudness Range (LU)** | {{LU_VALUE}} LU | 7.0-20.0 LU | {{LU_STATUS}} |
| **True Peak (dBTP)** | {{TRUE_PEAK_VALUE}} dBTP | ≤ -1.0 dBTP | {{TRUE_PEAK_STATUS}} |

{{#if AUDIO_COMPLIANCE_FAILED}}
⚠️ **Audio compliance issues detected**. Please review the [audio analysis report]({{AUDIO_REPORT_URL}}).
{{/if}}

## 🧪 Test Results

### Unit Tests
- **Total Tests**: {{TOTAL_TESTS}}
- **Passed**: {{PASSED_TESTS}} ✅
- **Failed**: {{FAILED_TESTS}} ❌
- **Skipped**: {{SKIPPED_TESTS}} ⏭️
- **Coverage**: {{TEST_COVERAGE}}%

{{#if FAILED_TESTS_LIST}}
#### ❌ Failed Tests
{{#each FAILED_TESTS_LIST}}
- `{{name}}`: {{error_message}}
{{/each}}
{{/if}}

### 🏆 Golden Test Validation
| Game | SSIM Score | Audio Match | Status |
|------|------------|-------------|---------|
| Sushi Go | {{SUSHI_SSIM}} | {{SUSHI_AUDIO_MATCH}} | {{SUSHI_STATUS}} |
| Love Letter | {{LOVE_LETTER_SSIM}} | {{LOVE_LETTER_AUDIO_MATCH}} | {{LOVE_LETTER_STATUS}} |
| Hanamikoji | {{HANAMIKOJI_SSIM}} | {{HANAMIKOJI_AUDIO_MATCH}} | {{HANAMIKOJI_STATUS}} |

{{#if GOLDEN_TESTS_FAILED}}
⚠️ **Golden test mismatches detected**. Video output may have changed. Review [comparison artifacts]({{GOLDEN_COMPARISON_URL}}).
{{/if}}

## 🔧 Technical Details

### 🛠️ Build Environment
- **Node.js**: {{NODE_VERSION}}
- **FFmpeg**: {{FFMPEG_VERSION}}
- **Python**: {{PYTHON_VERSION}}
- **Commit SHA**: [`{{COMMIT_SHA}}`]({{COMMIT_URL}})
- **Branch**: {{BRANCH_NAME}}

### 📦 Dependencies
- **Production**: {{PROD_DEPS_COUNT}} packages
- **Development**: {{DEV_DEPS_COUNT}} packages
- **Vulnerabilities**: {{SECURITY_ISSUES}} {{#if SECURITY_ISSUES}}⚠️{{else}}✅{{/if}}

### 🎮 Game Processing Stats
- **Components Extracted**: {{COMPONENTS_COUNT}}
- **AI API Calls**: {{AI_API_CALLS}}
- **Processing Time per Game**: {{AVG_PROCESSING_TIME}}
- **Memory Peak Usage**: {{PEAK_MEMORY_MB}} MB

## 📁 Downloadable Artifacts

### 🎥 Video Outputs
- [📹 Preview Video (MP4)]({{PREVIEW_VIDEO_URL}}) - {{PREVIEW_SIZE}}
- [🎵 Audio Analysis]({{AUDIO_ANALYSIS_URL}}) - {{AUDIO_ANALYSIS_SIZE}}
- [🖼️ Frame Extracts]({{FRAMES_ZIP_URL}}) - {{FRAMES_SIZE}}

### 📊 Reports & Logs
- [📋 Test Report (JUnit)]({{JUNIT_REPORT_URL}})
- [📈 Coverage Report]({{COVERAGE_REPORT_URL}})
- [🔍 Build Logs]({{BUILD_LOGS_URL}})
- [⚙️ Provenance Data]({{PROVENANCE_URL}})

### 🎯 Quality Gates
- [🔊 EBU R128 Analysis]({{EBUR128_REPORT_URL}})
- [📦 Container Validation]({{CONTAINER_REPORT_URL}})
- [🏆 Golden Test Diffs]({{GOLDEN_DIFFS_URL}})

## 🚀 Deployment Readiness

{{#if DEPLOYMENT_READY}}
✅ **This build is ready for deployment**
- All tests passing
- Audio compliance verified
- No security vulnerabilities
- Golden tests validated
{{else}}
❌ **This build is NOT ready for deployment**
{{#if BLOCKING_ISSUES}}
**Blocking Issues:**
{{#each BLOCKING_ISSUES}}
- {{description}} ([Details]({{url}}))
{{/each}}
{{/if}}
{{/if}}

## 📝 Next Steps

{{#if DEPLOYMENT_READY}}
1. 🔍 **Code Review**: Awaiting team review
2. 🚀 **Staging Deploy**: Ready for staging environment
3. ✅ **Production Deploy**: Can proceed after approval
{{else}}
1. 🔧 **Fix Issues**: Address failing tests and compliance issues
2. 🔄 **Re-run Pipeline**: Push fixes to trigger new build
3. 📋 **Review Logs**: Check [detailed logs]({{DETAILED_LOGS_URL}}) for debugging
{{/if}}

---

<details>
<summary>🤖 <strong>CI Configuration</strong></summary>

```yaml
Triggered by: {{TRIGGER_EVENT}}
Workflow: {{WORKFLOW_NAME}}
Run ID: {{RUN_ID}}
Actor: {{GITHUB_ACTOR}}
```

</details>

<details>
<summary>📊 <strong>Detailed Metrics</strong></summary>

```json
{
  "build_metrics": {
    "total_time": "{{TOTAL_PIPELINE_TIME}}",
    "parallel_jobs": {{PARALLEL_JOBS}},
    "cache_hit_rate": "{{CACHE_HIT_RATE}}%"
  },
  "video_metrics": {
    "processing_time": "{{VIDEO_PROCESSING_TIME}}",
    "compression_ratio": "{{COMPRESSION_RATIO}}",
    "quality_score": {{QUALITY_SCORE}}
  },
  "resource_usage": {
    "peak_memory": "{{PEAK_MEMORY_MB}} MB",
    "disk_usage": "{{DISK_USAGE_GB}} GB",
    "cpu_time": "{{CPU_TIME_SECONDS}}s"
  }
}
```

</details>

---

**🕐 Generated**: {{TIMESTAMP}} UTC | **🔗 Pipeline**: [View Full Results]({{PIPELINE_URL}})