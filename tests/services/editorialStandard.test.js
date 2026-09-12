const {
  BRAND_AUDIO_CONTRACT,
  getEditorialContract,
  getNarrationPreset,
  prepareNarrationText,
  buildEditorialSupport,
  buildSetupCallouts,
  estimateTeachingLayout,
  buildThematicWelcome,
  formatOpeningMetadataNarration,
  evaluateProfessionalReleaseGate,
} = require('../../src/services/editorialStandard.cjs');

describe('professional editorial standard', () => {
  test('exposes a versioned supported Amélie preset and brand mix contract', () => {
    const preset = getNarrationPreset();
    expect(preset.modelId).toBe('eleven_multilingual_v2');
    expect(preset.voiceSettings).toMatchObject({ stability: 0.34, similarity_boost: 0.78, style: 0.32, use_speaker_boost: true });
    expect(BRAND_AUDIO_CONTRACT.layers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'room-murmur', intelligibleSpeech: false }),
      expect.objectContaining({ id: 'cafe-cup-saucer', intelligibleSpeech: false }),
      expect.objectContaining({ id: 'dice-roll-landing', intelligibleSpeech: false }),
    ]));
    expect(getEditorialContract().version).toBe('mobius-professional-editorial-v6');
    expect(BRAND_AUDIO_CONTRACT.id).toBe('mobius-cafe-game-night-v4');
    expect(BRAND_AUDIO_CONTRACT.layers.find((layer) => layer.id === 'room-murmur')).toMatchObject({
      selectedExcerptSec: [20, 23.6],
      continuityRequired: true,
    });
    expect(BRAND_AUDIO_CONTRACT.transition.roomBedContinuousAcrossSignature).toBe(true);
    expect(BRAND_AUDIO_CONTRACT.durationSec).toBeGreaterThanOrEqual(3);
    expect(BRAND_AUDIO_CONTRACT.durationSec).toBeLessThanOrEqual(4);
    expect(BRAND_AUDIO_CONTRACT.transition.fadeOutSec).toBeGreaterThan(0);
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

  test('sanitizes filename and hash-derived identities before spoken use', () => {
    const { sanitizeSpokenGameName } = require('../../src/services/editorialStandard.cjs');
    expect(sanitizeSpokenGameName('fa06788222239dcc-TM_RULES_ENG_BGG.pdf')).not.toMatch(/[a-f0-9]{12,}|\.pdf|RULES|BGG/i);
    expect(sanitizeSpokenGameName('Terraforming Mars')).toBe('Terraforming Mars');
  });

  test('builds a source-backed thematic welcome without inventing game rules', () => {
    const text = buildThematicWelcome({
      gameName: 'Abyss',
      firstNarration: 'Bienvenue dans Abyss, un jeu de stratégie sous-marine pour deux à quatre joueurs.',
    });
    expect(text).toContain('Bienvenue sur la chaîne Les Jeux Mobius.');
    expect(text).toContain('stratégie sous-marine');
    expect(text).toContain('Abyss');
  });

  test('formats the opening as natural metadata speech and keeps complexity visual-only', () => {
    const text = formatOpeningMetadataNarration({
      identity: { displayName: '7 Wonders Duel', pronunciationRepresentation: 'Seven Wonders duèl' },
      metadata: {
        playerCount: '2', gameLength: '30 minutes', minimumAge: '10', weight: '2.23',
        designers: ['Antoine Bauza', 'Bruno Cathala'], publisher: 'Repos Production', yearPublished: '2015',
      },
      themeHook: 'Dans 7 Wonders Duel, deux civilisations s’affrontent.',
    });
    expect(text).toContain('Bienvenue sur la chaîne Les Jeux Mobius. Aujourd’hui, nous allons découvrir ensemble Seven Wonders duèl.');
    expect(text).toContain('C’est un jeu pour deux joueurs, d’une durée d’environ trente minutes.');
    expect(text).toContain('Il a été conçu par Antoine Bauza et Bruno Cathala et publié par Repos Production.');
    expect(text).not.toMatch(/à partir de dix ans|en 2015/);
    expect(text).not.toMatch(/complexité|2\.23/i);
    expect(text).toContain('Dans Seven Wonders duèl, deux civilisations s’affrontent.');
  });

  test('normalizes symbols for speech while preserving a separate display representation', () => {
    expect(prepareNarrationText('Température : +8°C. Oxygène : 14 %. Océans : 9. L’objectif d’Amélie.'))
      .toBe('Température: plus huit degrés Celsius. Oxygène: quatorze pour cent. Océans: neuf. L’objectif d’Amélie.');
  });

  test('keeps rejected external findings out of the publish gate', () => {
    const gate = evaluateProfessionalReleaseGate({
      deterministicPass: true,
      visuals: { missing: 0 },
      editorial: { layoutCollisions: [] },
      media: { valid: true, video: { width: 1920, height: 1080 } },
      captions: { count: 2, valid: true },
      chapters: { count: 2, order: 'valid' },
      narration: { total: 2, complete: true },
      provenance: { sourceGrounded: true, complete: true },
      branding: { bannerPresent: true, introPresent: true, outroPresent: true },
      physicalReview: { completed: true },
      calibration: {
        verified_external_qa_score_10: 9,
        finding_status_counts: { rejected: 1 },
        findings: [{ severity: 'P0', physicalVerification: { status: 'rejected' } }],
      },
    });
    expect(gate.verdict).toBe('PUBLISHABLE');
    expect(gate.confirmedCounts.p0).toBe(0);
  });

  test('blocks publishability for a confirmed critical P2', () => {
    const gate = evaluateProfessionalReleaseGate({
      deterministicPass: true,
      visuals: { missing: 0 },
      editorial: { layoutCollisions: [] },
      media: { valid: true, video: { width: 1920, height: 1080 } },
      captions: { count: 2, valid: true },
      chapters: { count: 2, order: 'valid' },
      narration: { total: 2, complete: true },
      provenance: { sourceGrounded: true, complete: true },
      branding: { bannerPresent: true, introPresent: true, outroPresent: true },
      physicalReview: { completed: true },
      calibration: {
        verified_external_qa_score_10: 9,
        findings: [{ severity: 'P2', category: 'visual_relevance_and_variety', physicalVerification: { status: 'confirmed' } }],
      },
    });
    expect(gate.verdict).toBe('NOT_READY');
    expect(gate.unresolvedVerifiedBlockers).toContain('confirmed-critical-p2');
  });

  test('allows a physically justified external-score exception without trusting raw score', () => {
    const gate = evaluateProfessionalReleaseGate({
      deterministicPass: true,
      visuals: { missing: 0 },
      editorial: { layoutCollisions: [] },
      media: { valid: true, video: { width: 1920, height: 1080 } },
      captions: { count: 2, valid: true },
      chapters: { count: 2, order: 'valid' },
      narration: { total: 2, complete: true },
      provenance: { sourceGrounded: true, complete: true },
      branding: { bannerPresent: true, introPresent: true, outroPresent: true },
      physicalReview: { completed: true },
      calibration: {
        verified_external_qa_score_10: 7.85,
        scoreException: { accepted: true, basis: 'Physical inspection and deterministic audio evidence reject the external critic limitation; all release-critical gates pass.' },
        findings: [],
      },
    });
    expect(gate.verdict).toBe('PUBLISHABLE');
    expect(gate.scoreRequirement).toBe('exceptional-physical-justification');
  });

  test('accepts the production caption validator DTO', () => {
    const gate = evaluateProfessionalReleaseGate({
      deterministicPass: true,
      visuals: { missing: 0 },
      editorial: { layoutCollisions: [] },
      media: { valid: true, video: { width: 1920, height: 1080 } },
      captions: { blocks: 16, lastEndSec: 305.147, overlaps: 0, valid: true },
      chapters: { count: 16, order: 'valid' },
      narration: { total: 16, complete: true },
      provenance: { sourceGrounded: true, complete: true },
      branding: { bannerPresent: true, introPresent: true, outroPresent: true },
      physicalReview: { completed: true },
      calibration: {
        verified_external_qa_score_10: 8.5,
        findings: [],
      },
    });
    expect(gate.unresolvedVerifiedBlockers).not.toContain('caption-contract-failed');
    expect(gate.verdict).toBe('PUBLISHABLE');
  });

  test('does not promote a partial finding to a confirmed hard blocker', () => {
    const gate = evaluateProfessionalReleaseGate({
      deterministicPass: true,
      visuals: { missing: 0 },
      editorial: { layoutCollisions: [] },
      media: { valid: true, video: { width: 1920, height: 1080 } },
      captions: { blocks: 1, valid: true },
      chapters: { count: 1, order: 'valid' },
      narration: { total: 1, complete: true },
      provenance: { sourceGrounded: true, complete: true },
      branding: { bannerPresent: true, introPresent: true, outroPresent: true },
      physicalReview: { completed: true },
      calibration: {
        verified_external_qa_score_10: 7.85,
        scoreException: { accepted: true, basis: 'Physical inspection confirms all release-critical gates pass; the external finding remains only partially verified.' },
        findings: [{ severity: 'P1', category: 'visual_relevance_and_variety', physicalVerification: { status: 'partially_confirmed' } }],
      },
    });
    expect(gate.confirmedCounts.p1).toBe(0);
    expect(gate.verdict).toBe('PUBLISHABLE');
  });
});
