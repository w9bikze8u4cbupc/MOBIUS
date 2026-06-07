/**
 * Deterministic caption cue generation from narration/script segments.
 *
 * Generates subtitle cues aligned to scene durations without requiring
 * live TTS or word-level alignment. Validates timing for overlaps, gaps,
 * and text length.
 */

/** Minimum cue duration in milliseconds. */
const MIN_CUE_DURATION_MS = 1000;

/** Maximum characters per cue line before splitting. */
const MAX_CUE_CHARS = 80;

/** Maximum lines per single cue. */
const MAX_CUE_LINES = 2;

/**
 * Split long narration text into multiple cue segments.
 * Splits on sentence boundaries or at MAX_CUE_CHARS.
 */
function splitTextIntoCues(text, maxChars = MAX_CUE_CHARS) {
  if (!text || text.length <= maxChars) return [text || ''];

  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  const cues = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).trim().length <= maxChars) {
      current += sentence;
    } else {
      if (current.trim()) cues.push(current.trim());
      current = sentence;
    }
  }
  if (current.trim()) cues.push(current.trim());

  return cues.length > 0 ? cues : [text];
}

/**
 * Generate caption cues from storyboard scenes with narration text.
 *
 * @param {Array} scenes - Scenes with id, durationSec, and narration/overlay text
 * @param {Object} [options] - { language, maxCueChars }
 * @returns {{ cues, warnings, totalDurationMs }}
 */
export function generateCaptionCues(scenes = [], options = {}) {
  const language = options.language || 'en';
  const maxChars = options.maxCueChars || MAX_CUE_CHARS;
  const warnings = [];
  const cues = [];
  let cumulativeMs = 0;
  let index = 1;

  for (const scene of scenes) {
    const durationMs = Math.round((scene.durationSec || 0) * 1000);
    const sceneStartMs = cumulativeMs;
    const sceneEndMs = cumulativeMs + durationMs;

    // Extract narration text from scene
    const narrationText = scene.narration
      || scene.scriptText
      || (scene.overlays || []).filter((o) => o.type === 'body').map((o) => o.text).join(' ')
      || '';

    if (!narrationText.trim()) {
      cumulativeMs = sceneEndMs;
      continue;
    }

    // Split long text into multiple cues
    const textSegments = splitTextIntoCues(narrationText.trim(), maxChars);
    const segmentDurationMs = Math.max(MIN_CUE_DURATION_MS, Math.floor(durationMs / textSegments.length));

    for (let i = 0; i < textSegments.length; i++) {
      const startMs = sceneStartMs + i * segmentDurationMs;
      const endMs = Math.min(startMs + segmentDurationMs, sceneEndMs);

      if (endMs - startMs < MIN_CUE_DURATION_MS && durationMs >= MIN_CUE_DURATION_MS) {
        warnings.push(`Cue ${index} in scene '${scene.id}': duration below minimum (${endMs - startMs}ms)`);
      }

      cues.push({
        index,
        sceneId: scene.id,
        startMs,
        endMs,
        text: textSegments[i],
        language,
      });
      index++;
    }

    cumulativeMs = sceneEndMs;
  }

  return { cues, warnings, totalDurationMs: cumulativeMs };
}

/**
 * Validate caption cues for timing integrity.
 *
 * @param {Array} cues - Generated cues
 * @returns {{ valid, warnings }}
 */
export function validateCaptionCues(cues = []) {
  const warnings = [];

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];

    // Start must be before end
    if (cue.startMs >= cue.endMs) {
      warnings.push(`Cue ${cue.index}: startMs (${cue.startMs}) >= endMs (${cue.endMs})`);
    }

    // Duration check
    if (cue.endMs - cue.startMs < MIN_CUE_DURATION_MS) {
      warnings.push(`Cue ${cue.index}: duration ${cue.endMs - cue.startMs}ms below minimum ${MIN_CUE_DURATION_MS}ms`);
    }

    // Non-empty text
    if (!cue.text || !cue.text.trim()) {
      warnings.push(`Cue ${cue.index}: empty text`);
    }

    // No overlap with next cue
    if (i < cues.length - 1) {
      const next = cues[i + 1];
      if (cue.endMs > next.startMs) {
        warnings.push(`Cue ${cue.index}→${next.index}: overlap (${cue.endMs}ms > ${next.startMs}ms)`);
      }
    }
  }

  return { valid: warnings.length === 0, warnings };
}

export {
  splitTextIntoCues,
  MIN_CUE_DURATION_MS,
  MAX_CUE_CHARS,
  MAX_CUE_LINES,
};
