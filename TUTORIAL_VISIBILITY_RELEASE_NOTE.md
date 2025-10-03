Feature: Toggle A→Z Tutorial UI with env var

What changed:
- Centralized env parsing for REACT_APP_SHOW_TUTORIAL and REACT_APP_DEBUG_TUTORIAL
- Safe debug logging (only when NODE_ENV=development && REACT_APP_DEBUG_TUTORIAL=true)
- Unit tests, docs, CI checks, and PR automation

Notes: Do not enable REACT_APP_DEBUG_TUTORIAL outside development environments.