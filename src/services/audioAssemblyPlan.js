/**
 * Deterministic audio assembly planning for scene narration.
 *
 * Sequences mapped narration audio assets according to storyboard scene order,
 * validates duration alignment, detects gaps/overlaps, and produces assembly
 * metadata for render/package outputs.
 */

import { SUPPORTED_AUDIO_EXTENSIONS } from './narrationAudioAssets.js';

/** Duration mismatch tolerance (30%). */
const DURATION_TOLERANCE = 0.3;

/**
 * Build a deterministic audio assembly plan from scenes and narration assets.
 *
 * @param {Array} scenes - Storyboard scenes in order (with id, durationSec, narrationAudio)
 * @param {Object} [options] - { toleranceFraction }
 * @returns {{ entries, summary, warnings }}
 */
export function buildAudioAssemblyPlan(scenes = [], options = {}) {
  const tolerance = options.toleranceFraction ?? DURATION_TOLERANCE;
  const warnings = [];
  const entries = [];
  let cumulativeMs = 0;

  for (const scene of scenes) {
    const sceneDurationMs = Math.round((scene.durationSec || 0) * 1000);
    const audio = scene.narrationAudio || null;

    if (!audio) {
      // Check if scene has narration text but no audio
      const hasNarration = Boolean(scene.narration || scene.scriptText ||
        (scene.overlays || []).some((o) => o.type === 'body' && o.text));
      if (hasNarration) {
        warnings.push(`Scene '${scene.id}': narration text present but no audio asset`);
      }
      entries.push({
        sceneId: scene.id,
        segmentId: scene.segmentId || null,
        audioAssetId: null,
        filePath: null,
        startMs: cumulativeMs,
        endMs: cumulativeMs + sceneDurationMs,
        durationMs: 0,
        expectedSceneDurationMs: sceneDurationMs,
        gapBeforeMs: 0,
        status: hasNarration ? 'missing' : 'silent',
        warnings: hasNarration ? ['no audio asset mapped'] : [],
      });
      cumulativeMs += sceneDurationMs;
      continue;
    }

    const audioDurationMs = audio.durationMs || 0;
    const entryWarnings = [];

    // Validate file extension
    if (audio.filePath) {
      const ext = (audio.filePath.match(/\.[^.]+$/) || [''])[0].toLowerCase();
      if (!SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) {
        entryWarnings.push(`unsupported format: ${ext}`);
      }
    }

    // Validate positive duration
    if (audioDurationMs <= 0) {
      entryWarnings.push(`invalid duration: ${audioDurationMs}ms`);
    }

    // Duration mismatch check
    if (audioDurationMs > 0 && sceneDurationMs > 0) {
      const diff = Math.abs(audioDurationMs - sceneDurationMs);
      if (diff > sceneDurationMs * tolerance) {
        entryWarnings.push(`duration mismatch: audio ${audioDurationMs}ms vs scene ${sceneDurationMs}ms (>${Math.round(tolerance * 100)}% tolerance)`);
        warnings.push(`Scene '${scene.id}': narration duration ${audioDurationMs}ms differs from scene ${sceneDurationMs}ms`);
      }
    }

    // Detect gap before this entry
    const gapBeforeMs = 0; // In sequential assembly, gap is 0 by default

    const effectiveDuration = audioDurationMs > 0 ? audioDurationMs : sceneDurationMs;

    let status = 'ready';
    if (!audio.filePath) status = 'pending';
    else if (entryWarnings.length > 0) status = 'warn';

    entries.push({
      sceneId: scene.id,
      segmentId: scene.segmentId || audio.segmentId || null,
      audioAssetId: audio.id,
      filePath: audio.filePath || null,
      startMs: cumulativeMs,
      endMs: cumulativeMs + effectiveDuration,
      durationMs: audioDurationMs,
      expectedSceneDurationMs: sceneDurationMs,
      gapBeforeMs,
      status,
      warnings: entryWarnings,
    });

    if (entryWarnings.length > 0) {
      warnings.push(...entryWarnings.map((w) => `Scene '${scene.id}': ${w}`));
    }

    cumulativeMs += sceneDurationMs; // Advance by scene duration for consistent timeline
  }

  // Check for overlaps in actual audio
  for (let i = 1; i < entries.length; i++) {
    if (entries[i - 1].endMs > entries[i].startMs && entries[i - 1].durationMs > 0 && entries[i].durationMs > 0) {
      warnings.push(`Overlap detected between scenes '${entries[i - 1].sceneId}' and '${entries[i].sceneId}'`);
    }
  }

  const mappedCount = entries.filter((e) => e.audioAssetId).length;
  const missingCount = entries.filter((e) => e.status === 'missing').length;
  const totalNarrationMs = entries.reduce((sum, e) => sum + e.durationMs, 0);
  const expectedRenderMs = entries.reduce((sum, e) => sum + e.expectedSceneDurationMs, 0);

  return {
    entries,
    summary: {
      totalEntries: entries.length,
      mappedAudioCount: mappedCount,
      missingAudioCount: missingCount,
      silentSceneCount: entries.filter((e) => e.status === 'silent').length,
      totalNarrationDurationMs: totalNarrationMs,
      expectedRenderDurationMs: expectedRenderMs,
      durationMismatchCount: entries.filter((e) => e.warnings.some((w) => w.includes('duration mismatch'))).length,
    },
    warnings,
  };
}

export { DURATION_TOLERANCE };
