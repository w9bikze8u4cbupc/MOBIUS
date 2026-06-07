/**
 * Tests for deterministic professional scene composition rules.
 */

let composeSceneLayout, composeStoryboardLayouts, selectLayout, LAYOUTS;

beforeAll(async () => {
  const mod = await import('../../src/services/sceneCompositionRules.js');
  composeSceneLayout = mod.composeSceneLayout;
  composeStoryboardLayouts = mod.composeStoryboardLayouts;
  selectLayout = mod.selectLayout;
  LAYOUTS = mod.LAYOUTS;
});

describe('sceneCompositionRules', () => {
  describe('selectLayout', () => {
    test('setup_step with image selects fullBleed', () => {
      const scene = { id: 's1', type: 'setup_step', imageId: 'img-1' };
      expect(selectLayout(scene)).toBe('fullBleed');
    });

    test('component with image selects imageLeftTextRight', () => {
      const scene = { id: 's1', type: 'component', imageId: 'img-1' };
      expect(selectLayout(scene)).toBe('imageLeftTextRight');
    });

    test('scoring with image selects topImageBottomText', () => {
      const scene = { id: 's1', type: 'scoring', imageId: 'img-1' };
      expect(selectLayout(scene)).toBe('topImageBottomText');
    });

    test('gameplay with image selects imageRightTextLeft', () => {
      const scene = { id: 's1', type: 'gameplay', imageRef: 'ref-1' };
      expect(selectLayout(scene)).toBe('imageRightTextLeft');
    });

    test('example with image selects centerFocus', () => {
      const scene = { id: 's1', type: 'example', background: { image: '/path.png' } };
      expect(selectLayout(scene)).toBe('centerFocus');
    });

    test('intro without image selects textOnly', () => {
      const scene = { id: 's1', type: 'intro' };
      expect(selectLayout(scene)).toBe('textOnly');
    });

    test('end_card without image selects textOnly', () => {
      const scene = { id: 's1', type: 'end_card' };
      expect(selectLayout(scene)).toBe('textOnly');
    });

    test('setup_step without image falls back to textOnly', () => {
      const scene = { id: 's1', type: 'setup_step' };
      expect(selectLayout(scene)).toBe('textOnly');
    });

    test('explicit layout override is respected', () => {
      const scene = { id: 's1', type: 'setup_step', imageId: 'img', layout: 'centerFocus' };
      expect(selectLayout(scene)).toBe('centerFocus');
    });

    test('unknown type with image defaults to fullBleed', () => {
      const scene = { id: 's1', type: 'mystery', imageId: 'img-1' };
      expect(selectLayout(scene)).toBe('fullBleed');
    });
  });

  describe('composeSceneLayout', () => {
    test('returns layout, imageRegion, textRegion, safeArea', () => {
      const scene = { id: 's1', type: 'setup_step', imageId: 'img-1' };
      const result = composeSceneLayout(scene, { resolution: { width: 1920, height: 1080 } });
      expect(result.layout).toBe('fullBleed');
      expect(result.imageRegion).toBeDefined();
      expect(result.textRegion).toBeDefined();
      expect(result.safeArea).toBeDefined();
      expect(result.backgroundMode).toBe('image');
    });

    test('textOnly scene has null imageRegion', () => {
      const scene = { id: 's1', type: 'intro' };
      const result = composeSceneLayout(scene);
      expect(result.layout).toBe('textOnly');
      expect(result.imageRegion).toBeNull();
      expect(result.textRegion).toBeDefined();
      expect(result.backgroundMode).toBe('color');
    });

    test('pixel regions are within resolution bounds', () => {
      const scene = { id: 's1', type: 'component', imageId: 'img' };
      const result = composeSceneLayout(scene, { resolution: { width: 1280, height: 720 } });
      expect(result.imageRegion.x + result.imageRegion.w).toBeLessThanOrEqual(1280);
      expect(result.imageRegion.y + result.imageRegion.h).toBeLessThanOrEqual(720);
      expect(result.textRegion.x + result.textRegion.w).toBeLessThanOrEqual(1280);
      expect(result.textRegion.y + result.textRegion.h).toBeLessThanOrEqual(720);
    });

    test('warns when too many overlays on fullBleed image', () => {
      const scene = {
        id: 's1', type: 'setup_step', background: { image: '/path.png' },
        overlays: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }],
      };
      const result = composeSceneLayout(scene);
      expect(result.compositionWarnings).toBeDefined();
      expect(result.compositionWarnings[0]).toContain('overlays');
    });

    test('no warning for scenes with few overlays', () => {
      const scene = { id: 's1', type: 'setup_step', imageId: 'img', overlays: [{ text: 'title' }] };
      const result = composeSceneLayout(scene);
      expect(result.compositionWarnings).toBeUndefined();
    });
  });

  describe('composeStoryboardLayouts', () => {
    test('applies composition to all scenes', () => {
      const scenes = [
        { id: 's1', type: 'intro' },
        { id: 's2', type: 'setup_step', imageId: 'img-board' },
        { id: 's3', type: 'end_card' },
      ];
      const { composedScenes, warnings } = composeStoryboardLayouts(scenes, { resolution: { width: 1920, height: 1080 } });
      expect(composedScenes).toHaveLength(3);
      expect(composedScenes[0].composition.layout).toBe('textOnly');
      expect(composedScenes[1].composition.layout).toBe('fullBleed');
      expect(composedScenes[2].composition.layout).toBe('textOnly');
      expect(warnings).toHaveLength(0);
    });

    test('collects composition warnings across scenes', () => {
      const scenes = [
        { id: 's1', type: 'setup_step', background: { image: '/p.png' }, overlays: [{}, {}, {}, {}] },
      ];
      const { warnings } = composeStoryboardLayouts(scenes);
      expect(warnings.length).toBeGreaterThan(0);
    });

    test('empty scenes returns empty arrays', () => {
      const { composedScenes, warnings } = composeStoryboardLayouts([]);
      expect(composedScenes).toHaveLength(0);
      expect(warnings).toHaveLength(0);
    });

    test('preserves original scene fields alongside composition', () => {
      const scenes = [{ id: 's1', type: 'intro', durationSec: 5, overlays: [{ type: 'title', text: 'Hello' }] }];
      const { composedScenes } = composeStoryboardLayouts(scenes);
      expect(composedScenes[0].id).toBe('s1');
      expect(composedScenes[0].durationSec).toBe(5);
      expect(composedScenes[0].overlays[0].text).toBe('Hello');
      expect(composedScenes[0].composition).toBeDefined();
    });
  });
});
