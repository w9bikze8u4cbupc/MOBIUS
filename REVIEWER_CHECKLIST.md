# PR Reviewer Checklist

## Required Verifications

- [ ] **ALLOWED_TOKEN** added to repo secrets (Settings → Secrets and variables → Actions)
- [ ] Lint & tests pass across Ubuntu/macOS/Windows matrix
- [ ] API smoke test passes on Ubuntu (public endpoint `/`)
- [ ] Authenticated health endpoint (`/health`) works with ALLOWED_TOKEN
- [ ] `staging-e2e` runs successfully on staging branch pushes
- [ ] No secrets committed to repository code
- [ ] Docker Compose staging configuration is valid
- [ ] FFmpeg installation works for video processing features
- [ ] Workflow triggers correctly on specified branches:
  - Push: `main`, `staging`, `**/feature/**`
  - Pull Request: `main`, `staging`
- [ ] Artifact collection works properly (test reports, logs, coverage)

## Architecture Review

- [ ] Multi-OS compatibility maintained
- [ ] Graceful handling of missing lint scripts (`--if-present`)
- [ ] Proper handling of empty test suites (`--passWithNoTests`)
- [ ] API server startup resilience for pre-existing issues
- [ ] Docker health checks configured properly
- [ ] Staging environment isolation

## Security Review

- [ ] No production credentials used in CI
- [ ] ALLOWED_TOKEN is properly scoped for CI testing only
- [ ] Docker containers use minimal attack surface
- [ ] No sensitive environment variables hardcoded

## Performance & Resource Usage

- [ ] CI timeout settings appropriate (1800 seconds)
- [ ] Concurrent job limits reasonable
- [ ] Artifact cleanup configured
- [ ] Docker image sizes optimized

## Approval Requirements

Required approvals from:
- [ ] **Backend Lead** (API changes, server configuration)
- [ ] **Ops** (CI/CD pipeline, Docker configuration) 
- [ ] **SRE** (Infrastructure, monitoring, reliability)

## Post-Merge Actions

- [ ] Monitor first few CI runs for any issues
- [ ] Verify ALLOWED_TOKEN secret is working in practice
- [ ] Check artifact storage and cleanup
- [ ] Update team documentation with new workflow details