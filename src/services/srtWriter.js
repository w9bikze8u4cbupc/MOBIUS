/**
 * SRT (SubRip) format writer.
 *
 * Converts caption cues into valid .srt file content.
 */

/**
 * Format milliseconds as SRT timestamp: HH:MM:SS,mmm
 */
export function formatSrtTimestamp(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const milliseconds = Math.round(ms % 1000);

  return [
    String(hours).padStart(2, '0'),
    ':',
    String(minutes).padStart(2, '0'),
    ':',
    String(seconds).padStart(2, '0'),
    ',',
    String(milliseconds).padStart(3, '0'),
  ].join('');
}

/**
 * Sanitize text for SRT output.
 * Removes unsupported control characters, normalizes whitespace.
 */
export function sanitizeSrtText(text) {
  if (!text) return '';
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars except \n \r \t
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * Format a single SRT cue block.
 */
export function formatSrtCue(cue) {
  const index = cue.index || 1;
  const start = formatSrtTimestamp(cue.startMs);
  const end = formatSrtTimestamp(cue.endMs);
  const text = sanitizeSrtText(cue.text);

  return `${index}\n${start} --> ${end}\n${text}`;
}

/**
 * Generate complete SRT file content from caption cues.
 *
 * @param {Array} cues - Caption cues with index, startMs, endMs, text
 * @returns {string} Complete SRT file content
 */
export function generateSrtContent(cues = []) {
  if (cues.length === 0) return '';
  return cues.map((cue) => formatSrtCue(cue)).join('\n\n') + '\n';
}

/**
 * Generate SRT metadata summary.
 */
export function getSrtMetadata(cues = []) {
  if (cues.length === 0) {
    return { cueCount: 0, totalDurationMs: 0, language: null };
  }

  const lastCue = cues[cues.length - 1];
  const language = cues[0].language || null;

  return {
    cueCount: cues.length,
    totalDurationMs: lastCue.endMs,
    language,
  };
}
