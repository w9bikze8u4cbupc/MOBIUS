/**
 * Narration audio asset normalization, scene mapping, and validation.
 *
 * Provides a clean integration layer for ElevenLabs-compatible voice assets
 * without requiring live API calls. Supports local/fixture audio files and
 * validates metadata alignment with storyboard scenes and captions.
 */

import crypto from 'crypto';

const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.webm'];
const SUPPORTED_MIME_TYPES = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/aac', 'audio/webm'];

/**
 * Compute a hash of narration source text for mismatch detection.
 */
function computeTextHash(text) {
  if (!text) return null;
  return crypto.createHash('sha256').update(text.trim()).digest('hex').slice(0, 16);
}

/**
 * Normalize a narration audio asset into the canonical contract shape.
 */
export function normalizeNarrationAsset(asset = {}) {
  return {
    id: asset.id || `narration-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sceneId: asset.sceneId || null,
    segmentId: asset.segmentId || null,
    provider: asset.provider || 'manual',
    providerVoiceId: asset.providerVoiceId || asset.voice_id || null,
    modelId: asset.modelId || asset.model_id || 'eleven_multilingual_v2',
    language: asset.language || 'en',
    textHash: asset.textHash || computeTextHash(asset.sourceText || asset.text),
    sourceText: asset.sourceText || asset.text || null,
    filePath: asset.filePath || asset.file || asset.path || null,
    mimeType: asset.mimeType || asset.mime_type || null,
    durationMs: asset.durationMs || asset.duration_ms || null,
    sampleRate: asset.sampleRate || asset.sample_rate || null,
    channels: asset.channels || null,
    status: asset.status || (asset.filePath || asset.file || asset.path ? 'ready' : 'pending'),
    warnings: [],
  };
}

/**
 * Map narration audio assets to storyboard scenes.
 *
 * @param {Array} scenes - Storyboard scenes with id, segmentId
 * @param {Array} audioAssets - Normalized narration assets
 * @returns {{ mappedScenes, unmappedAssets, warnings }}
 */
export function mapNarrationToScenes(scenes = [], audioAssets = []) {
  const warnings = [];
  const usedAssetIds = new Set();

  const mappedScenes = scenes.map((scene) => {
    // Find matching audio: prefer sceneId match, then segmentId
    let match = audioAssets.find((a) => a.sceneId && a.sceneId === scene.id);
    if (!match) {
      match = audioAssets.find((a) => a.segmentId && a.segmentId === (scene.segmentId || scene.id));
    }

    if (match) {
      usedAssetIds.add(match.id);
      return { ...scene, narrationAudio: match };
    }

    // Check if scene has narration text but no audio
    const hasNarration = Boolean(scene.narration || scene.scriptText ||
      (scene.overlays || []).some((o) => o.type === 'body' && o.text));

    if (hasNarration) {
      warnings.push(`Scene '${scene.id}': has narration text but no audio asset mapped`);
    }

    return { ...scene, narrationAudio: null };
  });

  const unmappedAssets = audioAssets.filter((a) => !usedAssetIds.has(a.id));
  if (unmappedAssets.length > 0) {
    warnings.push(`${unmappedAssets.length} narration asset(s) not mapped to any scene: ${unmappedAssets.map((a) => a.id).join(', ')}`);
  }

  return { mappedScenes, unmappedAssets, warnings };
}

/**
 * Validate narration audio assets for render readiness.
 *
 * @param {Array} audioAssets - Normalized narration assets
 * @param {Array} [scenes] - Optional scenes for duration/language alignment
 * @returns {{ valid, warnings, summary }}
 */
export function validateNarrationAssets(audioAssets = [], scenes = []) {
  const warnings = [];
  let durationMismatchCount = 0;

  for (const asset of audioAssets) {
    // File path check
    if (asset.status === 'ready' && !asset.filePath) {
      warnings.push(`Asset '${asset.id}': status is ready but no filePath`);
    }

    // Extension check
    if (asset.filePath) {
      const ext = (asset.filePath.match(/\.[^.]+$/) || [''])[0].toLowerCase();
      if (!SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) {
        warnings.push(`Asset '${asset.id}': unsupported extension '${ext}'`);
      }
    }

    // Duration check
    if (asset.durationMs != null && asset.durationMs <= 0) {
      warnings.push(`Asset '${asset.id}': invalid duration ${asset.durationMs}ms`);
    }

    // Scene duration alignment
    if (asset.sceneId && asset.durationMs) {
      const scene = scenes.find((s) => s.id === asset.sceneId);
      if (scene && scene.durationSec) {
        const sceneDurationMs = scene.durationSec * 1000;
        const tolerance = sceneDurationMs * 0.3; // 30% tolerance
        if (Math.abs(asset.durationMs - sceneDurationMs) > tolerance) {
          warnings.push(`Asset '${asset.id}': duration ${asset.durationMs}ms differs from scene '${scene.id}' duration ${sceneDurationMs}ms by >30%`);
          durationMismatchCount++;
        }
      }
    }

    // Language alignment with scene captions
    if (asset.language && asset.sceneId) {
      const scene = scenes.find((s) => s.id === asset.sceneId);
      if (scene && scene.captionLanguage && scene.captionLanguage !== asset.language) {
        warnings.push(`Asset '${asset.id}': language '${asset.language}' differs from scene caption language '${scene.captionLanguage}'`);
      }
    }
  }

  const mappedCount = audioAssets.filter((a) => a.sceneId || a.segmentId).length;
  const readyCount = audioAssets.filter((a) => a.status === 'ready').length;

  return {
    valid: warnings.length === 0,
    warnings,
    summary: {
      audioAssetCount: audioAssets.length,
      mappedSceneCount: mappedCount,
      readyCount,
      pendingCount: audioAssets.length - readyCount,
      durationMismatchCount,
      provider: audioAssets[0]?.provider || null,
      language: audioAssets[0]?.language || null,
    },
  };
}

export {
  computeTextHash,
  SUPPORTED_AUDIO_EXTENSIONS,
  SUPPORTED_MIME_TYPES,
};
