const {
  BRAND_AUDIO_CONTRACT,
  getEditorialContract,
  getNarrationPreset,
  prepareNarrationText,
  buildEditorialSupport,
  buildSetupCallouts,
  estimateTeachingLayout,
  buildThematicWelcome,
} = require('../../src/services/editorialStandard.cjs');

describe('professional editorial standard', () => {
  test('exposes a versioned supported Amélie preset and brand mix contract', () => {
    const preset = getNarrationPreset();
    expect(preset.modelId).toBe('eleven_multilingual_v2');
    expect(preset.voiceSettings).toMatchObject({ stability: 0.34, similarity_boost: 0.78, style: 0.32, use_speaker_boost: true });
    expect(BRAND_AUDIO_CONTRACT.layers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'signature-motif' }),
      expect.objectContaining({ id: 'room-murmur', intelligibleSpeech: false }),
    ]));
    expect(getEditorialContract().version).toBe('mobius-professional-editorial-v5');
    expect(BRAND_AUDIO_CONTRACT.id).toBe('mobius-cafe-game-night-v2');
    expect(BRAND_AUDIO_CONTRACT.durationSec).toBeGreaterThan(8);
    expect(BRAND_AUDIO_CONTRACT.layers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'cafe-tableware' }),
      expect.objectContaining({ id: 'water-jet-ambience' }),
    ]));
  });

  test('turns ordinal setup delivery into conversational transitions without changing rules', () => {
    expect(prepareNarrationText('Premièrement, placez le plateau. Deuxièmement, mélangez les cartes.')).toBe('D’abord, placez le plateau. Ensuite, mélangez les cartes.');
  });

  test('keeps support copy concise and setup callout anchors bounded', () => {
    const support = buildEditorialSupport({
      section: 'Mise en place',
      narration: 'Premièrement, placez le plateau. Deuxièmement, mélangez les cartes. Troisièmement, révélez les Seigneurs.',
      onScreenText: 'A very long duplicate explanation that belongs in narration and should not occupy the teaching surface.',
    });
    expect(support.grouped).toBe(true);
    expect(support.text.length).toBeLessThanOrEqual(90);
    for (const callout of buildSetupCallouts(support.labels)) {
      expect(callout.target.x).toBeGreaterThanOrEqual(0.04);
      expect(callout.target.x).toBeLessThanOrEqual(0.96);
      expect(callout.target.y).toBeGreaterThanOrEqual(0.06);
      expect(callout.target.y).toBeLessThanOrEqual(0.94);
    }
  });

  test('reserves non-overlapping visual-dominant teaching geometry', () => {
    const layout = estimateTeachingLayout();
    expect(layout.overlap).toBe(false);
    expect(layout.visualAreaRatio).toBeGreaterThanOrEqual(0.70);
  });

  test('builds a source-backed thematic welcome without inventing game rules', () => {
    const text = buildThematicWelcome({
      gameName: 'Abyss',
      firstNarration: 'Bienvenue dans Abyss, un jeu de stratégie sous-marine pour deux à quatre joueurs.',
    });
    expect(text).toContain('Installez-vous');
    expect(text).toContain('stratégie sous-marine');
    expect(text).toContain('On se lance');
  });
});
