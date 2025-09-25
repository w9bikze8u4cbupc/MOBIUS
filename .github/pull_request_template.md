# MOBIUS Pull Request Checklist

## 📋 Pre-Submission Verification

### Code Quality & Standards
- [ ] **Code Review**: All changes follow project coding standards and patterns
- [ ] **Documentation**: Updated relevant documentation (README, inline comments, API docs)
- [ ] **Dependencies**: No unnecessary dependencies added; existing ones updated only if required
- [ ] **Security**: No secrets, API keys, or sensitive data committed to repository

### Testing & Validation
- [ ] **Unit Tests**: All new functionality covered by tests
- [ ] **Existing Tests**: All existing tests pass locally (`npm test`)
- [ ] **Cross-Platform**: Changes tested on target platforms (Windows/macOS/Ubuntu if applicable)
- [ ] **Build Process**: Project builds successfully (`npm run build --if-present`)

### MOBIUS-Specific Checks
- [ ] **Video Pipeline**: Changes to video processing tested with sample rulebooks
- [ ] **Audio Compliance**: Audio output meets EBUR-128 standards (LUFS: -23.0 ±1.0 dB)
- [ ] **Golden Tests**: Updated golden test artifacts if video/audio output changed
- [ ] **Component Extraction**: AI component identification working correctly for new games
- [ ] **FFmpeg Integration**: Video rendering pipeline functions across all target platforms

### Performance & Resources
- [ ] **Memory Usage**: No memory leaks introduced in long-running processes
- [ ] **Processing Time**: Video generation time remains within acceptable limits
- [ ] **File Sizes**: Output artifacts are reasonably sized and optimized
- [ ] **Resource Cleanup**: Temporary files and processes properly cleaned up

### UI/UX (if applicable)
- [ ] **Frontend Changes**: React components render correctly across browsers
- [ ] **Responsive Design**: UI works on desktop and mobile viewports
- [ ] **User Experience**: Workflow remains intuitive and error messages are helpful
- [ ] **Accessibility**: Basic accessibility standards maintained

## 🎯 Change Summary

### Type of Change
- [ ] 🐛 Bug fix (non-breaking change fixing an issue)
- [ ] ✨ New feature (non-breaking change adding functionality)
- [ ] 💥 Breaking change (fix or feature causing existing functionality to change)
- [ ] 📝 Documentation only changes
- [ ] 🎨 Code style/formatting changes
- [ ] ♻️ Refactoring (no functional changes)
- [ ] ⚡ Performance improvements
- [ ] 🧪 Test additions or modifications

### Areas Modified
- [ ] 🎮 Game rule processing (`src/api/`)
- [ ] 🎬 Video generation pipeline (`scripts/`)
- [ ] 🎨 Frontend interface (`client/`)
- [ ] 🔊 Audio processing and compliance
- [ ] 🏗️ Build and CI configuration
- [ ] 📦 Dependencies and package management
- [ ] 🧪 Testing infrastructure
- [ ] 📚 Documentation and examples

## 📋 Deployment Considerations

- [ ] **Database Migrations**: Schema changes documented and backward compatible
- [ ] **Environment Variables**: New config requirements documented
- [ ] **Third-party APIs**: External service dependencies noted (OpenAI, ElevenLabs, etc.)
- [ ] **File System**: Disk space and permissions requirements considered
- [ ] **Rollback Plan**: Changes can be safely reverted if issues arise

## 🧪 Testing Evidence

### Manual Testing Completed
- [ ] **End-to-End**: Full workflow from PDF upload to video generation
- [ ] **Error Handling**: Edge cases and error scenarios tested
- [ ] **Browser Compatibility**: Tested in Chrome, Firefox, Safari (if frontend changes)
- [ ] **Mobile Testing**: Mobile interface tested (if applicable)

### Automated Testing
- [ ] **CI Pipeline**: All CI checks pass
- [ ] **Code Coverage**: Test coverage maintained or improved
- [ ] **Performance Tests**: No regression in processing benchmarks
- [ ] **Golden Tests**: Video output quality validated against reference artifacts

## 💬 Additional Notes

<!-- Provide any additional context, screenshots, or details about the changes -->

### Screenshots (if UI changes)
<!-- Add screenshots here -->

### Breaking Changes
<!-- Detail any breaking changes and migration steps -->

### Performance Impact
<!-- Note any performance implications, positive or negative -->

### Rollback Instructions
<!-- If applicable, provide steps to safely revert these changes -->

---

**🚀 Ready for Review**: I confirm this PR meets all requirements and is ready for team review.