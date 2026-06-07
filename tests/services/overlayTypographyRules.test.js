/**
 * Tests for overlay typography and readability rules.
 */

let applyOverlayTypography, applySceneTypography, applyStoryboardTypography;
let scaleFontSize, selectOverlayStyle, validateReadability, MIN_SIZES_1080P;

beforeAll(async () => {
  const mod = await import('../../src/services/overlayTypographyRules.js');
  applyOverlayTypography = mod.applyOverlayTypography;
  applySceneTypography = mod.applySceneTypography;
  applyStoryboardTypography = mod.applyStoryboardTypography;
  scaleFontSize = mod.scaleFontSize;
  selectOverlayStyle = mod.selectOverlayStyle;
  validateReadability = mod.validateReadability;
  MIN_SIZES_1080P = mod.MIN_SIZES_1080P;
});

describe('overlayTypographyRules', () => {
  describe('scaleFontSize', () => {
    test('returns same size at 1080p', () => {
      expect(scaleFontSize(48, 1080)).toBe(48);
    });

    test('scales down for 720p', () => {
      expect(scaleFontSize(48, 720)).toBe(32);
    });

    test('scales up for 4K', () => {
      expect(scaleFontSize(48, 2160)).toBe(96);
    });
  });

  describe('selectOverlayStyle', () => {
    test('image background gets shadow and outline', () => {
      const overlay = { type: 'title', text: 'Hello' };
      const scene = { id: 's1', composition: { backgroundMode: 'image' } };
      const style = selectOverlayStyle(overlay, scene);
      expect(style.shadowOutline).toBe(true);
      expect(style.textShadow).toContain('rgba');
    });

    test('color background has no shadow', () => {
      const overlay = { type: 'title', text: 'Hello' };
      const scene = { id: 's1', composition: { backgroundMode: 'color' } };
      const style = selectOverlayStyle(overlay, scene);
      expect(style.shadowOutline).toBe(false);
      expect(style.textShadow).toBe('none');
    });

    test('body/callout on image gets background box', () => {
      const overlay = { type: 'body', text: 'Content' };
      const scene = { id: 's1', composition: { backgroundMode: 'image' } };
      const style = selectOverlayStyle(overlay, scene);
      expect(style.backgroundBox).toBe(true);
      expect(style.backgroundBoxOpacity).toBeGreaterThan(0);
    });

    test('title on image has no background box', () => {
      const overlay = { type: 'title', text: 'Title' };
      const scene = { id: 's1', composition: { backgroundMode: 'image' } };
      const style = selectOverlayStyle(overlay, scene);
      expect(style.backgroundBox).toBe(false);
    });

    test('title is center-aligned', () => {
      const overlay = { type: 'title' };
      const scene = { id: 's1' };
      const style = selectOverlayStyle(overlay, scene);
      expect(style.textAlign).toBe('center');
    });

    test('body is left-aligned', () => {
      const overlay = { type: 'body' };
      const scene = { id: 's1' };
      const style = selectOverlayStyle(overlay, scene);
      expect(style.textAlign).toBe('left');
    });
  });

  describe('validateReadability', () => {
    test('short text at 1080p is valid', () => {
      const overlay = { type: 'title', text: 'How to Play' };
      const scene = { id: 's1' };
      const { valid, warnings } = validateReadability(overlay, scene, { height: 1080 });
      expect(valid).toBe(true);
      expect(warnings).toHaveLength(0);
    });

    test('warns when line exceeds max chars', () => {
      const longText = 'A'.repeat(100);
      const overlay = { type: 'title', text: longText };
      const scene = { id: 's1' };
      const { valid, warnings } = validateReadability(overlay, scene, { height: 1080 });
      expect(valid).toBe(false);
      expect(warnings[0]).toContain('exceeds');
    });

    test('warns when too many lines', () => {
      const multiLine = 'Line\n'.repeat(10);
      const overlay = { type: 'title', text: multiLine };
      const scene = { id: 's1' };
      const { valid, warnings } = validateReadability(overlay, scene, { height: 1080 });
      expect(valid).toBe(false);
      expect(warnings.some((w) => w.includes('lines'))).toBe(true);
    });

    test('warns when font too small at very low resolution', () => {
      const overlay = { type: 'body', text: 'Hi' };
      const scene = { id: 's1' };
      const { warnings } = validateReadability(overlay, scene, { height: 360 });
      expect(warnings.some((w) => w.includes('font size'))).toBe(true);
    });

    test('no warning for normal text at 1080p', () => {
      const overlay = { type: 'body', text: 'Place cards face down on the table.' };
      const scene = { id: 's1', composition: { backgroundMode: 'color' } };
      const { valid } = validateReadability(overlay, scene, { height: 1080 });
      expect(valid).toBe(true);
    });
  });

  describe('applyOverlayTypography', () => {
    test('returns typography metadata with font size', () => {
      const overlay = { type: 'title', text: 'Setup', position: 'center' };
      const scene = { id: 's1', composition: { backgroundMode: 'color' } };
      const result = applyOverlayTypography(overlay, scene, { resolution: { width: 1920, height: 1080 } });
      expect(result.typography.fontSize).toBe(MIN_SIZES_1080P.title);
      expect(result.typography.anchor).toBe('center');
      expect(result.typography.fontFamily).toBeTruthy();
      expect(result.typography.padding).toBeGreaterThan(0);
    });

    test('no readability warnings for simple valid text', () => {
      const overlay = { type: 'body', text: 'Short text' };
      const scene = { id: 's1' };
      const result = applyOverlayTypography(overlay, scene);
      expect(result.readabilityWarnings).toBeUndefined();
    });
  });

  describe('applySceneTypography', () => {
    test('applies typography to all overlays in scene', () => {
      const scene = {
        id: 's1',
        composition: { backgroundMode: 'image' },
        overlays: [
          { type: 'title', text: 'Title' },
          { type: 'body', text: 'Body text here' },
        ],
      };
      const { overlaysWithTypography, warnings } = applySceneTypography(scene);
      expect(overlaysWithTypography).toHaveLength(2);
      expect(overlaysWithTypography[0].typography.overlayType).toBe('title');
      expect(overlaysWithTypography[1].typography.overlayType).toBe('body');
      expect(overlaysWithTypography[0].typography.shadowOutline).toBe(true);
    });

    test('collects readability warnings', () => {
      const scene = {
        id: 's1',
        overlays: [{ type: 'title', text: 'A'.repeat(100) }],
      };
      const { warnings } = applySceneTypography(scene, { resolution: { width: 1920, height: 1080 } });
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('applyStoryboardTypography', () => {
    test('applies to all scenes', () => {
      const scenes = [
        { id: 's1', overlays: [{ type: 'title', text: 'Intro' }] },
        { id: 's2', overlays: [{ type: 'body', text: 'Setup step' }] },
      ];
      const { scenesWithTypography, warnings } = applyStoryboardTypography(scenes);
      expect(scenesWithTypography).toHaveLength(2);
      expect(scenesWithTypography[0].overlays[0].typography).toBeDefined();
      expect(scenesWithTypography[1].overlays[0].typography).toBeDefined();
    });

    test('empty input returns empty', () => {
      const { scenesWithTypography, warnings } = applyStoryboardTypography([]);
      expect(scenesWithTypography).toHaveLength(0);
      expect(warnings).toHaveLength(0);
    });

    test('preserves original scene/overlay fields', () => {
      const scenes = [{ id: 's1', durationSec: 5, overlays: [{ type: 'title', text: 'Hi', position: 'top' }] }];
      const { scenesWithTypography } = applyStoryboardTypography(scenes);
      expect(scenesWithTypography[0].durationSec).toBe(5);
      expect(scenesWithTypography[0].overlays[0].text).toBe('Hi');
      expect(scenesWithTypography[0].overlays[0].position).toBe('top');
    });
  });
});
