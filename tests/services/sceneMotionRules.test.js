/**
 * Tests for deterministic motion and pacing primitives.
 */

let assignSceneMotion, applyMotionToStoryboard, selectMotionType, MIN_MOTION_DURATION;

beforeAll(async () => {
  const mod = await import('../../src/services/sceneMotionRules.js');
  assignSceneMotion = mod.assignSceneMotion;
  applyMotionToStoryboard = mod.applyMotionToStoryboard;
  selectMotionType = mod.selectMotionType;
  MIN_MOTION_DURATION = mod.MIN_MOTION_DURATION;
});

describe('sceneMotionRules', () => {
  describe('selectMotionType', () => {
    test('explicit motionType override is preserved', () => {
      const scene = { id: 's1', type: 'setup_step', imageId: 'img', durationSec: 5, motionType: 'panLeft' };
      expect(selectMotionType(scene)).toBe('panLeft');
    });

    test('short scene always returns hold', () => {
      const scene = { id: 's1', type: 'setup_step', imageId: 'img', durationSec: 1.5 };
      expect(selectMotionType(scene)).toBe('hold');
    });

    test('scene without image always returns hold', () => {
      const scene = { id: 's1', type: 'setup_step', durationSec: 8 };
      expect(selectMotionType(scene)).toBe('hold');
    });

    test('fullBleed layout selects slowZoomIn', () => {
      const scene = { id: 's1', type: 'setup_step', imageId: 'img', durationSec: 5, composition: { layout: 'fullBleed' } };
      expect(selectMotionType(scene)).toBe('slowZoomIn');
    });

    test('topImageBottomText layout selects slowZoomOut', () => {
      const scene = { id: 's1', type: 'scoring', imageId: 'img', durationSec: 5, composition: { layout: 'topImageBottomText' } };
      expect(selectMotionType(scene)).toBe('slowZoomOut');
    });

    test('imageLeftTextRight layout selects hold', () => {
      const scene = { id: 's1', type: 'component', imageId: 'img', durationSec: 5, composition: { layout: 'imageLeftTextRight' } };
      expect(selectMotionType(scene)).toBe('hold');
    });

    test('textOnly layout selects hold', () => {
      const scene = { id: 's1', type: 'intro', durationSec: 5, composition: { layout: 'textOnly' } };
      expect(selectMotionType(scene)).toBe('hold');
    });

    test('gameplay type without layout selects panRight', () => {
      const scene = { id: 's1', type: 'gameplay', imageId: 'img', durationSec: 5 };
      expect(selectMotionType(scene)).toBe('panRight');
    });
  });

  describe('assignSceneMotion', () => {
    test('returns complete motion metadata', () => {
      const scene = { id: 's1', type: 'setup_step', imageId: 'img', durationSec: 6, composition: { layout: 'fullBleed' } };
      const motion = assignSceneMotion(scene);
      expect(motion.motionType).toBe('slowZoomIn');
      expect(motion.motionParams.startScale).toBe(1.0);
      expect(motion.motionParams.endScale).toBeGreaterThan(1.0);
      expect(motion.transitionIn).toBe('cut');
      expect(motion.transitionOut).toBe('cut');
      expect(motion.motionDuration).toBeGreaterThan(0);
      expect(motion.holdDuration).toBe(0);
    });

    test('hold scene has holdDuration equal to scene duration', () => {
      const scene = { id: 's1', type: 'intro', durationSec: 4 };
      const motion = assignSceneMotion(scene);
      expect(motion.motionType).toBe('hold');
      expect(motion.holdDuration).toBe(4);
      expect(motion.motionDuration).toBe(0);
    });

    test('intro scene gets crossfade transitions', () => {
      const scene = { id: 's1', type: 'intro', durationSec: 5 };
      const motion = assignSceneMotion(scene);
      expect(motion.transitionIn).toBe('crossfade');
      expect(motion.transitionOut).toBe('crossfade');
      expect(motion.crossfadeDuration).toBeGreaterThan(0);
    });

    test('warns when transitions consume too much duration', () => {
      const scene = { id: 's1', type: 'intro', durationSec: 1.2 };
      const motion = assignSceneMotion(scene);
      expect(motion.motionWarnings).toBeDefined();
      expect(motion.motionWarnings[0]).toContain('transitions consume');
    });

    test('no warning for normal duration scenes', () => {
      const scene = { id: 's1', type: 'setup_step', imageId: 'img', durationSec: 8 };
      const motion = assignSceneMotion(scene);
      expect(motion.motionWarnings).toBeUndefined();
    });

    test('explicit transitionIn/Out overrides are preserved', () => {
      const scene = { id: 's1', type: 'intro', durationSec: 5, transitionIn: 'cut', transitionOut: 'cut' };
      const motion = assignSceneMotion(scene);
      expect(motion.transitionIn).toBe('cut');
      expect(motion.transitionOut).toBe('cut');
    });
  });

  describe('applyMotionToStoryboard', () => {
    test('applies motion to all scenes', () => {
      const scenes = [
        { id: 's1', type: 'intro', durationSec: 4 },
        { id: 's2', type: 'setup_step', imageId: 'img', durationSec: 6, composition: { layout: 'fullBleed' } },
        { id: 's3', type: 'end_card', durationSec: 3 },
      ];
      const { scenesWithMotion, warnings } = applyMotionToStoryboard(scenes);
      expect(scenesWithMotion).toHaveLength(3);
      expect(scenesWithMotion[0].motion.motionType).toBe('hold');
      expect(scenesWithMotion[1].motion.motionType).toBe('slowZoomIn');
      expect(scenesWithMotion[2].motion.motionType).toBe('hold');
    });

    test('collects warnings across scenes', () => {
      const scenes = [
        { id: 's1', type: 'intro', durationSec: 0.8 },
      ];
      const { warnings } = applyMotionToStoryboard(scenes);
      expect(warnings.length).toBeGreaterThan(0);
    });

    test('empty input returns empty arrays', () => {
      const { scenesWithMotion, warnings } = applyMotionToStoryboard([]);
      expect(scenesWithMotion).toHaveLength(0);
      expect(warnings).toHaveLength(0);
    });

    test('preserves original scene fields', () => {
      const scenes = [{ id: 's1', type: 'intro', durationSec: 5, overlays: [{ text: 'hi' }] }];
      const { scenesWithMotion } = applyMotionToStoryboard(scenes);
      expect(scenesWithMotion[0].id).toBe('s1');
      expect(scenesWithMotion[0].overlays[0].text).toBe('hi');
      expect(scenesWithMotion[0].motion).toBeDefined();
    });
  });
});
