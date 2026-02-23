// scripts/elite/parsers/ffprobe_stream_parse.mjs
// Parse ffprobe JSON output for video stream width/height

/**
 * Parse ffprobe stream output for resolution
 * @param {string} jsonOutput - ffprobe JSON output
 * @returns {{ width: number, height: number }}
 */
export function parseResolution(jsonOutput) {
  try {
    const data = JSON.parse(jsonOutput);
    
    if (!data.streams || !Array.isArray(data.streams) || data.streams.length === 0) {
      throw new Error('No streams found in ffprobe output');
    }

    const stream = data.streams[0];
    
    if (typeof stream.width !== 'number' || typeof stream.height !== 'number') {
      throw new Error('Invalid width/height in stream data');
    }

    return {
      width: stream.width,
      height: stream.height
    };
  } catch (error) {
    throw new Error(`Failed to parse ffprobe output: ${error.message}`);
  }
}
