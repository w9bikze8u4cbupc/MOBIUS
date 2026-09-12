import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildEndgameModel, buildEndgameTeachingPlan, SCORING_ENDGAME_CONTRACT_VERSION } from '../../src/services/scoringEndgame.js';

const source = (page, quote) => [{ page, quote }];

function acceptedVisual(directory, id = 'scoreboard') {
  const file = path.join(directory, `${id}.png`);
  fs.writeFileSync(file, Buffer.from('fixture'));
  return { id, path: file, sourcePage: 4, provenance: { manifestPath: 'fixture-manifest.json', sourcePage: 4 } };
}

test('supports immediate victory and points victory as separate source-grounded paths', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-scoring-'));
  const visual = acceptedVisual(directory);
  const model = buildEndgameModel({
    projectId: 'duel-fixture',
    gameIdentity: { displayName: 'Duel Fixture', sourceTitle: 'Duel Fixture' },
    endgame: {
      trigger: 'La partie se termine à la fin de l’âge III.',
      immediateVictoryConditions: [
        { id: 'military', label: 'Suprématie militaire', description: 'Une suprématie militaire met fin à la partie immédiatement.', sourceRefs: source(12, 'Military Supremacy ends the game immediately.'), confidence: 0.9, reviewState: 'accepted', reviewRequired: false, visualAssetIds: ['scoreboard'], visuals: [visual] },
        { id: 'science', label: 'Suprématie scientifique', description: 'Une suprématie scientifique met fin à la partie immédiatement.', sourceRefs: source(12, 'Scientific Supremacy ends the game immediately.'), confidence: 0.9, reviewState: 'accepted', reviewRequired: false, visualAssetIds: ['scoreboard'], visuals: [visual] }
      ],
      finishCurrentUnitRule: 'Si aucune suprématie ne survient, jouer jusqu’à la fin de l’âge III.',
      finalPhase: 'Décompter les points de victoire.',
      sourceRefs: source(13, 'Civilian Victory')
    },
    scoringCategories: [{ id: 'civilian-points', label: 'Points de victoire', description: 'Le joueur avec le plus de points gagne.', componentRefs: ['city-cards'], visualAssetIds: ['scoreboard'], visuals: [visual], calculationType: 'sum-source-defined-points', sourceRefs: source(13, 'Victory points from Buildings, Wonders and Progress.'), confidence: 0.9, reviewState: 'accepted', reviewRequired: false }],
    tieBreakers: []
  });
  expect(model.contract).toBe(SCORING_ENDGAME_CONTRACT_VERSION);
  expect(model.endGameModel.immediateVictoryConditions).toHaveLength(2);
  expect(model.scoringCategories[0].reviewState).toBe('accepted');
  expect(model.visualBindings[0].reviewState).toBe('accepted');
  expect(model.victoryVisualBindings).toHaveLength(2);
  expect(model.victoryVisualBindings.every((binding) => binding.reviewState === 'accepted')).toBe(true);
  expect(buildEndgameTeachingPlan(model).scenes.map((scene) => scene.semanticRole)).toEqual(expect.arrayContaining(['immediate-victory', 'scoring-category']));
  expect(buildEndgameTeachingPlan(model).scenes.find((scene) => scene.semanticRole === 'immediate-victory').visualBindings).toHaveLength(2);
});

test('routes points-only categories without visual evidence to review', () => {
  const model = buildEndgameModel({
    projectId: 'points-only',
    sections: [{ title: 'Scoring', spokenText: 'Le joueur avec le plus de points gagne.', sources: source(8, 'Most points wins.') }],
    scoringCategories: [{ label: 'Points finaux', description: 'Compter les points selon la source.', sourceRefs: source(8, 'Count points.'), confidence: 0.8 }]
  });
  expect(model.endGameModel.scoringRequired).toBe(true);
  expect(model.scoringCategories[0].reviewState).toBe('needs_review');
  expect(model.reviewRequired).toBe(true);
});

test('generalizes an unseen game with no final scoring calculation', () => {
  const model = buildEndgameModel({
    projectId: 'unseen-no-score',
    sections: [{ title: 'End of Round', spokenText: 'The round ends when the deck is empty.', sources: source(6, 'The round ends when the deck is empty.') }],
    endgame: { trigger: 'The round ends when the deck is empty.', scoringRequired: false, sourceRefs: source(6, 'The round ends when the deck is empty.') }
  });
  expect(model.endGameModel.scoringRequired).toBe(false);
  expect(model.scoringCategories).toHaveLength(0);
  expect(model.endGameModel.sourceRefs).toHaveLength(1);
});
