const { derivePhysicalGameState, validatePhysicalGameState } = require('../../src/services/physicalGameState.cjs');

test('derives a reusable consumed one-shot marker transition', () => {
  const state = derivePhysicalGameState({
    id: 'threshold', domain: 'triggered_effect', componentRefs: ['penalty-token'],
    stateBefore: 'Token present', stateChange: 'Cross threshold and remove token', stateAfter: 'Token removed',
    sourceRefs: [{ page: 7 }], confidence: 0.95, reviewState: 'accepted',
    visualRequirement: { requiredObjects: ['penalty-token'], transitionRequired: true, oneShotMarkerRequired: true },
  });
  expect(state.transitionType).toBe('CONSUMED_TRIGGER');
  expect(state.stages[0].items[0].removed).toBe(false);
  expect(state.stages[1].items[0].removed).toBe(true);
  expect(validatePhysicalGameState(state)).toEqual({ valid: true, violations: [] });
});
