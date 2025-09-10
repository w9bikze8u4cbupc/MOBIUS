# Quality Assurance and Validation

This document describes how to run the quality assurance checks for the Mobius Games Tutorial Generator.

## Golden Checks with JUnit Output

To run golden checks with JUnit output:

```bash
npm run golden:check:junit -- --game <game_name>
```

Example:
```bash
npm run golden:check:junit -- --game hanamikoji
```

## Mobius Checklist Validation

To validate the Mobius checklist:

### Windows
```powershell
$env:RUNNER_OS='Windows'
npm run mobius:checklist -- <game_name>
```

### Linux/macOS
```bash
RUNNER_OS=Linux npm run mobius:checklist -- <game_name>
# or
RUNNER_OS=macOS npm run mobius:checklist -- <game_name>
```

Example:
```bash
$env:RUNNER_OS='Windows'
npm run mobius:checklist -- hanamikoji
```

## Generated Artifacts

The following directories are used for generated artifacts:

- `tests/golden/reports/` - JUnit XML reports
- `tests/golden/{game}/{os}/debug/` - Debug artifacts (visual diffs, etc.)
- `tests/golden/{game}/{os}/` - Golden frame baselines (tracked with Git LFS)

## Git Ignore

The following paths are ignored in Git:

- `debug/` - Debug directories
- `tmp/` - Temporary files
- `out/` - Output files
- `*.mp4` - Generated video files

## GitHub Actions

The GitHub Actions workflow runs the validation checks on multiple operating systems:

```yaml
name: Golden Preview Checks

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]
  workflow_dispatch:

jobs:
  golden:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
        game: [hanamikoji]   # add more games
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - name: Run golden checks
        run: npm run golden:check:junit -- --game ${{ matrix.game }}
      - name: Validate Mobius checklist
        env:
          RUNNER_OS: ${{ runner.os }}
        run: node scripts/ci/validate_mobius_checklist.cjs --game ${{ matrix.game }}
```