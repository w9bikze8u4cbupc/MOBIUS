/**
 * Tests that render config adapter resolves image assets into scene backgrounds.
 */

const path = require('path');

let adaptConfigForStoryboardRenderer;

beforeAll(async () => {
  const mod = await import('../../src/api/renderExecutor.js');
  adaptConfigForStoryboardRenderer = mod.adaptConfigForStoryboardRenderer;
});

const TEST_IMAGE = path.resolve(__dirname, '../fixtures/images/test-bg-100x100.png');

describe('adaptConfigForStoryboardRenderer image resolution', () => {
  test('resolves scene background from imageAssets when scene has imageId', () => {
    const config = {
      projectId: 'test',
      video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
      assets: {
        storyboardScenes: [
          { id: 'scene-1', durationSec: 5, imageId: 'bg-1' },
        ],
      },
      timing: { totalDurationSec: 5, scenes: [] },
    };

    const imageAssets = [
      { id: 'bg-1', renderPath: TEST_IMAGE },
    ];

    const adapted = adaptConfigForStoryboardRenderer(config, { imageAssets });
    expect(adapted.scenes[0].background.image).toBe(TEST_IMAGE);
  });

  test('falls back to color when imageId references missing asset', () => {
    const config = {
      projectId: 'test',
      video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
      assets: {
        storyboardScenes: [
          { id: 'scene-1', durationSec: 5, imageId: 'nonexistent' },
        ],
      },
      timing: { totalDurationSec: 5, scenes: [] },
    };

    const adapted = adaptConfigForStoryboardRenderer(config, { imageAssets: [] });
    expect(adapted.scenes[0].background.color).toBeTruthy();
    expect(adapted._imageWarnings).toBeDefined();
    expect(adapted._imageWarnings[0]).toContain('nonexistent');
  });

  test('preserves explicit scene background over image asset', () => {
    const config = {
      projectId: 'test',
      video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
      assets: {
        storyboardScenes: [
          { id: 'scene-1', durationSec: 5, background: { color: '#ff0000' }, imageId: 'bg-1' },
        ],
      },
      timing: { totalDurationSec: 5, scenes: [] },
    };

    const imageAssets = [{ id: 'bg-1', renderPath: TEST_IMAGE }];
    const adapted = adaptConfigForStoryboardRenderer(config, { imageAssets });
    expect(adapted.scenes[0].background.color).toBe('#ff0000');
  });

  test('scenes without image refs get color fallback without warnings', () => {
    const config = {
      projectId: 'test',
      video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
      assets: {
        storyboardScenes: [
          { id: 'scene-1', durationSec: 5 },
          { id: 'scene-2', durationSec: 3 },
        ],
      },
      timing: { totalDurationSec: 8, scenes: [] },
    };

    const adapted = adaptConfigForStoryboardRenderer(config, { imageAssets: [] });
    expect(adapted.scenes[0].background.color).toBe('#1a1a2e');
    expect(adapted.scenes[1].background.color).toBe('#16213e');
    expect(adapted._imageWarnings).toBeUndefined();
  });
});
