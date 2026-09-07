const {
  PRESENTATION_TOKENS,
  resolveFont,
  resolvePanelStyle,
  resolvePresentationLayout,
  solvePresentationLayout,
  assertLayoutContainment,
  inspectPresentationBoxArt,
} = require('../../src/services/presentationDesignSystem.cjs');
const { formatOpeningMetadataNarration } = require('../../src/services/editorialStandard.cjs');
const { buildBrandIntro, buildMetadataScene } = require('../../src/storyboard/tutorial_presentation.cjs');

describe('MOBIUS presentation design system', () => {
  test('resolves bundled deterministic fonts and warm panel variants', () => {
    expect(resolveFont('display')).toMatchObject({ family: 'Lora', available: true });
    expect(resolveFont('body')).toMatchObject({ family: 'Nunito', available: true });
    expect(resolvePanelStyle('WARM_DARK').fill).toBe('#32231c');
    expect(resolvePanelStyle('WARM_DARK').fill).not.toMatch(/black/i);
  });

  test('keeps dense content readable and grows panel before shrinking type', () => {
    const compact = resolvePresentationLayout({ itemCount: 3, maxItemLength: 20, contentType: 'body' });
    const dense = resolvePresentationLayout({ itemCount: 8, maxItemLength: 42, contentType: 'metadata', preferredFontPx: 48, minimumFontPx: 40 });
    expect(dense.panelWidthRatio).toBeGreaterThanOrEqual(compact.panelWidthRatio);
    expect(dense.panelHeight).toBeGreaterThan(compact.panelHeight);
    expect(dense.fontSizePx).toBeGreaterThanOrEqual(40);
  });

  test('keeps one logical metadata item per source line when the region allows it', () => {
    const scene = buildMetadataScene({
      gameName: 'Terraforming Mars',
      identity: { displayName: 'Terraforming Mars', spokenName: 'Terraforming Mars' },
      metadata: { playerCount: '1-5', gameLength: '120 minutes', designers: ['Jacob Fryxelius'], publisher: 'FryxGames' },
      durationSec: 10,
    });
    const body = scene.overlays.find((overlay) => overlay.type === 'body');
    expect(body.text.split('\n')).toEqual(['Joueurs : 1-5', 'Durée : 120 minutes', 'Auteurs : Jacob Fryxelius', 'Éditeur : FryxGames']);
  });

  test('keeps age, weight and mechanics visual-only in default opening speech', () => {
    const text = formatOpeningMetadataNarration({
      identity: { displayName: '7 Wonders Duel', spokenName: 'Seven Wonders Duel', pronunciationRepresentation: 'Seven Wonders duèl' },
      metadata: { playerCount: '2', gameLength: '30 minutes', minimumAge: '10', weight: '2.23', mechanics: ['Drafting'], designers: ['Antoine Bauza', 'Bruno Cathala'], publisher: 'Repos Production' },
    });
    expect(text).toContain('pour deux joueurs');
    expect(text).toContain('Antoine Bauza et Bruno Cathala');
    expect(text).not.toMatch(/âge|ans|complexité|poids|drafting|mécanique/i);
  });

  test('brand stage has no TTS and uses only the signature role', () => {
    const intro = buildBrandIntro({ audio: { ambientFile: 'signature.wav' } });
    expect(intro.narrationText).toBe('');
    expect(intro.ttsGenerated).toBe(false);
    expect(intro.overlays).toEqual([]);
    expect(intro.audio).toMatchObject({ speechRequired: false, audioRole: 'café-ludique sonic signature' });
  });

  test('box-art quality inspection rejects an HD-inadequate source deterministically', async () => {
    const report = await inspectPresentationBoxArt('src/assets/games/7-wonders-duel-box-art-bgg-front.webp');
    expect(report.sourceDimensions.width).toBe(601);
    expect(report.excessiveMatte).toBe(false);
    expect(report.qualityPass).toBe(false);
    expect(report.reason).toBe('low-resolution-for-hd');
  });

  test('keeps the 7 Wonders opening metadata and victory language semantically separate', () => {
    const { buildMetadataScene, buildTeachingScene } = require('../../src/storyboard/tutorial_presentation.cjs');
    const metadata = buildMetadataScene({
      gameName: '7 Wonders Duel',
      identity: { displayName: '7 Wonders Duel', spokenName: 'Seven Wonders Duel', pronunciationRepresentation: 'Seven Wonders duèl' },
      metadata: { playerCount: '2', gameLength: '30 minutes', designers: ['Antoine Bauza', 'Bruno Cathala'], publisher: 'Repos Production', mechanics: ['Drafting', 'Card Drafting', 'Resource Management'] },
      durationSec: 20,
    });
    const body = metadata.overlays.find((overlay) => overlay.type === 'body').text;
    expect(body).toContain('Éditeur : Repos Production');
    expect(metadata.overlays.find((overlay) => overlay.type === 'tags').text).toContain('Mécanismes :');
    const objective = buildTeachingScene({
      id: 'objective', index: 1, total: 3, section: 'Objectif du jeu',
      narration: 'Trois voies de victoire.', onScreenText: '• Suprématie militaire\n• Suprématie scientifique\n• Victoire civile (points de victoire à la fin de l’âge III)', preserveLineBreaks: true,
    });
    expect(objective.overlays.find((overlay) => overlay.type === 'body').text).toContain('Suprématie militaire');
    expect(objective.overlays.find((overlay) => overlay.type === 'body').text).not.toContain('\n(points');
  });

  test('content-aware solver contains metadata title and every semantic block inside the selected panel', () => {
    const layout = solvePresentationLayout({
      sceneType: 'metadata',
      title: '7 Wonders Duel',
      body: 'Joueurs : 2\nDurée : 30 minutes\nAuteurs : Antoine Bauza et Bruno Cathala\nÉditeur : Repos Production\nÂge minimum : 10+\nComplexité : 2,23 / 5\nAnnée : 2015',
      tags: 'Mécanismes : Drafting · Card Drafting · Resource Management',
      itemCount: 7,
      preferredFontPx: 50,
      minimumFontPx: 44,
      textSide: 'left',
      imageSide: 'right',
    });
    expect(layout.candidateCount).toBeGreaterThan(1);
    expect(layout.hardConstraintsSatisfied).toBe(true);
    expect(layout.titleY).toBeGreaterThanOrEqual(layout.panelY);
    expect(layout.titleY + layout.titleLines * layout.titleFontPx).toBeLessThanOrEqual(layout.panelY + layout.panelHeight);
    const containment = assertLayoutContainment(layout, [
      { name: 'title', left: layout.panelX + layout.padding, right: layout.panelX + layout.padding + layout.textWidth, top: layout.titleY, bottom: layout.titleY + layout.titleLines * layout.titleFontPx },
      { name: 'body', left: layout.panelX + layout.padding, right: layout.panelX + layout.textWidth, top: layout.bodyY, bottom: layout.bodyY + layout.bodyLines * layout.bodyLineHeightPx },
    ]);
    expect(containment).toMatchObject({ valid: true, violations: [] });
  });

  test('rejects generic black panel fallback and records deterministic surface treatment', () => {
    expect(PRESENTATION_TOKENS.colors.panelWarmDark).not.toBe('#000000');
    expect(PRESENTATION_TOKENS.surfaceTexture).toBe('procedural-walnut-grain-v1');
  });

  test('generalizes containment and density solving to an unseen game', () => {
    const layout = solvePresentationLayout({
      sceneType: 'metadata',
      title: 'North Sea Traders',
      body: 'Joueurs : 2-4\nDurée : environ 75 minutes\nAuteurs : Une équipe de conception assez longue\nÉditeur : Une maison d’édition imaginaire\nAnnée : 2026',
      tags: 'Mécanismes : Gestion de ressources · Navigation',
      itemCount: 5,
      preferredFontPx: 52,
      minimumFontPx: 44,
      textSide: 'left',
      imageSide: 'right',
      imageAspect: 0.72,
      contentDensity: 'medium',
    });
    expect(layout.candidateCount).toBeGreaterThan(1);
    expect(layout.hardConstraintsSatisfied).toBe(true);
    expect(layout.bodyFontPx).toBeGreaterThanOrEqual(44);
    expect(assertLayoutContainment(layout, [
      { name: 'title', left: layout.panelX + layout.padding, right: layout.panelX + layout.textWidth, top: layout.titleY, bottom: layout.titleY + layout.titleLines * layout.titleFontPx },
      { name: 'body', left: layout.panelX + layout.padding, right: layout.panelX + layout.textWidth, top: layout.bodyY, bottom: layout.bodyY + layout.bodyLines * layout.bodyLineHeightPx },
    ])).toMatchObject({ valid: true, violations: [] });
  });
});
