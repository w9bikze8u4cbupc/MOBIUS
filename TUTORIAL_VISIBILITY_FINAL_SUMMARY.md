Tutorial Visibility — final summary

Goal:
Make the A→Z Tutorial UI toggleable and ensure debug logging is gated, with tests, docs and CI protections.

What this patch adds:
- Final PR artifacts (squash commit msg, release note, smoke test, monitoring, rollback, reviewer guidance)
- PR creation scripts (bash + Windows)
- Short post-merge commands and final summary

Validation:
- CI must pass: lint (no warnings), tests, production build
- Run smoke-test checklist in staging (see TUTORIAL_VISIBILITY_SMOKE_TEST.md)

If you want, next I'll:
1) Generate the exact gh pr create command pre-filled with reviewers/labels and a branch-protection curl snippet OR
2) Produce a git-formatted patch that also includes the CI workflow file (.github/workflows/tutorial-visibility-ci.yml) and the env helper files (client/src/utils/env.js + tests)

I chose to provide the PR artifact patch now. Reply "include CI + code files" to have me expand the patch to also add the CI workflow and code changes.