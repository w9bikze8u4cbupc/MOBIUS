## PR Checklist for MOBIUS Video Generation Pipeline

### 📝 **Change Description**
<!-- Brief summary of what this PR does -->

### 🔍 **Review Checklist**
<!-- Reviewers: Please tick these items as you complete them -->

#### **Code Quality & Standards**
- [ ] Code follows project TypeScript/JavaScript conventions
- [ ] No hardcoded values - uses configuration/environment variables where appropriate
- [ ] Error handling implemented for new code paths
- [ ] Console logs use appropriate levels (debug/info/warn/error)

#### **Testing & Validation**
- [ ] Unit tests added/updated for new functionality
- [ ] All existing tests pass (`npm test`)
- [ ] Golden test artifacts updated if video output changed
- [ ] Cross-platform compatibility verified (if applicable)

#### **Video Pipeline Specific**
- [ ] FFmpeg commands tested and working correctly
- [ ] Audio compliance checks pass (EBUR-128 standards)
- [ ] Video container format validation passes
- [ ] Preview generation works end-to-end
- [ ] No memory leaks in video processing

#### **CI/CD & Deployment**
- [ ] All GitHub Actions workflows pass
- [ ] Artifacts upload successfully
- [ ] Branch protection rules satisfied
- [ ] No sensitive data committed (API keys, tokens, etc.)

#### **Documentation**
- [ ] README updated if new features/usage patterns added
- [ ] Code comments added for complex video processing logic
- [ ] API documentation updated (if applicable)

### 🎯 **Testing Instructions**
<!-- How to test this change locally -->
1. `npm install`
2. `npm run test`
3. `npm run render:preview` (if applicable)
4. Verify artifacts in `out/` directory

### 🔗 **Related Issues**
<!-- Link to GitHub issues this PR addresses -->
Closes #<!-- issue number -->

### 📊 **Performance Impact**
<!-- Any performance implications of this change -->
- [ ] No significant performance regression
- [ ] Memory usage tested for large video files
- [ ] Rendering time benchmarks acceptable

### ⚠️ **Breaking Changes**
<!-- List any breaking changes -->
- [ ] No breaking changes
- [ ] Breaking changes documented and migration path provided

### 🎬 **Preview Artifacts**
<!-- Links to generated previews/artifacts (will be populated by CI) -->
- Preview video: <!-- CI will add artifact links -->
- Audio analysis: <!-- CI will add artifact links -->
- Cross-platform test results: <!-- CI will add artifact links -->