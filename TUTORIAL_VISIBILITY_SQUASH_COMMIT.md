# Squash-and-Merge Commit Message

## Title:
```
feat(tutorial): add env helper, debug flag, .env.example, docs, tests, and CI workflow
```

## Body:
```
Adds a centralized env helper (client/src/utils/env.js) to parse:
REACT_APP_SHOW_TUTORIAL (boolean)
REACT_APP_DEBUG_TUTORIAL (boolean)

Integrates helper into TutorialOrchestrator.jsx and gates diagnostic logging to development when REACT_APP_DEBUG_TUTORIAL=true

Adds client/.env.example and README updates documenting usage

Adds unit tests for helper and component visibility

Adds validation scripts and cross-platform automation scripts

Adds GitHub Actions CI (.github/workflows/tutorial-visibility-ci.yml) that runs lint, tests, and build on PRs (strict linting; warnings fail CI)
```