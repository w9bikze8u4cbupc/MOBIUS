# GitHub PR UI Copy

## PR Title
```
Add REACT_APP_SHOW_TUTORIAL env helper, docs, and tests
```

## PR Description
```
# Add REACT_APP_SHOW_TUTORIAL env helper, docs, and tests

## Description
Introduces centralized environment variable helpers for controlling the visibility and debugging of the TutorialOrchestrator component. This change makes it easier to show/hide the tutorial UI and enable debugging based on environment configuration.

## Changes
- Introduces `client/src/utils/env.js` with helpers for environment variable parsing
- Adds `client/.env.example` documenting `REACT_APP_SHOW_TUTORIAL` and `REACT_APP_DEBUG_TUTORIAL`
- Updates README with usage instructions
- Integrates helpers into `TutorialOrchestrator.jsx` with conditional diagnostic logging
- Adds unit tests for helpers and visibility behavior
- Ensures lint/formatting consistency

## Implementation Details

### Environment Helpers
Created dedicated helper functions in `client/src/utils/env.js`:

1. `getShowTutorial()`:
   - Safely accesses `REACT_APP_SHOW_TUTORIAL` environment variable
   - Returns `false` by default when not set
   - Properly parses boolean string values (`'true'`/`'false'`)
   - Returns `true` for any other non-empty string value

2. `getDebugTutorial()`:
   - Safely accesses `REACT_APP_DEBUG_TUTORIAL` environment variable
   - Returns `false` by default when not set
   - Properly parses boolean string values (`'true'`/`'false'`)
   - Returns `true` for any other non-empty string value

### Configuration
Added environment variables to `.env.example` with documentation:
```bash
# Toggle to show/hide the tutorial component
# Set to true to show the tutorial, false to hide it
REACT_APP_SHOW_TUTORIAL=true

# Enable tutorial debugging logs (development only)
# Set to true to show diagnostic information in browser console
REACT_APP_DEBUG_TUTORIAL=false
```

### Documentation
Updated README with clear instructions on how to use the environment variables to control tutorial visibility and debugging.

### Component Integration
Modified `TutorialOrchestrator.jsx` to:
- Use the new helper functions instead of direct `process.env` access
- Add conditional diagnostic logging in development (only when DEBUG_TUTORIAL is enabled)
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
The environment helpers use specific functions for accessing environment variables rather than generic accessors, which helps prevent accidental exposure of other environment variables.

## Risk
Low risk - these are development utilities that don't affect production code paths.
```

## Reviewers
```
# No specific reviewers requested - please add as appropriate for your team
```