# Technical Debt Tracking

This file tracks TODOs and technical debt items that need to be addressed.

## Authentication & Security
- **Issue #1**: Implement proper session-based authentication 
  - **Location**: `src/api/index.js` line ~83
  - **Priority**: Medium
  - **Description**: Currently using development-only API key validation bypass. Need to implement proper session-based auth for production.
  - **Status**: Open

## Code Quality Improvements
- **Issue #2**: Complete console.log to structured logging migration
  - **Location**: Various files (src/api/index.js, scripts/*.js)
  - **Priority**: Low
  - **Description**: Ongoing migration from console.log to winston structured logging for better production observability.
  - **Status**: In Progress

## Future Enhancements
- **Issue #3**: Add centralized config for thresholds
  - **Priority**: Low
  - **Description**: Consider adding CONF_AUTO_ASSIGN_THRESHOLD, HASH_CONFIDENCE_MAPPING for easier runtime tuning
  - **Status**: Suggestion