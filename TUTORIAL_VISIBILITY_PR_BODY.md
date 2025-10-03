# Add REACT_APP_SHOW_TUTORIAL env helper, docs, tests, and CI

## Summary

Centralized env helper to parse REACT_APP_SHOW_TUTORIAL and REACT_APP_DEBUG_TUTORIAL.
TutorialOrchestrator now uses helper to show/hide tutorial UI; debug logging gated to NODE_ENV === 'development' && REACT_APP_DEBUG_TUTORIAL === true.
Added documentation, smoke tests, monitoring & rollback docs, reviewer guidance, and PR creation scripts.

## Files added (high level)

- TUTORIAL_VISIBILITY_SQUASH_COMMIT_MSG.txt
- TUTORIAL_VISIBILITY_RELEASE_NOTE.md
- TUTORIAL_VISIBILITY_POST_MERGE_COMMANDS.md
- TUTORIAL_VISIBILITY_SMOKE_TEST.md
- TUTORIAL_VISIBILITY_MONITORING.md
- TUTORIAL_VISIBILITY_ROLLBACK.md
- TUTORIAL_VISIBILITY_REVIEWER_GUIDANCE.md
- CREATE_TUTORIAL_VISIBILITY_PR.{sh,bat}
- TUTORIAL_VISIBILITY_FINAL_SUMMARY.md
- .github/workflows/tutorial-visibility-ci.yml
- client/src/utils/env.js (+ tests)
- client/src/components/TutorialOrchestrator.jsx (+ tests)
- client/.env.example

## Testing & CI expectations

CI must run: lint (--max-warnings=0), jest tests, production build.
Local pre-merge validation: `npm ci && npm run lint -- --max-warnings=0 && npm test && npm run build`

## Smoke-test (staging)

- Verify tutorial hidden by default (REACT_APP_SHOW_TUTORIAL unset)
- Verify tutorial visible when REACT_APP_SHOW_TUTORIAL=true
- Confirm no debug logs in production even if REACT_APP_DEBUG_TUTORIAL=true

## Rollback plan

See TUTORIAL_VISIBILITY_ROLLBACK.md

## Important runtime note

Do not enable REACT_APP_DEBUG_TUTORIAL in staging/production — debug logging is only intended for development (NODE_ENV === 'development').

## Description

Introduces a centralized environment variable helper for controlling the visibility of the TutorialOrchestrator component. This change makes it easier to show/hide the tutorial UI based on environment configuration while maintaining clean diagnostic logging.

## Changes

- Introduces `client/src/utils/env.js` to centralize environment variable parsing
- Adds `client/.env.example` documenting `REACT_APP_SHOW_TUTORIAL` and `REACT_APP_DEBUG_TUTORIAL`
- Updates README with usage instructions
- Integrates helper into `TutorialOrchestrator.jsx` and adds conditional diagnostic logging in development
- Adds unit tests for helper and visibility behavior
- Ensures lint/formatting consistency

## Implementation Details

### Environment Helpers

Created dedicated helper functions:

- `getShowTutorial()` - Safely accesses `REACT_APP_SHOW_TUTORIAL` environment variable
- `getDebugTutorial()` - Safely accesses `REACT_APP_DEBUG_TUTORIAL` environment variable

Both functions:

- Return `false` by default when not set
- Properly parse boolean string values (`'true'`/`'false'`)
- Return `true` for any other non-empty string value

### Configuration

Added environment variables to `.env.example` with documentation:

```
# Toggle to show/hide the tutorial component
# Set to true to show the tutorial, false to hide it
REACT_APP_SHOW_TUTORIAL=true

# Enable tutorial debugging logs (development only)
# Set to true to show diagnostic information in browser console
REACT_APP_DEBUG_TUTORIAL=false
```

### Documentation

Updated README with clear instructions on how to use the environment variables to control tutorial visibility and enable debugging.

### Component Integration

Modified `TutorialOrchestrator.jsx` to:

- Use the new helper functions instead of direct `process.env` access
- Add conditional diagnostic logging that only appears in development when `getDebugTutorial()` returns `true`
- Maintain the same conditional rendering behavior

### Testing

Added comprehensive unit tests:

- Tests for both environment helper functions covering all cases
- Tests for the component visibility behavior

## Validation

- All existing tests continue to pass
- New tests cover the environment helpers and component visibility
- Linting passes with no errors
- Manual verification confirms the tutorial can be shown/hidden via environment variable

## Usage

To toggle the tutorial component visibility:

```bash
# Show tutorial component
REACT_APP_SHOW_TUTORIAL=true

# Hide tutorial component
REACT_APP_SHOW_TUTORIAL=false
```

To enable diagnostic logging for the tutorial component (development only):

```bash
# Enable tutorial debugging logs
REACT_APP_DEBUG_TUTORIAL=true
```

**Important**: Create React App reads .env at start time only. After changing environment variables, you must restart the development server.

## Security

The environment helpers use specific functions for accessing environment variables rather than generic accessors, which helps prevent accidental exposure of other environment variables. The debug logging is also gated to only appear in development environments.

## Risk

Low risk - this is a development utility that doesn't affect production code paths.
