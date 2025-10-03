## Minimal merge checklist

- [ ] Lint passes: cd client && npm run lint
- [ ] WebSocketGuard unit tests pass deterministically (no hanging handles)
- [ ] Smoke dev run: npm run dev — no reconnect spam during HMR
- [ ] TROUBLESHOOTING.md and FINAL_PR_INSTRUCTIONS.md present and readable
- [ ] .github/workflows/CI_WORKFLOW.yml included and CI checks run on PR