const {
  DEFAULT_BRAND,
  buildBrandIntro,
  buildBrandOutro,
  buildTeachingScene,
  buildTeachingMotion,
  buildChapters,
} = require('../../src/storyboard/tutorial_presentation.cjs');

describe('tutorial presentation contract', () => {
  test('uses Les Jeux Mobius French-first defaults for branded bookends', () => {
    const intro = buildBrandIntro();
    const outro = buildBrandOutro();

    expect(DEFAULT_BRAND.language).toBe('fr-CA');
    expect(DEFAULT_BRAND.narration.voiceName).toBe('Amélie');
    expect(intro.narrationText).toContain('Bienvenue chez Les Jeux Mobius');
    expect(outro.narrationText).toContain('Merci d’avoir joué');
    expect(intro.editorial.brandAudio.id).toBe('mobius-cafe-game-night-v2');
    expect(intro.background.image).toBe(DEFAULT_BRAND.bannerPath);
    expect(intro.durationSec).toBeGreaterThan(8);
    expect(intro.chapterTitle).toBe('Bienvenue');
    expect(outro.chapterTitle).toBe('Merci et à bientôt');
    expect(outro.overlays).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'body', text: expect.stringContaining('Abonnez-vous') }),
    ]));
  });

  test('places instruction text opposite the visual and keeps the rule reference discreet', () => {
    const scene = buildTeachingScene({
      id: 'setup-deck',
      index: 0,
      total: 4,
      section: 'Installer le paquet de monstres',
      narration: 'Mélangez le paquet et placez-le ici.',
      onScreenText: '1. Mélangez le paquet.\n2. Placez-le à l’emplacement indiqué.',
      sourcePages: [7],
      background: { image: '/tmp/deck.png' },
      callouts: [{ kind: 'arrow', target: { x: 0.72, y: 0.48 }, label: '1' }],
      completedSteps: [1],
    });

    expect(scene.layout).toMatchObject({
      mode: 'split-teaching',
      imageSide: 'right',
      textSide: 'left',
      completedSteps: [1],
    });
    expect(scene.overlays).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'badge', position: 'top', text: 'Placement' }),
      expect.objectContaining({ type: 'heading', position: 'panel-heading' }),
      expect.objectContaining({ type: 'body', position: 'panel-body' }),
      expect.objectContaining({ type: 'reference', position: 'reference-bottom-left', text: 'Livret p. 7' }),
    ]));
    expect(scene.callouts).toHaveLength(1);
    expect(scene.layout.visualFocus).toEqual({ x: 0.72, y: 0.48 });
  });

  test('applies focused motion to long-enough demonstration visuals', () => {
    expect(buildTeachingMotion({ visualKind: 'component', durationSec: 12, visualFocus: { x: 0.7, y: 0.4 } }))
      .toMatchObject({ type: 'focus-zoom', startScale: 1, endScale: 1.08, anchor: { x: 0.7, y: 0.4 } });
    expect(buildTeachingMotion({ visualKind: 'focused-page-crop', durationSec: 12 }))
      .toMatchObject({ type: 'slow-zoom', startScale: 1, endScale: 1.07 });
    expect(buildTeachingMotion({ visualKind: 'rulebook-page-fallback', durationSec: 12 }))
      .toMatchObject({ type: 'hold' });
    expect(buildTeachingMotion({ visualKind: 'component', durationSec: 2 }))
      .toMatchObject({ type: 'hold' });
  });

  test('alternates visual placement and exports deterministic YouTube chapter starts', () => {
    const first = buildTeachingScene({ id: 'one', index: 0, total: 2, section: 'Mise en place', onScreenText: 'Préparez le plateau.', durationSec: 8 });
    const second = buildTeachingScene({ id: 'two', index: 1, total: 2, section: 'Actions principales', onScreenText: 'Choisissez une action.', durationSec: 12 });
    first.durationSec = 8;
    second.durationSec = 12;

    expect(second.layout).toMatchObject({ imageSide: 'left', textSide: 'right' });
    expect(buildChapters([first, second])).toEqual([
      { index: 1, startSec: 0, title: 'Mise en place', sceneId: 'one' },
      { index: 2, startSec: 8, title: 'Actions principales', sceneId: 'two' },
    ]);
  });

  test('groups setup support copy and derives progressive callouts from the spoken steps', () => {
    const scene = buildTeachingScene({
      id: 'setup', index: 0, total: 2, section: 'Mise en place',
      narration: 'Premièrement, placez le plateau au centre. Deuxièmement, mélangez les cartes. Troisièmement, révélez les Seigneurs dans la Cour.',
      onScreenText: '1. Plateau 2. Cartes 3. Cour', durationSec: 12,
    });
    expect(scene.layout.editorial).toMatchObject({ visualDominant: true, groupedSetup: true });
    expect(scene.overlays.find((overlay) => overlay.type === 'body').text).toContain('Repères');
    expect(scene.overlays.find((overlay) => overlay.type === 'body').text.length).toBeLessThanOrEqual(90);
    expect(scene.callouts).toHaveLength(3);
    expect(scene.callouts[0]).toMatchObject({ number: 1, kind: 'arrow', target: { x: expect.any(Number), y: expect.any(Number) } });
  });

  test('uses a metadata card and canonical section labels instead of numeric-only badges', () => {
    const { buildMetadataScene } = require('../../src/storyboard/tutorial_presentation.cjs');
    const scene = buildMetadataScene({
      gameName: 'Terraforming Mars',
      metadata: { playerCount: '1-5', gameLength: '120 minutes', publisher: 'FryxGames' },
      narration: 'Avant de commencer, voici Terraforming Mars et les informations essentielles.',
      background: { image: '/tmp/cover.png' },
      durationSec: 8,
    });
    expect(scene.id).toBe('metadata-card');
    expect(scene.chapterTitle).toBe('À propos du jeu');
    expect(scene.overlays.find((overlay) => overlay.type === 'body').text).toContain('Joueurs: 1-5');
    expect(scene.overlays.find((overlay) => overlay.type === 'badge').text).toBe('À propos du jeu');
  });
});
