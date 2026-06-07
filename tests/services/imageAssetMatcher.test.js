/**
 * Tests for deterministic image-to-scene visual matcher.
 */

const path = require('path');

let matchScenesToImages, normalizeForMatch, findBestMatch;

beforeAll(async () => {
  const mod = await import('../../src/services/imageAssetMatcher.js');
  matchScenesToImages = mod.matchScenesToImages;
  normalizeForMatch = mod.normalizeForMatch;
  findBestMatch = mod.findBestMatch;
});

const TEST_IMAGE = path.resolve(__dirname, '../fixtures/images/test-bg-100x100.png');

describe('imageAssetMatcher', () => {
  describe('normalizeForMatch', () => {
    test('lowercases and strips special characters', () => {
      expect(normalizeForMatch('Setup-Phase_1!')).toBe('setupphase1');
    });

    test('collapses whitespace', () => {
      expect(normalizeForMatch('  hello   world  ')).toBe('hello world');
    });

    test('handles null/undefined', () => {
      expect(normalizeForMatch(null)).toBe('');
      expect(normalizeForMatch(undefined)).toBe('');
    });
  });

  describe('matchScenesToImages', () => {
    test('preserves explicit scene imageId without overwriting', () => {
      const scenes = [
        { id: 'scene-1', type: 'intro', imageId: 'explicit-img' },
      ];
      const images = [
        { id: 'other-img', tags: ['box-art'], renderPath: TEST_IMAGE },
      ];

      const { matchedScenes } = matchScenesToImages(scenes, images);
      expect(matchedScenes[0].imageId).toBe('explicit-img');
      expect(matchedScenes[0].visualMatchConfidence).toBe(1.0);
      expect(matchedScenes[0].visualMatchReason).toBe('explicit-assignment');
    });

    test('preserves explicit scene imageRef without overwriting', () => {
      const scenes = [
        { id: 'scene-1', type: 'intro', imageRef: 'manual-ref' },
      ];
      const images = [
        { id: 'box-img', tags: ['box-art'], renderPath: TEST_IMAGE },
      ];

      const { matchedScenes } = matchScenesToImages(scenes, images);
      expect(matchedScenes[0].imageRef).toBe('manual-ref');
      expect(matchedScenes[0].visualMatchConfidence).toBe(1.0);
    });

    test('matches by component ID in scene segmentId', () => {
      const scenes = [
        { id: 'scene-setup-cards', segmentId: 'cards', type: 'setup_step' },
      ];
      const images = [
        { id: 'cards', name: 'Cards', tags: ['component'], renderPath: TEST_IMAGE },
        { id: 'board', name: 'Board', tags: ['board'], renderPath: TEST_IMAGE },
      ];

      const { matchedScenes } = matchScenesToImages(scenes, images);
      expect(matchedScenes[0].imageId).toBe('cards');
      expect(matchedScenes[0].visualMatchReason).toBe('component-id-match');
      expect(matchedScenes[0].visualMatchConfidence).toBeGreaterThan(0.8);
    });

    test('matches by image tag aligned with scene type', () => {
      const scenes = [
        { id: 'scene-intro', type: 'intro' },
      ];
      const images = [
        { id: 'bg-1', tags: ['box-art'], renderPath: TEST_IMAGE },
        { id: 'bg-2', tags: ['component'], renderPath: TEST_IMAGE },
      ];

      const { matchedScenes } = matchScenesToImages(scenes, images);
      expect(matchedScenes[0].imageId).toBe('bg-1');
      expect(matchedScenes[0].visualMatchReason).toBe('tag-match:box-art');
    });

    test('setup scene selects board/overview image', () => {
      const scenes = [
        { id: 'scene-setup', type: 'setup_step' },
      ];
      const images = [
        { id: 'img-board', tags: ['board'], renderPath: TEST_IMAGE },
        { id: 'img-card', tags: ['card'], renderPath: TEST_IMAGE },
      ];

      const { matchedScenes } = matchScenesToImages(scenes, images);
      expect(matchedScenes[0].imageId).toBe('img-board');
    });

    test('produces warning when no suitable image found', () => {
      const scenes = [
        { id: 'scene-obscure', type: 'gameplay' },
      ];
      const images = [];

      const { matchedScenes, warnings } = matchScenesToImages(scenes, images);
      expect(matchedScenes[0].imageId).toBeNull();
      expect(matchedScenes[0].visualMatchConfidence).toBe(0);
      expect(matchedScenes[0].visualMatchReason).toBe('no-match');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('scene-obscure');
    });

    test('reports unused images', () => {
      const scenes = [
        { id: 'scene-intro', type: 'intro' },
      ];
      const images = [
        { id: 'img-box', tags: ['box-art'], renderPath: TEST_IMAGE },
        { id: 'img-unused', tags: ['misc'], renderPath: TEST_IMAGE },
      ];

      const { warnings } = matchScenesToImages(scenes, images);
      const unusedWarning = warnings.find((w) => w.includes('not matched'));
      expect(unusedWarning).toBeTruthy();
      expect(unusedWarning).toContain('img-unused');
    });

    test('handles empty scenes array', () => {
      const { matchedScenes, warnings } = matchScenesToImages([], [{ id: 'img-1', renderPath: TEST_IMAGE }]);
      expect(matchedScenes).toHaveLength(0);
      expect(warnings).toHaveLength(0);
    });

    test('handles empty images array', () => {
      const scenes = [{ id: 's1', type: 'intro' }];
      const { matchedScenes, warnings } = matchScenesToImages(scenes, []);
      expect(matchedScenes[0].imageId).toBeNull();
      expect(warnings.length).toBeGreaterThan(0);
    });

    test('multiple scenes can match different images', () => {
      const scenes = [
        { id: 'scene-intro', type: 'intro' },
        { id: 'scene-setup-tokens', segmentId: 'tokens', type: 'setup_step' },
      ];
      const images = [
        { id: 'box', tags: ['box-art'], renderPath: TEST_IMAGE },
        { id: 'tokens', tags: ['component'], renderPath: TEST_IMAGE },
      ];

      const { matchedScenes } = matchScenesToImages(scenes, images);
      expect(matchedScenes[0].imageId).toBe('box');
      expect(matchedScenes[1].imageId).toBe('tokens');
    });
  });
});
