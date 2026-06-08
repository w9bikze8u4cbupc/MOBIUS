/**
 * Tests for narration audio asset normalization, scene mapping, and validation.
 */

let normalizeNarrationAsset, mapNarrationToScenes, validateNarrationAssets, computeTextHash;

beforeAll(async () => {
  const mod = await import('../../src/services/narrationAudioAssets.js');
  normalizeNarrationAsset = mod.normalizeNarrationAsset;
  mapNarrationToScenes = mod.mapNarrationToScenes;
  validateNarrationAssets = mod.validateNarrationAssets;
  computeTextHash = mod.computeTextHash;
});

describe('narrationAudioAssets', () => {
  describe('normalizeNarrationAsset', () => {
    test('normalizes fixture/manual asset', () => {
      const asset = normalizeNarrationAsset({
        sceneId: 's1',
        filePath: '/audio/scene1.mp3',
        durationMs: 4500,
        language: 'en',
      });
      expect(asset.sceneId).toBe('s1');
      expect(asset.filePath).toBe('/audio/scene1.mp3');
      expect(asset.durationMs).toBe(4500);
      expect(asset.provider).toBe('manual');
      expect(asset.status).toBe('ready');
      expect(asset.id).toBeTruthy();
    });

    test('normalizes ElevenLabs-style metadata', () => {
      const asset = normalizeNarrationAsset({
        sceneId: 's2',
        provider: 'elevenlabs',
        voice_id: 'dllHSct4GokGc1AH9JwT',
        model_id: 'eleven_multilingual_v2',
        language: 'en',
        sourceText: 'Welcome to the tutorial.',
        file: '/audio/s2.mp3',
        duration_ms: 3200,
      });
      expect(asset.provider).toBe('elevenlabs');
      expect(asset.providerVoiceId).toBe('dllHSct4GokGc1AH9JwT');
      expect(asset.modelId).toBe('eleven_multilingual_v2');
      expect(asset.filePath).toBe('/audio/s2.mp3');
      expect(asset.durationMs).toBe(3200);
      expect(asset.textHash).toBeTruthy();
    });

    test('pending status when no file path', () => {
      const asset = normalizeNarrationAsset({ sceneId: 's3', sourceText: 'Hello' });
      expect(asset.status).toBe('pending');
      expect(asset.filePath).toBeNull();
    });

    test('computes text hash from sourceText', () => {
      const asset = normalizeNarrationAsset({ sourceText: 'Test text' });
      expect(asset.textHash).toBeTruthy();
      expect(asset.textHash.length).toBe(16);
    });
  });

  describe('computeTextHash', () => {
    test('returns consistent hash for same text', () => {
      expect(computeTextHash('hello')).toBe(computeTextHash('hello'));
    });

    test('returns null for empty/null', () => {
      expect(computeTextHash('')).toBeNull();
      expect(computeTextHash(null)).toBeNull();
    });

    test('trims whitespace before hashing', () => {
      expect(computeTextHash('  hello  ')).toBe(computeTextHash('hello'));
    });
  });

  describe('mapNarrationToScenes', () => {
    test('maps audio by sceneId', () => {
      const scenes = [{ id: 's1', narration: 'Hello' }, { id: 's2', narration: 'World' }];
      const assets = [
        normalizeNarrationAsset({ sceneId: 's1', filePath: '/a.mp3' }),
        normalizeNarrationAsset({ sceneId: 's2', filePath: '/b.mp3' }),
      ];
      const { mappedScenes, warnings } = mapNarrationToScenes(scenes, assets);
      expect(mappedScenes[0].narrationAudio).toBeTruthy();
      expect(mappedScenes[1].narrationAudio).toBeTruthy();
      expect(warnings).toHaveLength(0);
    });

    test('falls back to segmentId mapping', () => {
      const scenes = [{ id: 'scene-setup', segmentId: 'setup' }];
      const assets = [normalizeNarrationAsset({ segmentId: 'setup', filePath: '/x.mp3' })];
      const { mappedScenes } = mapNarrationToScenes(scenes, assets);
      expect(mappedScenes[0].narrationAudio).toBeTruthy();
    });

    test('warns when scene has narration text but no audio', () => {
      const scenes = [{ id: 's1', narration: 'I need audio' }];
      const assets = [];
      const { mappedScenes, warnings } = mapNarrationToScenes(scenes, assets);
      expect(mappedScenes[0].narrationAudio).toBeNull();
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('s1');
    });

    test('reports unmapped assets', () => {
      const scenes = [{ id: 's1' }];
      const assets = [normalizeNarrationAsset({ sceneId: 'other', filePath: '/x.mp3' })];
      const { unmappedAssets, warnings } = mapNarrationToScenes(scenes, assets);
      expect(unmappedAssets).toHaveLength(1);
      expect(warnings.some((w) => w.includes('not mapped'))).toBe(true);
    });

    test('empty inputs return empty results', () => {
      const { mappedScenes, warnings } = mapNarrationToScenes([], []);
      expect(mappedScenes).toHaveLength(0);
      expect(warnings).toHaveLength(0);
    });
  });

  describe('validateNarrationAssets', () => {
    test('valid assets pass', () => {
      const assets = [
        normalizeNarrationAsset({ sceneId: 's1', filePath: '/audio.mp3', durationMs: 3000 }),
      ];
      const { valid, warnings } = validateNarrationAssets(assets);
      expect(valid).toBe(true);
      expect(warnings).toHaveLength(0);
    });

    test('warns on ready status without filePath', () => {
      const asset = normalizeNarrationAsset({ sceneId: 's1', filePath: '/x.mp3' });
      asset.filePath = null; // Simulate corruption
      const { valid, warnings } = validateNarrationAssets([asset]);
      expect(valid).toBe(false);
      expect(warnings[0]).toContain('filePath');
    });

    test('warns on unsupported extension', () => {
      const assets = [normalizeNarrationAsset({ sceneId: 's1', filePath: '/audio.xyz' })];
      const { warnings } = validateNarrationAssets(assets);
      expect(warnings.some((w) => w.includes('unsupported extension'))).toBe(true);
    });

    test('warns on invalid duration', () => {
      const assets = [normalizeNarrationAsset({ sceneId: 's1', filePath: '/a.mp3', durationMs: -100 })];
      const { warnings } = validateNarrationAssets(assets);
      expect(warnings.some((w) => w.includes('invalid duration'))).toBe(true);
    });

    test('warns on duration mismatch with scene', () => {
      const assets = [normalizeNarrationAsset({ sceneId: 's1', filePath: '/a.mp3', durationMs: 10000 })];
      const scenes = [{ id: 's1', durationSec: 3 }];
      const { warnings, summary } = validateNarrationAssets(assets, scenes);
      expect(warnings.some((w) => w.includes('differs from scene'))).toBe(true);
      expect(summary.durationMismatchCount).toBe(1);
    });

    test('returns summary metadata', () => {
      const assets = [
        normalizeNarrationAsset({ sceneId: 's1', filePath: '/a.mp3', provider: 'elevenlabs', language: 'en' }),
        normalizeNarrationAsset({ sceneId: 's2', sourceText: 'pending' }),
      ];
      const { summary } = validateNarrationAssets(assets);
      expect(summary.audioAssetCount).toBe(2);
      expect(summary.readyCount).toBe(1);
      expect(summary.pendingCount).toBe(1);
      expect(summary.provider).toBe('elevenlabs');
      expect(summary.language).toBe('en');
    });

    test('empty assets are valid', () => {
      const { valid } = validateNarrationAssets([]);
      expect(valid).toBe(true);
    });
  });
});
