const fs = require('node:fs');
const path = require('node:path');

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.resolve(relativePath), 'utf8'));

describe('R9 learner grounding and component-isolation contracts', () => {
  const plan = readJson('config/projects/7-wonders-duel/visual-plan.r9.json');
  const assets = readJson('out/publishability-r9/7-wonders-duel/component-library/manifest.json');
  const assembly = readJson('config/projects/7-wonders-duel/tutorial-assembly.r9.json');
  const byPlan = (id) => plan.plans.find((item) => item.ruleAtomId === id);
  const byAsset = (id) => assets.assets.find((item) => item.id === id);

  test('repeatedly rejected Progress derivatives cannot return to an accepted plan', () => {
    const rejected = new Set(['7wd-progress-tokens-clean', 'r6-progress-token-examples', 'r6-progress-tokens-isolated']);
    expect(plan.assets.some((asset) => rejected.has(asset.id))).toBe(false);
    expect(plan.plans.flatMap((item) => item.actualGameAssetIds || []).some((id) => rejected.has(id))).toBe(false);
  });

  test('five Progress tokens are transparent, complete, and pixel-audited', () => {
    const progress = byAsset('r9-progress-tokens-five-isolated');
    expect(progress).toMatchObject({ representedComponent: 'progress-tokens', representedQuantity: 5, cropPurity: 'clean', cropCompleteness: 'complete' });
    expect(progress.backgroundContaminationAudit.status).toBe('PASS');
    expect(progress.backgroundContaminationAudit.transparentPixelRatio).toBeGreaterThan(0.2);
    expect(progress.backgroundContaminationAudit.opaqueBorderPixelRatio).toBe(0);
    expect(progress.backgroundContaminationAudit.violations).toEqual([]);
  });

  test('central setup grounds all narrated quantities and placements', () => {
    const setup = byPlan('setup-central');
    expect(setup.quantityFidelity).toEqual(expect.arrayContaining([
      expect.objectContaining({ componentRef: 'military-tokens', requiredQuantity: 4 }),
      expect.objectContaining({ componentRef: 'progress-tokens', requiredQuantity: 5 }),
      expect.objectContaining({ componentRef: 'coins', requiredQuantity: 7 }),
    ]));
    expect(setup.setupPlacementEvidenceRequired).toBe(true);
    expect(setup.setupPlacements).toHaveLength(5);
    expect(setup.setupPlacements.every((entry) => entry.visibleRelationship)).toBe(true);
  });

  test('Guild identity and card families are explicit beginner evidence', () => {
    const guild = byPlan('setup-age-decks');
    expect(guild.compositionType).toBe('REAL_GUILD_DECK_PREPARATION');
    expect(guild.actualGameAssetIds).toEqual(expect.arrayContaining(['r9-age-i-back', 'r9-age-ii-back', 'r9-age-iii-back', 'r9-guild-back', 'r9-guild-fronts-official']));
    expect(guild.preparationLines.join(' ')).toMatch(/3 Guildes.*Âge III/);

    const families = byPlan('components-overview');
    expect(families.compositionType).toBe('REAL_CARD_FAMILY_TABLEAU');
    expect(families.actualGameAssetIds).toHaveLength(7);
    expect(families.requiredReferents).toHaveLength(7);
  });

  test('discard teaching distinguishes the in-play pile from setup removals', () => {
    const discard = byPlan('discard-for-coins');
    expect(discard.compositionType).toBe('REAL_DISCARD_PILE_FLOW');
    expect(discard.discardLines.join(' ')).toMatch(/pile face cachée à côté du plateau/);
    expect(discard.discardLines.join(' ')).toMatch(/retour dans la boîte/);
    expect(discard.discardLines.join(' ')).toMatch(/2 pièces \+ 1/);
  });

  test('R9 changes only narration whose teaching content changed', () => {
    expect(assembly.narrationRegenerateSceneIds).toEqual([
      'knowledge-components-overview',
      'knowledge-setup-age-decks',
      'knowledge-discard-for-coins',
    ]);
    expect(assembly.narrationSeedManifest).toMatch(/publishability-r8/);
    expect(assembly.baseline.predecessor).toMatchObject({ version: 'r8', preserved: true });
  });
});
