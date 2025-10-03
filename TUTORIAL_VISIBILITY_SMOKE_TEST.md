Quick smoke test (after deploying to staging or serving production build locally)

1) Build & serve:
   cd client
   npm run build
   npx serve -s build

2) Verify toggles:
   - REACT_APP_SHOW_TUTORIAL=false  -> A→Z UI is hidden
   - REACT_APP_SHOW_TUTORIAL=true   -> A→Z UI is present

3) Confirm debug flag:
   - REACT_APP_DEBUG_TUTORIAL has NO effect in production (NODE_ENV=production)
   - Diagnostic logs only appear in development when NODE_ENV=development && REACT_APP_DEBUG_TUTORIAL=true

4) Manual UX sanity:
   - Navigate pages that used TutorialOrchestrator previously
   - Execute primary flows that may have interacted with tutorial UI
   - Confirm no runtime console errors and page load is normal