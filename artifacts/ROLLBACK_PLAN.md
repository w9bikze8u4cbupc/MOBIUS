# Rollback Plan for fetchJson Implementation

## Overview

This document provides a step-by-step rollback plan in case issues are discovered in production after merging the enhanced fetchJson implementation.

## When to Rollback

Rollback if you observe any of the following in production:

1. Increased error rates or failed API requests
2. Memory leaks or increased memory consumption
3. Performance degradation in API response times
4. Critical functionality broken due to migration issues
5. User complaints about missing or duplicate toast notifications

## Rollback Steps

### 1. Immediate Response (First 30 minutes)

1. **Confirm the Issue**
   - Check application logs for error patterns
   - Verify if issues correlate with the deployment timestamp
   - Confirm the problem is related to the fetchJson changes

2. **Notify Team**
   - Alert relevant team members about the potential issue
   - Pause any further deployments

### 2. Rollback Execution (30-60 minutes)

1. **Revert the Deployment**
   ```bash
   # Revert to the previous stable commit
   git revert <commit-hash> --no-commit
   git commit -m "Revert: Enhanced fetchJson implementation due to production issues"
   git push origin feat/space-invaders-golden-pass
   ```

2. **Restore axios Dependency**
   ```bash
   # Add axios back to package.json
   npm install axios@1.9.0
   # Or if using yarn
   yarn add axios@1.9.0
   ```

3. **Revert API Helper Modules**
   - Restore `client/src/api/extractBggHtml.js` to previous axios implementation
   - Restore `client/src/api/searchImages.js` to previous axios implementation
   - Update any other migrated API helpers

4. **Revert fetchJson Utility**
   - Restore `client/src/utils/fetchJson.js` to previous implementation
   - Remove any references to new fetchJson features

5. **Revert DevTestPage**
   - Restore `client/src/components/DevTestPage.jsx` to previous version
   - Remove any new accessibility attributes or test selectors

### 3. Verification (60-90 minutes)

1. **Local Testing**
   - Run the application locally to verify basic functionality
   - Test API calls to ensure they work correctly
   - Verify toast notifications appear as expected

2. **Staging Environment**
   - Deploy the reverted code to staging environment
   - Perform smoke tests on critical user flows
   - Validate API functionality and error handling

3. **Production Verification**
   - Monitor application logs for errors
   - Check error rates and performance metrics
   - Verify user-facing functionality

### 4. Post-Rollback Actions (After stabilization)

1. **Root Cause Analysis**
   - Identify the specific issue that caused the rollback
   - Document findings in a post-mortem
   - Create tickets for fixing the identified issues

2. **Communication**
   - Notify stakeholders about the rollback and reason
   - Update documentation to reflect the reverted state
   - Schedule a retro to discuss lessons learned

3. **Future Planning**
   - Plan for a more gradual rollout of the fetchJson improvements
   - Consider feature flagging for safer deployments
   - Enhance monitoring and alerting for API-related metrics

## Files to Revert

If a full revert is not possible, selectively revert these files:

1. `client/src/utils/fetchJson.js` - Core utility with all enhancements
2. `client/src/api/extractBggHtml.js` - Migrated to fetchJson
3. `client/src/api/searchImages.js` - Migrated to fetchJson
4. `client/src/components/DevTestPage.jsx` - Enhanced version with new features
5. `package.json` - Remove axios dependency
6. Test files in `client/src/api/__tests__/` and `client/src/utils/__tests__/`
7. E2E test files in `tests/`
8. GitHub Actions workflow in `.github/workflows/ci-tests.yml`

## Monitoring During Rollback

Key metrics to monitor:

- API error rates
- Response times
- Memory consumption
- User-facing error reports
- Toast notification functionality
- Application logs for exceptions

## Contact Information

In case of rollback execution:
- Primary: [Team Lead Name/Contact]
- Secondary: [Senior Developer Name/Contact]
- Infrastructure: [DevOps Contact]