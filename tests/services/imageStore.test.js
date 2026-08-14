import {
  linkImagesToComponent,
  reconcileAutomaticLinks,
  resetImageStore,
} from '../../src/services/imageStore.js';

describe('automatic component link reconciliation', () => {
  beforeEach(() => {
    resetImageStore();
  });

  test('removes stale automatic links while preserving explicit manual links', () => {
    reconcileAutomaticLinks('abyss', [
      { id: 'game-board', name: 'game board' },
      { id: 'removed-component', name: 'Threat token' },
    ], {
      'game-board': ['auto-board'],
      'removed-component': ['auto-removed'],
    });
    linkImagesToComponent('abyss', 'game-board', ['auto-board', 'manual-board'], { manualImageIds: ['manual-board'] });

    const state = reconcileAutomaticLinks('abyss', [
      { id: 'game-board', name: 'game board' },
      { id: 'exploration-cards', name: 'Exploration cards' },
    ], {
      'exploration-cards': ['auto-exploration'],
    });

    expect(state.componentImages).toEqual({
      'game-board': ['manual-board'],
      'exploration-cards': ['auto-exploration'],
    });
    expect(state.componentImageLinkDetails['game-board']['manual-board']).toMatchObject({ origin: 'manual' });
    expect(state.componentImageLinkDetails['exploration-cards']['auto-exploration']).toMatchObject({ origin: 'auto' });
    expect(state.componentImages['removed-component']).toBeUndefined();
  });

  test('replaces only prior automatic assignments on a new matching pass', () => {
    linkImagesToComponent('abyss', 'exploration-cards', ['manual-choice']);
    reconcileAutomaticLinks('abyss', [{ id: 'exploration-cards', name: 'Exploration cards' }], {
      'exploration-cards': ['auto-first'],
    });
    const updated = reconcileAutomaticLinks('abyss', [{ id: 'exploration-cards', name: 'Exploration cards' }], {
      'exploration-cards': ['auto-second'],
    });

    expect(updated.componentImages['exploration-cards']).toEqual(['manual-choice', 'auto-second']);
    expect(updated.componentImageLinkDetails['exploration-cards']['manual-choice']).toMatchObject({ origin: 'manual' });
    expect(updated.componentImageLinkDetails['exploration-cards']['auto-second']).toMatchObject({ origin: 'auto' });
    expect(updated.componentImages['exploration-cards']).not.toContain('auto-first');
  });
});
