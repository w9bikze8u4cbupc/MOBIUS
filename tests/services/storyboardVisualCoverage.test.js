/**
 * Tests for storyboard visual coverage validator.
 */

let validateStoryboardVisualCoverage, classifyScene;

beforeAll(async () => {
  const mod = await import('../../src/services/storyboardVisualCoverage.js');
  validateStoryboardVisualCoverage = mod.validateStoryboardVisualCoverage;
  classifyScene = mod.classifyScene;
});

describe('storyboardVisualCoverage', () => {
  describe('classifyScene', () => {
    test('explicit high-confidence image is covered', () => {
      const scene = { id: 's1', type: 'setup_step', imageId: 'img-1', visualMatchConfidence: 0.9, visualMatchReason: 'component-id-match' };
      const result = classifyScene(scene);
      expect(result.classification).toBe('covered');
      expect(result.confidence).toBe(0.9);
    });

    test('scene with background image is covered', () => {
      const scene = { id: 's1', type: 'setup_step', background: { image: '/path/to/img.png' } };
      const result = classifyScene(scene);
      expect(result.classification).toBe('covered');
    });

    test('intro scene without image is intentionalFallback', () => {
      const scene = { id: 's1', type: 'intro' };
      const result = classifyScene(scene);
      expect(result.classification).toBe('intentionalFallback');
      expect(result.reason).toContain('intro');
    });

    test('end_card scene without image is intentionalFallback', () => {
      const scene = { id: 's1', type: 'end_card' };
      const result = classifyScene(scene);
      expect(result.classification).toBe('intentionalFallback');
    });

    test('setup_step without image is blocked', () => {
      const scene = { id: 's1', type: 'setup_step' };
      const result = classifyScene(scene);
      expect(result.classification).toBe('blocked');
      expect(result.warning).toContain('requires image');
    });

    test('component scene without image is blocked', () => {
      const scene = { id: 's1', type: 'component' };
      const result = classifyScene(scene);
      expect(result.classification).toBe('blocked');
    });

    test('low-confidence match produces warn', () => {
      const scene = { id: 's1', type: 'setup_step', imageId: 'img-1', visualMatchConfidence: 0.3, visualMatchReason: 'heuristic' };
      const result = classifyScene(scene);
      expect(result.classification).toBe('warn');
      expect(result.warning).toContain('low confidence');
    });

    test('unknown type without image produces warn (not block)', () => {
      const scene = { id: 's1', type: 'mystery' };
      const result = classifyScene(scene);
      expect(result.classification).toBe('warn');
    });
  });

  describe('validateStoryboardVisualCoverage', () => {
    test('all scenes covered returns pass', () => {
      const scenes = [
        { id: 's1', type: 'intro' },
        { id: 's2', type: 'setup_step', imageId: 'img-1', visualMatchConfidence: 0.9 },
        { id: 's3', type: 'end_card' },
      ];
      const result = validateStoryboardVisualCoverage(scenes);
      expect(result.status).toBe('pass');
      expect(result.coveredCount).toBe(1);
      expect(result.fallbackCount).toBe(2);
      expect(result.warningCount).toBe(0);
      expect(result.blockedCount).toBe(0);
      expect(result.coverageRatio).toBe(1);
    });

    test('blocked scene produces warn status by default', () => {
      const scenes = [
        { id: 's1', type: 'intro' },
        { id: 's2', type: 'setup_step' },  // no image → blocked
      ];
      const result = validateStoryboardVisualCoverage(scenes);
      expect(result.status).toBe('warn');
      expect(result.blockedCount).toBe(1);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('strict mode blocks on required missing visual', () => {
      const scenes = [
        { id: 's1', type: 'setup_step' },  // no image → blocked
      ];
      const result = validateStoryboardVisualCoverage(scenes, { strict: true });
      expect(result.status).toBe('blocked');
    });

    test('coverage ratio reflects covered + fallback over total', () => {
      const scenes = [
        { id: 's1', type: 'intro' },                    // fallback
        { id: 's2', type: 'setup_step', imageId: 'x', visualMatchConfidence: 0.9 },  // covered
        { id: 's3', type: 'scoring' },                   // blocked
        { id: 's4', type: 'end_card' },                  // fallback
      ];
      const result = validateStoryboardVisualCoverage(scenes);
      expect(result.coveredCount).toBe(1);
      expect(result.fallbackCount).toBe(2);
      expect(result.blockedCount).toBe(1);
      expect(result.coverageRatio).toBe(0.75);
    });

    test('empty scenes returns pass with 100% coverage', () => {
      const result = validateStoryboardVisualCoverage([]);
      expect(result.status).toBe('pass');
      expect(result.coverageRatio).toBe(1);
      expect(result.totalScenes).toBe(0);
    });

    test('warnings contain scene IDs and types', () => {
      const scenes = [
        { id: 'scene-setup-tokens', type: 'setup_step' },
      ];
      const result = validateStoryboardVisualCoverage(scenes);
      expect(result.warnings[0]).toContain('scene-setup-tokens');
      expect(result.warnings[0]).toContain('setup_step');
    });

    test('per-scene diagnostics are available', () => {
      const scenes = [
        { id: 's1', type: 'intro' },
        { id: 's2', type: 'setup_step', imageId: 'img', visualMatchConfidence: 0.8 },
      ];
      const result = validateStoryboardVisualCoverage(scenes);
      expect(result.scenes).toHaveLength(2);
      expect(result.scenes[0].sceneId).toBe('s1');
      expect(result.scenes[0].classification).toBe('intentionalFallback');
      expect(result.scenes[1].sceneId).toBe('s2');
      expect(result.scenes[1].classification).toBe('covered');
    });
  });
});
