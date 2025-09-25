# Technical Debt Tracker

This document tracks known technical debt, TODOs, and improvement opportunities in the MOBIUS Games pipeline.

## High Priority Issues

### Authentication & Security
- **TODO**: Implement proper session-based authentication in `src/api/index.js`
  - **Current**: API key validation skipped in development 
  - **Impact**: Security risk for production deployment
  - **Owner**: Backend team
  - **Sprint**: Q1 2024
  - **Effort**: Medium (2-3 days)

### Error Handling & Exit Codes
- **TODO**: Map distinct exit codes (0, 2, 3) to CI job outcomes
  - **Current**: Inconsistent exit codes across scripts
  - **Impact**: CI job interpretation unclear
  - **Files**: `scripts/check_golden.js`, `scripts/generate_golden.js`
  - **Owner**: DevOps team
  - **Sprint**: Current sprint
  - **Effort**: Small (4-6 hours)

### Logging & Observability
- **COMPLETED**: ✅ Structured logging with winston (file rotation configured)
- **TODO**: Add smoke test to verify no console.log in production mode
  - **Impact**: Production log pollution
  - **Owner**: QA team
  - **Sprint**: Current sprint
  - **Effort**: Small (2-3 hours)

## Medium Priority Issues

### Code Quality & Linting
- **IN PROGRESS**: ESLint migration - currently warnings only
- **TODO**: Address ESLint warnings flagged as TODOs (>3 items require issues)
  - **Files**: Multiple JavaScript files across project
  - **Owner**: Development team
  - **Sprint**: Q1 2024
  - **Effort**: Large (ongoing)

### Media Processing
- **TODO**: Improve error handling in FFmpeg operations
  - **Files**: `scripts/check_golden.js`, `scripts/generate_golden.js`
  - **Impact**: Pipeline failures not gracefully handled
  - **Owner**: Media engineering team
  - **Sprint**: Q2 2024
  - **Effort**: Medium (1-2 days)

### Testing Infrastructure
- **TODO**: Add integration tests for golden file validation
  - **Current**: Limited test coverage for media validation pipeline
  - **Impact**: Risk of regression in media processing
  - **Owner**: QA team
  - **Sprint**: Q1 2024
  - **Effort**: Large (1-2 weeks)

## Low Priority Issues

### Documentation
- **TODO**: Document CI artifact retention policy and size limits
  - **Impact**: Potential CI artifact bloat
  - **Owner**: DevOps team
  - **Sprint**: Q2 2024
  - **Effort**: Small (1-2 hours)

### Performance Optimization  
- **TODO**: Optimize golden file comparison algorithms
  - **Files**: `scripts/check_golden.js`
  - **Impact**: Slower CI pipeline execution
  - **Owner**: Performance team
  - **Sprint**: Future
  - **Effort**: Medium (3-5 days)

### Code Organization
- **TODO**: Refactor utility functions into shared modules
  - **Files**: Common functions duplicated across `scripts/`
  - **Impact**: Code duplication, maintenance overhead
  - **Owner**: Architecture team
  - **Sprint**: Future
  - **Effort**: Medium (1-2 days)

## Tracking Methodology

**Priority Levels:**
- **High**: Blocking production readiness or significant risk
- **Medium**: Impacts development velocity or maintainability  
- **Low**: Nice-to-have improvements

**Effort Estimates:**
- **Small**: <1 day
- **Medium**: 1-5 days
- **Large**: >1 week

**Status Updates:**
- Issues should be reviewed monthly
- Completed items marked with ✅
- New issues added with proper categorization
- Sprint assignments reviewed quarterly

## Contact & Ownership

- **Backend Team**: Authentication, API security
- **DevOps Team**: CI/CD, deployment, monitoring
- **Media Engineering**: FFmpeg, golden file validation
- **QA Team**: Testing infrastructure, quality gates
- **Architecture Team**: Code organization, refactoring

Last updated: $(date)
Next review: $(date -d "+1 month")