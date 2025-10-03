Smoke test checklist — run in staging after merge

1) Start frontend pointing to staging backend.
   - Verify REACT_APP_SHOW_TUTORIAL not set → Tutorial UI hidden
2) Set REACT_APP_SHOW_TUTORIAL=true in staging env and restart frontend
   - Confirm Tutorial UI appears and can be opened/closed
3) Verify debug logs:
   - NODE_ENV=production + REACT_APP_DEBUG_TUTORIAL=true → no debug logs visible
   - NODE_ENV=development + REACT_APP_DEBUG_TUTORIAL=true → debug logs shown in console
4) Run automated UI unit tests for TutorialOrchestrator
5) Run a production build and open app locally (npm run build → serve)
6) Run basic end-to-end flow (pick a sample project, open tutorial steps)
7) Report any anomalies and follow rollback if needed

If any step fails, capture logs and escalate; see rollback instructions.