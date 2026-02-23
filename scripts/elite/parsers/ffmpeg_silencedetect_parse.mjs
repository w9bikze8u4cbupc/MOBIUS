// scripts/elite/parsers/ffmpeg_silencedetect_parse.mjs
// Parse ffmpeg silencedetect filter output for maximum silence duration

/**
 * Parse ffmpeg silencedetect output for max silence duration
 * @param {string} output - ffmpeg stderr output containing silencedetect lines
 * @returns {{ max_silence_duration: number }}
 */
export function parseSilenceDetect(output) {
  const lines = output.split('\n');
  
  const silenceRuns = [];
  
  // Example lines:
  // [silencedetect @ 0x...] silence_start: 10.5
  // [silencedetect @ 0x...] silence_end: 11.2 | silence_duration: 0.7

  for (const line of lines) {
    const match = line.match(/silence_duration:\s+([\d.]+)/);
    if (match) {
      const duration = parseFloat(match[1]);
      silenceRuns.push(duration);
    }
  }

  if (silenceRuns.length === 0) {
    // No silence detected - return 0
    return { max_silence_duration: 0 };
  }

  const maxDuration = Math.max(...silenceRuns);
  
  // Round to 1 decimal place for determinism
  return {
    max_silence_duration: Math.round(maxDuration * 10) / 10
  };
}
