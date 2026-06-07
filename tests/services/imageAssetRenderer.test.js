/**
 * Tests for renderer-ready image asset normalization and validation.
 */

const path = require('path');
const fs = require('fs');

let normalizeRendererImageAsset, resolveRenderPath, validateImageForRenderer, prepareImagesForRenderer;

beforeAll(async () => {
  const mod = await import('../../src/services/imageAssetNormalizer.js');
  normalizeRendererImageAsset = mod.normalizeRendererImageAsset;
  resolveRenderPath = mod.resolveRenderPath;
  validateImageForRenderer = mod.validateImageForRenderer;
  prepareImagesForRenderer = mod.prepareImagesForRenderer;
});

const TEST_IMAGE = path.resolve(__dirname, '../fixtures/images/test-bg-100x100.png');

describe('Image Asset Renderer Readiness', () => {
  describe('normalizeRendererImageAsset', () => {
    test('includes renderPath field', () => {
      const asset = normalizeRendererImageAsset({ id: 'img-1', source: 'bgg' });
      expect(asset).toHaveProperty('renderPath');
    });

    test('preserves renderPath when provided', () => {
      const asset = normalizeRendererImageAsset({ id: 'img-1', renderPath: '/some/path.png' });
      expect(asset.renderPath).toBe('/some/path.png');
    });

    test('normalizes BGG image with all fields', () => {
      const asset = normalizeRendererImageAsset({
        id: 'bgg-1',
        source: 'bgg',
        originalUrl: 'https://cf.geekdo-images.com/abc.jpg',
        width: 800,
        height: 600,
        tags: ['box-art'],
      });
      expect(asset.source).toBe('bgg');
      expect(asset.originalUrl).toContain('geekdo');
      expect(asset.width).toBe(800);
      expect(asset.tags).toContain('box-art');
    });

    test('normalizes manual upload image', () => {
      const asset = normalizeRendererImageAsset({
        source: 'manual',
        fileKey: 'uploads/my-image.png',
        width: 1920,
        height: 1080,
      });
      expect(asset.source).toBe('manual');
      expect(asset.fileKey).toBe('uploads/my-image.png');
      expect(asset.id).toBeTruthy();
    });
  });

  describe('resolveRenderPath', () => {
    test('resolves existing file from renderPath', () => {
      const result = resolveRenderPath({ renderPath: TEST_IMAGE });
      expect(result).toBe(TEST_IMAGE);
    });

    test('resolves existing file from fileKey relative path', () => {
      const relativePath = path.relative(process.cwd(), TEST_IMAGE);
      const result = resolveRenderPath({ fileKey: relativePath });
      expect(result).toBeTruthy();
      expect(fs.existsSync(result)).toBe(true);
    });

    test('returns null for non-existent file', () => {
      const result = resolveRenderPath({ fileKey: 'nonexistent/image.png' });
      expect(result).toBeNull();
    });

    test('returns null for unsupported extension', () => {
      // Create a temp txt file
      const tmpFile = path.resolve(__dirname, '../fixtures/images/test.txt');
      fs.writeFileSync(tmpFile, 'not an image');
      try {
        const result = resolveRenderPath({ fileKey: tmpFile });
        expect(result).toBeNull();
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });
  });

  describe('validateImageForRenderer', () => {
    test('valid image returns valid:true and renderPath', () => {
      const result = validateImageForRenderer({ renderPath: TEST_IMAGE, id: 'test-img' });
      expect(result.valid).toBe(true);
      expect(result.renderPath).toBe(TEST_IMAGE);
      expect(result.warnings).toHaveLength(0);
      expect(result.asset.renderPath).toBe(TEST_IMAGE);
    });

    test('missing image returns valid:false with warning', () => {
      const result = validateImageForRenderer({ fileKey: 'nonexistent.png', id: 'missing-img' });
      expect(result.valid).toBe(false);
      expect(result.renderPath).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('missing-img');
    });

    test('empty file returns valid:false', () => {
      const emptyFile = path.resolve(__dirname, '../fixtures/images/empty.png');
      fs.writeFileSync(emptyFile, '');
      try {
        const result = validateImageForRenderer({ renderPath: emptyFile, id: 'empty-img' });
        expect(result.valid).toBe(false);
        expect(result.warnings[0]).toContain('empty');
      } finally {
        fs.unlinkSync(emptyFile);
      }
    });
  });

  describe('prepareImagesForRenderer', () => {
    test('separates ready and missing images', () => {
      const images = [
        { id: 'valid-1', renderPath: TEST_IMAGE },
        { id: 'missing-1', fileKey: 'nonexistent.png' },
        { id: 'valid-2', renderPath: TEST_IMAGE },
      ];

      const result = prepareImagesForRenderer(images);
      expect(result.ready).toHaveLength(2);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].id).toBe('missing-1');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('all valid returns empty missing array', () => {
      const images = [
        { id: 'v1', renderPath: TEST_IMAGE },
        { id: 'v2', renderPath: TEST_IMAGE },
      ];
      const result = prepareImagesForRenderer(images);
      expect(result.ready).toHaveLength(2);
      expect(result.missing).toHaveLength(0);
    });

    test('empty input returns empty arrays', () => {
      const result = prepareImagesForRenderer([]);
      expect(result.ready).toHaveLength(0);
      expect(result.missing).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });
});
