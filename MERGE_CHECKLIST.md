# Merge Checklist

## Code Quality
- [ ] All CI checks passing
- [ ] No new lint errors
- [ ] Code follows established patterns
- [ ] No console.log statements left in production code

## Testing
- [ ] WebSocketGuard unit tests pass deterministically
- [ ] All existing tests continue to pass
- [ ] No hanging or leaking tests
- [ ] Edge cases covered appropriately

## Documentation
- [ ] README updates accurate
- [ ] TROUBLESHOOTING.md updated with new debugging steps
- [ ] Code comments clear and helpful
- [ ] No broken links in documentation

## Integration
- [ ] Dev test toggle still works correctly
- [ ] No WebSocket reconnect spam in development
- [ ] Frontend and backend servers start properly
- [ ] Environment variable access standardized

## PR Artifacts
- [ ] PR_DESCRIPTION.md accurate and complete
- [ ] COMMIT_MESSAGE.txt appropriate
- [ ] All automation scripts present and functional
- [ ] CI workflow file correctly configured

## Team Process
- [ ] Required reviewers have approved
- [ ] All feedback addressed
- [ ] Branch up to date with target branch
- [ ] No merge conflicts

## Post-Merge
- [ ] Delete feature branch
- [ ] Monitor CI for any regressions
- [ ] Update team if breaking changes introduced
- [ ] Archive PR artifacts if needed