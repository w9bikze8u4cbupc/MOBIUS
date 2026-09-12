import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildGameplayModel, deriveGameplayActions, GAMEPLAY_ACTIONS_CONTRACT_VERSION } from '../../src/services/gameplayActions.js';

function fixtureEvidence(filePath) {
  return {
    contract: 'hephaestus-component-evidence-v1',
    projectId: 'unseen-game',
    acceptedVisuals: [{ id: 'visual-card', componentName: 'Player Cards', category: 'card', pageNumber: 4, renderPath: filePath, reviewState: 'accepted', confidence: 0.9, provenance: { manifestPath: 'fixture-manifest.json' } }],
  };
}

function source(section = 4) {
  return [{ section, startOffset: 0, endOffset: 100 }];
}

test('builds one canonical loop and source-grounded actions with accepted visual bindings', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-gameplay-'));
  const image = path.join(directory, 'card.png');
  fs.writeFileSync(image, Buffer.from('fixture'));
  const model = buildGameplayModel({
    projectId: 'unseen-game',
    gameIdentity: { displayName: 'Unseen Game', sourceTitle: 'Unseen Game', locale: 'fr-CA' },
    sections: [{ title: 'Tour de jeu', spokenText: 'Chaque joueur choisit une carte, la résout, puis passe au joueur suivant. Phases : choix, résolution.', sources: source() }],
    components: [{ id: 'component-card', name: 'Player Cards', category: 'card', confidence: 0.9 }],
    evidence: fixtureEvidence(image),
  });
  expect(model.contract).toBe(GAMEPLAY_ACTIONS_CONTRACT_VERSION);
  expect(model.gameLoop.phases).toEqual(['choix', 'résolution']);
  expect(model.gameLoop.sourceRefs).toHaveLength(1);
  expect(model.actions[0]).toMatchObject({ name: 'Choisir une carte', sourceRefs: source(), reviewState: 'accepted' });
  expect(model.actions[0].stateChange).toEqual(expect.objectContaining({ action: expect.stringContaining('choisit une carte') }));
  expect(model.visualBindings).toEqual(expect.arrayContaining([expect.objectContaining({ actionId: model.actions[0].id, visualAssetIds: ['visual-card'], reviewState: 'accepted' })]));
  expect(model.reviewRequired).toBe(false);
});

test('keeps actions requiring missing evidence in review instead of inventing a binding', () => {
  const actions = deriveGameplayActions({
    sections: [{ title: 'Actions', spokenText: 'Jouez une carte.', sources: [] }],
    components: [],
    evidence: { acceptedVisuals: [] },
  });
  expect(actions[0].action.name).toBe('Jouer une carte');
  expect(actions[0].action.sourceRefs).toEqual([]);
  expect(actions[0].action.reviewRequired).toBe(true);
  expect(actions[0].bindings).toEqual([]);
});

test('generalizes a second game through source page bindings without game-specific service branches', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-gameplay-'));
  const image = path.join(directory, 'card.png');
  fs.writeFileSync(image, Buffer.from('fixture'));
  const model = buildGameplayModel({
    projectId: 'second-game',
    gameIdentity: { displayName: 'Second Game', sourceTitle: 'Second Game' },
    sections: [{ title: 'Game Turn', spokenText: 'Players take turns. Choose a card and build a city.', sources: [{ page: 7 }] }],
    actionHints: [{ name: 'Construire une cité', category: 'card', componentRefs: ['city-card'], visualAssetIds: ['visual-card'], sourceRefs: [{ page: 8, quote: 'Build a city.' }], before: 'La carte est disponible.', after: 'La cité est développée.', confidence: 0.9 }],
    components: [{ id: 'city-card', name: 'City Card', category: 'card', confidence: 0.9 }],
    evidence: fixtureEvidence(image),
    loopHint: { loopUnit: 'round', phases: ['choix', 'construction'], sourceRefs: [{ page: 7 }] },
  });
  expect(model.gameLoop.loopUnit).toBe('round');
  expect(model.actions.some((action) => action.name === 'Construire une cité')).toBe(true);
  expect(model.visualBindings.some((binding) => binding.reviewState === 'accepted')).toBe(true);
});
