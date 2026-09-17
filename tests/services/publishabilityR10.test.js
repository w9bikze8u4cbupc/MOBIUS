const fs = require('node:fs');
const path = require('node:path');
const { getNarrationDeliveryProfile, getNarrationPreset, BRAND_AUDIO_CONTRACT } = require('../../src/services/editorialStandard.cjs');
const { auditNarrationPerformance } = require('../../src/services/narrationPerformanceQa.cjs');
const { normalizeVisualPlan, validateVisualPlan } = require('../../src/services/visualPlan.cjs');
const { resolveStoryboardBackground } = require('../../src/services/tutorialAssemblyVisual.cjs');

const real = (id, overrides = {}) => ({
  id, filePath: __filename, containsActualGamePixels: true, visualClassification: 'REAL_COMPONENT',
  cropPurity: 'clean', cropCompleteness: 'complete', reviewState: 'accepted', sourceRefs: [{ page: 1 }],
  ...overrides,
});

describe('R10 editorial finesse contracts', () => {
  test('selected Amélie profile is warmer while retaining the same narrator identity settings family', () => {
    const preset = getNarrationPreset('warm-engaging-fr-ca');
    const profile = getNarrationDeliveryProfile('AMELIE_TEACHING_WARM_R10');
    expect(profile.contract).toBe('amelie-teaching-warm-r10-v1');
    expect(profile.voiceSettingsKey).toBe('teachingWarmR10VoiceSettings');
    expect(preset.teachingWarmR10VoiceSettings).toEqual({ stability: 0.27, similarity_boost: 0.86, style: 0.42, use_speaker_boost: true, speed: 1.04 });
  });

  test('narration QA rejects a false start and a missing clause', () => {
    const intendedText = 'Choisissez une carte accessible puis construisez-la pour développer votre cité.';
    const falseStart = auditNarrationPerformance({ intendedText, transcriptText: 'Choisissez une carte accessible puis con-con-construisez-la pour développer votre cité.', durationSec: 6 });
    expect(falseStart.status).toBe('FAIL');
    expect(falseStart.violations).toContain('partial-word-or-stutter-run');
    expect(auditNarrationPerformance({ intendedText, transcriptText: 'Choisissez une carte.', durationSec: 2 }).violations).toContain('transcript-content-mismatch');
  });

  test('narration QA tolerates ASR homophones while preserving restart gates', () => {
    const result = auditNarrationPerformance({
      intendedText: 'La position finale du pion rapporte zéro, deux, cinq ou dix points selon la zone atteinte.',
      transcriptText: 'La position finale du pion rapporte 0, 2, 5 ou 10 points selon la zone atteinte.',
      durationSec: 7,
    });
    expect(result.violations).not.toContain('transcript-content-mismatch');
  });

  test('mobile density, source detail, coherent military state, and panel use remain hard gates', () => {
    const plan = normalizeVisualPlan({
      ruleAtomId: 'unseen-track', actualGameAssetIds: ['track'], mobileMinimumAssetWidthPx: 220,
      comparisonMinimumSourcePixelsPerDisplayPixel: 0.8,
      gameState: { militaryTrackState: 'IN_GAME', conflictPawnVisible: false },
      panelUtilization: { usefulContentRatio: 0.12, availableAreaRatio: 0.7 }, reviewState: 'accepted',
    }, { id: 'unseen-track', domain: 'action', componentRefs: ['track'] });
    const result = validateVisualPlan(plan, [real('track', { minimumRenderedWidthPx: 150, trueSourcePixelsPerDisplayPixel: 0.62 })]);
    expect(result.violations).toEqual(expect.arrayContaining([
      'instructional-asset-below-mobile-minimum', 'comparison-source-detail-below-minimum',
      'in-game-military-track-missing-conflict-pawn', 'in-game-military-token-state-unspecified',
      'severe-panel-under-utilization',
    ]));
  });

  test('continuous real coffee pour replaces the rejected isolated plop contract', () => {
    const pour = BRAND_AUDIO_CONTRACT.layers.find((layer) => layer.id === 'cafe-cup-saucer');
    expect(pour).toMatchObject({ kind: 'recorded-continuous-coffee-pour-into-cup', isolatedDropForbidden: true, license: 'CC0-1.0' });
    expect(pour.minimumContinuousPourSec).toBeGreaterThanOrEqual(2.2);
    expect(pour.selectedExcerptSec[1] - pour.selectedExcerptSec[0]).toBeGreaterThanOrEqual(2.2);
  });

  test('R10 project data contains dedicated Guild, real end-of-Age, HD chain, and bullet panel plans', () => {
    const file = path.resolve('config/projects/7-wonders-duel/visual-plan.r10.json');
    if (!fs.existsSync(file)) return;
    const plans = JSON.parse(fs.readFileSync(file, 'utf8')).plans;
    expect(plans.find((p) => p.ruleAtomId === 'guild-system')).toMatchObject({ compositionType: 'REAL_GUILD_TEACHING', minimumRepresentativeAssets: 3 });
    expect(plans.find((p) => p.ruleAtomId === 'end-of-age').compositionType).toBe('REAL_END_OF_AGE_TRANSITION');
    expect(plans.find((p) => p.ruleAtomId === 'chain-construction')).toMatchObject({ compositionType: 'REAL_CHAIN_COMPARISON', comparisonMinimumSourcePixelsPerDisplayPixel: 0.8 });
    expect(plans.find((p) => p.ruleAtomId === 'tie-breaker').multiIdeaBullets).toBe(true);
  });

  test('an animation base cannot replace a complete reviewed frame without renderable cues', () => {
    const staticAsset = { filePath: 'complete.png', animationBaseFramePath: 'empty-base.png', timedOverlayTimeline: [], motionCueTimeline: [] };
    expect(resolveStoryboardBackground(staticAsset)).toBe('complete.png');
    expect(resolveStoryboardBackground({ ...staticAsset, motionCueTimeline: [{ startSec: 1, endSec: 2 }] })).toBe('empty-base.png');
  });
});
