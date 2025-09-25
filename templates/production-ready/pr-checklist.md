# Pull Request Checklist

## Pre-submission Checks
- [ ] **Code Quality**
  - [ ] All linting checks pass (`npm run lint`)
  - [ ] No new TypeScript errors
  - [ ] Code follows existing patterns and conventions

- [ ] **Testing**
  - [ ] Unit tests pass (`npm test`)
  - [ ] Golden preview checks pass on all platforms
  - [ ] Audio compliance gates pass (EBU R128)
  - [ ] Container format validation passes

- [ ] **Build & Pipeline**
  - [ ] CI builds successfully on all platforms (Ubuntu, macOS, Windows)
  - [ ] Video rendering pipeline works end-to-end
  - [ ] FFmpeg/FFprobe integration functions correctly
  - [ ] Artifacts are generated and uploaded properly

## Documentation & Communication
- [ ] **Documentation Updated**
  - [ ] README.md reflects any new features or changes
  - [ ] API documentation updated if endpoints changed
  - [ ] Script usage documentation updated if needed

- [ ] **Change Description**
  - [ ] PR title follows conventional commit format
  - [ ] Description clearly explains what changed and why
  - [ ] Breaking changes are clearly documented
  - [ ] Dependencies/environment changes noted

## Security & Performance
- [ ] **Security Review**
  - [ ] No hardcoded secrets or API keys
  - [ ] Input validation appropriate for new endpoints
  - [ ] File upload restrictions maintained
  - [ ] CORS policies remain appropriate

- [ ] **Performance Impact**
  - [ ] No significant performance regression
  - [ ] Memory usage patterns checked for large files
  - [ ] Video processing performance benchmarked

## Production Readiness
- [ ] **Deployment Considerations**
  - [ ] Environment variables documented
  - [ ] Database migrations included if needed
  - [ ] Backward compatibility maintained
  - [ ] Rollback plan considered

- [ ] **Monitoring & Observability**
  - [ ] Appropriate logging added
  - [ ] Error handling covers edge cases
  - [ ] Metrics/telemetry considered

## Final Verification
- [ ] **Manual Testing**
  - [ ] End-to-end workflow tested manually
  - [ ] UI changes tested across browsers (if applicable)
  - [ ] Mobile responsiveness checked (if applicable)
  - [ ] File upload/processing tested with various inputs

- [ ] **Review Readiness**
  - [ ] All CI checks passing
  - [ ] Commits are squashed/organized appropriately
  - [ ] Branch is up to date with target branch
  - [ ] Ready for reviewer feedback

---

**Reviewer Notes:**
- [ ] Code review completed
- [ ] Architecture/design reviewed
- [ ] Security implications considered
- [ ] Performance impact assessed
- [ ] Documentation adequacy verified