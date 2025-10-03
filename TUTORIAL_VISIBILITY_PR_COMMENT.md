## PR Review Checklist

Thanks for reviewing — key points:

### CI Status
- [ ] CI must be green (lint, tests, build)
- [ ] All status checks passing on both Node.js 18.x and 20.x

### Local Verification
- [ ] Toggle `REACT_APP_SHOW_TUTORIAL` in .env and confirm UI shows/hides after server restart
- [ ] Ensure debug logs only appear when `NODE_ENV=development && REACT_APP_DEBUG_TUTORIAL=true`
- [ ] Confirm `.env.example` and README updates are accurate

### Code Quality
- [ ] Environment helper functions properly tested
- [ ] Tutorial visibility correctly toggles based on `REACT_APP_SHOW_TUTORIAL`
- [ ] Debug logging only appears in development when `REACT_APP_DEBUG_TUTORIAL=true`
- [ ] No console.debug statements in production code paths

### Documentation
- [ ] `.env.example` updated with new variables
- [ ] README documentation updated with clear examples
- [ ] All new functionality properly documented

### Security
- [ ] Debug logging properly gated to development environment only
- [ ] No sensitive information exposed through environment variables
- [ ] Environment isolation maintained through specific helper functions

### Merge Process
If CI is green and changes look good, please squash-and-merge using the commit message:

```
feat(tutorial): add env helper, debug flag, .env.example, docs, tests, and CI workflow

Adds a centralized env helper (client/src/utils/env.js) to parse:
REACT_APP_SHOW_TUTORIAL (boolean)
REACT_APP_DEBUG_TUTORIAL (boolean)

Integrates helper into TutorialOrchestrator.jsx and gates diagnostic logging to development when REACT_APP_DEBUG_TUTORIAL=true

Adds client/.env.example and README updates documenting usage

Adds unit tests for helper and component visibility

Adds validation scripts and cross-platform automation scripts

Adds GitHub Actions CI (.github/workflows/tutorial-visibility-ci.yml) that runs lint, tests, and build on PRs (strict linting; warnings fail CI)
```