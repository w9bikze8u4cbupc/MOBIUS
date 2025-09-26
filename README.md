# MOBIUS - Game Tutorial Video Generator

A pipeline for generating game tutorial videos from structured game rules.

## Features

- Automated game tutorial video generation
- Golden test validation for video/audio quality
- Cross-platform support (Ubuntu, macOS, Windows)
- FFmpeg integration for media processing
- Deployment readiness framework with notifications

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run tests:
   ```bash
   npm test
   ```

3. Generate golden artifacts:
   ```bash
   npm run golden:update
   ```

4. Check golden artifacts:
   ```bash
   npm run golden:check
   ```

## Deployment Readiness Framework

This repository includes a complete deployment readiness framework with:

### Scripts
- `github/scripts/branch-protection-setup.sh` - Set up branch protection rules
- `github/scripts/send-notification.js` - Send Slack/Teams notifications
- `github/scripts/validate-deployment-framework.sh` - Validate framework setup

### Templates
- `.github/pull_request_template.md` - PR template with deployment checklist
- `.github/deploy-cheatsheet.md` - Quick reference for deploy operators
- `.github/ci-pr-comment.md` - CI comment template
- Various notification templates for Slack and Teams

### Workflows
- `.github/workflows/ci.yml` - Main CI pipeline with PR comments
- `.github/workflows/premerge-validation.yml` - Pre-merge validation and artifact generation

### Usage Examples

#### Set up branch protection:
```bash
./github/scripts/branch-protection-setup.sh w9bikze8u4cbupc/MOBIUS main
```

#### Send deployment notifications:
```bash
# Test notification (dry run)
node github/scripts/send-notification.js \
  --service slack,teams \
  --template deployment-started \
  --release v1.2.3 \
  --pr 123 \
  --env production \
  --lead "Jane Doe" \
  --dry-run

# Live notification (requires SLACK_WEBHOOK and TEAMS_WEBHOOK env vars)
export SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
export TEAMS_WEBHOOK="https://outlook.office.com/webhook/YOUR-TEAMS-WEBHOOK"
node github/scripts/send-notification.js \
  --service slack,teams \
  --template deployment-complete \
  --release v1.2.3 \
  --pr 123 \
  --env production \
  --lead "Jane Doe"
```

#### Validate framework:
```bash
./github/scripts/validate-deployment-framework.sh
```

## Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run compile-shotlist` | Compile shotlist from game rules |
| `npm run render` | Render video using FFmpeg |
| `npm run golden:check` | Run golden test validation |
| `npm run golden:update` | Update golden test baselines |
| `npm test` | Run unit tests |

## Golden Testing

The project uses golden testing to ensure video/audio quality consistency across platforms:

- **Video Quality:** SSIM >= 0.995
- **Audio Compliance:** EBU R128 LUFS within -23.0 ±1.0 dB
- **Platform Testing:** Ubuntu, macOS, Windows

## Contributing

1. Create a feature branch
2. Make your changes
3. Ensure all tests pass
4. Create a pull request using the provided template
5. Wait for 2 approvals (including Ops/SRE)
6. Merge using rebase-and-merge

## License

MIT
