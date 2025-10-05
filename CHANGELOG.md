# Changelog

## [Unreleased]

### Added
- Cross-platform verification scripts (`mobius-verify.sh` and `mobius-verify.cmd`)
- Utility scripts for port management (`scripts/kill-ports.sh` and `scripts/kill-ports.ps1`)
- Utility scripts for folder consolidation (`scripts/consolidate-mobius-folders.sh` and `scripts/consolidate-mobius-folders.ps1`)
- GitHub Actions workflow for CI verification (`.github/workflows/mobius-verify.yml`)
- New npm scripts: `mobius:verify` and `mobius:verify:unix`

### Changed
- Enhanced existing verification scripts with better process management
- Improved error handling and logging in all scripts
- Updated README.md with new verification script information

### Fixed
- Port conflict issues in verification scripts
- Process cleanup issues in verification scripts
- Health check reliability in verification scripts

## [1.0.0] - 2025-10-05

### Added
- Initial release of MOBIUS Games Tutorial Generator
- Backend API with Express.js
- Frontend React application
- PDF rulebook parsing capabilities
- AI-powered tutorial script generation
- Text-to-speech audio generation