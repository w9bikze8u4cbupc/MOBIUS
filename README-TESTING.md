# Testing Instructions for MOBIUS Games Tutorial Generator

## Quick Start Testing

This document provides step-by-step instructions for testing the MOBIUS system across platforms.

## Prerequisites

### Required Tools
- Node.js 18+
- FFmpeg (with libx264, libpng, audio codecs)
- Git (for scripting and version control)

### Platform-Specific Requirements

#### Windows
- PowerShell 5.1+ or PowerShell Core 7+
- Git Bash (optional, for Unix-style commands)

#### Linux/macOS
- Bash 4.0+
- Standard Unix utilities (sha256sum, etc.)

## Testing Workflows

### 1. Basic System Test

#### Install and Verify
```bash
# Install dependencies
npm install

# Verify FFmpeg installation  
ffmpeg -version
ffprobe -version

# Run unit tests
npm test
```

### 2. Golden Testing Framework

#### Generate Golden References
```bash
# For specific games
npm run golden:update:sushi
npm run golden:update:loveletter

# Or generate for all configured games
npm run golden:approve
```

#### Verify Against Golden References
```bash
# Check specific games
npm run golden:check:sushi
npm run golden:check:loveletter

# Check all games
npm run golden:check

# Generate JUnit report for CI/CD
npm run golden:check-with-junit
```

#### Cross-Platform Golden Testing
```bash
# Generate platform-specific references
GOLDEN_PER_OS=1 npm run golden:update

# Check with platform-specific references
GOLDEN_PER_OS=1 npm run golden:check
```

### 3. Mock Deployment Testing

The mock deployment system allows safe testing of deployment workflows without actual publishing.

#### PowerShell (Windows)

##### Basic Testing
```powershell
# Test deployment wrapper
.\scripts\deploy\deploy-wrapper.ps1 -DryRun

# Test with verbose output
.\scripts\deploy\deploy-wrapper.ps1 -DryRun -VerboseOutput

# Test notification system
.\scripts\deploy\notify-mock.ps1 -DryRun -Message "Test notification"
```

##### Hash Verification
```powershell
# Verify file integrity
Get-FileHash "out/preview.mp4" -Algorithm SHA256

# Compare hashes
$hash1 = Get-FileHash "file1.mp4" -Algorithm SHA256
$hash2 = Get-FileHash "file2.mp4" -Algorithm SHA256
$hash1.Hash -eq $hash2.Hash
```

##### Error Testing
```powershell
# Test error handling
.\scripts\deploy\deploy-wrapper.ps1 -SimulateError -DryRun

# Test with missing files
.\scripts\deploy\deploy-wrapper.ps1 -DryRun -InputPath "nonexistent.mp4"
```

#### Bash (Linux/macOS/Git Bash/WSL)

##### Basic Testing
```bash
# Ensure scripts are executable
chmod +x scripts/deploy/*.sh

# Test deployment wrapper
./scripts/deploy/deploy-wrapper.sh --dry-run

# Test with verbose output  
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose

# Test notification system
./scripts/deploy/notify-mock.sh --dry-run --message "Test notification"
```

##### Hash Verification
```bash
# Verify file integrity
sha256sum out/preview.mp4

# Compare files
sha256sum file1.mp4 file2.mp4
```

##### Error Testing
```bash
# Test error handling
./scripts/deploy/deploy-wrapper.sh --simulate-error --dry-run

# Test with missing files
./scripts/deploy/deploy-wrapper.sh --dry-run --input-path "nonexistent.mp4"
```

### 4. End-to-End Testing

#### Complete Pipeline Test
```bash
# 1. Generate shot list
npm run compile-shotlist games/example.json > tmp/shotlist.json

# 2. Create timeline
npm run bind-alignment tmp/shotlist.json assets/ > tmp/timeline.json

# 3. Render preview video
npm run render:proxy tmp/timeline.json assets/ out/preview.mp4

# 4. Verify quality with golden tests
npm run golden:check

# 5. Test deployment (mock)
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose

# 6. Verify final output integrity
sha256sum out/preview.mp4
```

#### Cross-Platform End-to-End
```bash
# On Windows (PowerShell)
npm run render:proxy
.\scripts\deploy\deploy-wrapper.ps1 -DryRun -Verbose
Get-FileHash "out/preview.mp4" -Algorithm SHA256

# On Linux/macOS (Bash)
npm run render:proxy  
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose
sha256sum out/preview.mp4
```

## Test Scenarios

### 1. New Game Tutorial Creation

#### Setup
```bash
# Create game configuration
cat > games/new-game.json << EOF
{
  "name": "New Game",
  "publisher": "Test Publisher",
  "components": ["cards", "board", "tokens"]
}
EOF
```

#### Test Process
```bash
# 1. Generate content
npm run compile-shotlist games/new-game.json

# 2. Create golden reference
npm run golden:update -- --game "New Game" --in "out/new-game/preview.mp4"

# 3. Test deployment
./scripts/deploy/deploy-wrapper.sh --dry-run --game "New Game"
```

### 2. Regression Testing

#### Before Changes
```bash
# Capture baseline
npm run golden:approve
```

#### After Changes
```bash
# Check for regressions
npm run golden:check

# If intentional changes, update references
npm run golden:approve
```

### 3. Platform Compatibility Testing

#### Test Matrix
- Windows PowerShell native
- Windows Git Bash
- Linux Bash
- macOS Bash
- WSL (Windows Subsystem for Linux)

#### Execution
```bash
# Run on each platform:
npm test
npm run golden:check
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose
```

## Debugging and Troubleshooting

### Golden Test Failures

#### Investigate Failures
```bash
# Check debug directory for visual diffs
ls tests/golden/*/debug/

# View specific failure details
npm run golden:check:sushi -- --verbose
```

#### Common Causes
- Platform differences in video encoding
- FFmpeg version changes  
- Timing variations in rendering
- Asset file modifications

#### Resolution
```bash
# For legitimate changes, update golden references
npm run golden:update:sushi

# For debugging, check individual frames
ffmpeg -i out/preview.mp4 -vf "select=eq(n\,150)" -vframes 1 debug_frame.png
```

### Deployment Mock Issues

#### Check Script Permissions
```bash
# Linux/macOS
ls -la scripts/deploy/
chmod +x scripts/deploy/*.sh

# Windows PowerShell execution policy
Get-ExecutionPolicy
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### Verbose Debugging
```bash
# Enable all debugging output
./scripts/deploy/deploy-wrapper.sh --dry-run --verbose --debug

# PowerShell equivalent  
.\scripts\deploy\deploy-wrapper.ps1 -DryRun -Verbose -Debug
```

### Performance Testing

#### Measure Render Times
```bash
# Time the rendering process
time npm run render:proxy

# Profile with detailed timing
npm run render:proxy -- --profile
```

#### Memory Usage
```bash
# Monitor during rendering
# Linux/macOS
top -p $(pgrep ffmpeg)

# Windows
Get-Process ffmpeg | Format-Table ProcessName,CPU,WorkingSet
```

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Run Golden Tests
  run: |
    npm run golden:check
    npm run golden:check-with-junit
    
- name: Test Deployment Mocks
  run: |
    chmod +x scripts/deploy/*.sh
    ./scripts/deploy/deploy-wrapper.sh --dry-run --verbose
```

### Test Reports
```bash
# Generate JUnit XML for CI systems
npm run golden:check-with-junit

# Reports saved to: tests/reports/
```

## Quality Assurance Checklist

Before committing changes:

- [ ] Unit tests pass: `npm test`
- [ ] Golden tests pass: `npm run golden:check`  
- [ ] Cross-platform deployment mocks work
- [ ] Hash verification succeeds
- [ ] No regressions in existing games
- [ ] New features have corresponding golden references
- [ ] Documentation updated for new functionality

## Advanced Testing

### Custom Golden Thresholds
```bash
# Adjust quality thresholds for specific needs
npm run golden:check -- --ssim 0.990 --lufs_tol 2.0 --tp_tol 2.0
```

### Platform-Specific Testing
```bash
# Force platform-specific golden generation
GOLDEN_PER_OS=1 npm run golden:update

# Test specific platform behavior
./scripts/deploy/deploy-wrapper.sh --platform linux --dry-run
```

### Stress Testing
```bash
# Test with multiple concurrent renders
for i in {1..5}; do npm run render:proxy & done; wait

# Test deployment with large files
./scripts/deploy/deploy-wrapper.sh --dry-run --input-path large-video.mp4
```

This testing infrastructure ensures reliable, cross-platform operation of the MOBIUS tutorial generation system.