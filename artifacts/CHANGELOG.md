# Changelog

## [Unreleased]

### Added
- fetchJson utility with retries, error mapping, and toast deduplication
- DevTestPage component for isolated validation, gated by REACT_APP_SHOW_DEV_TEST
- Jest unit tests for API helpers (extractBggHtml, searchImages)
- Playwright E2E tests for toast deduplication and QA gating
- Comprehensive test coverage for new API layer

### Changed
- Migrated handleExtractMetadata and runWebSearch from axios to fetchJson
- Updated API helper modules to use fetchJson instead of direct axios calls
- Enhanced ToastContext with deduplication capabilities
- Improved error handling with centralized error mapping

### Removed
- Removed axios dependency after successful migration to fetchJson
- Eliminated ad-hoc axios usage throughout the codebase

### Fixed
- ESLint and Prettier issues across the codebase
- Improved consistency in API error handling
- Enhanced reliability of network requests with retry logic

### Migration Notes for Reviewers
- fetchJson provides a more robust and consistent API for making HTTP requests
- All new API calls should use fetchJson instead of axios or raw fetch
- Toast deduplication prevents duplicate error messages from appearing
- DevTestPage provides a controlled environment for validating API functionality
- Error mapping ensures consistent user-facing error messages across the application