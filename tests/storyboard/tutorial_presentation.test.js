const {
  DEFAULT_BRAND,
  buildBrandIntro,
  buildBrandOutro,
  buildTeachingScene,
  buildChapters,
} = require('../../src/storyboard/tutorial_presentation.cjs');

describe('tutorial presentation contract', () => {
  test('uses Les Jeux Mobius French-first defaults for branded bookends', () => {
    const intro = buildBrandIntro();
    const outro = buildBrandOutro();

    expect(DEFAULT_BRAND.language).toBe('fr-CA');
    expect(DEFAULT_BRAND.narration.voiceName).toBe('Amélie');
    expect(intro.narrationText).toContain('Bienvenue sur la chaîne Mobius');
    expect(outro.narrationText).toContain('abonnez-vous');
    expect(intro.chapterTitle).toBe('Bienvenue');
    expect(outro.chapterTitle).toBe('Merci et à bientôt');
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
      expect.objectContaining({ type: 'badge', position: 'top', text: expect.stringContaining('Étape 1/4') }),
      expect.objectContaining({ type: 'heading', position: 'panel-heading' }),
      expect.objectContaining({ type: 'body', position: 'panel-body' }),
      expect.objectContaining({ type: 'reference', position: 'reference-bottom', text: 'Livret p. 7' }),
    ]));
    expect(scene.callouts).toHaveLength(1);
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
});
