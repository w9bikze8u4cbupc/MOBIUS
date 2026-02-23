// scripts/elite/parsers/ffmpeg_ebur128_parse.mjs
// Parse ffmpeg ebur128 filter output for integrated loudness and true peak

/**
 * Parse ffmpeg ebur128 output for LUFS and true peak
 * @param {string} output - ffmpeg stderr output containing ebur128 summary
 * @returns {{ integrated_lufs: number, true_peak_dbtp: number }}
 */
export function parseEBUR128(output) {
  const lines = output.split('\n');
  
  let integratedLUFS = null;
  let truePeakDBTP = null;

  // Look for summary section
  // Example lines:
  // Integrated loudness:
  //   I:         -14.1 LUFS
  // True peak:
  //   Peak:       -1.2 dBTP

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Match integrated loudness
    if (line.startsWith('I:')) {
      const match = line.match(/I:\s+([-\d.]+)\s+LUFS/);
      if (match) {
        integratedLUFS = parseFloat(match[1]);
      }
    }
    
    // Match true peak
    if (line.startsWith('Peak:')) {
      const match = line.match(/Peak:\s+([-\d.]+)\s+dBTP/);
      if (match) {
        truePeakDBTP = parseFloat(match[1]);
      }
    }
  }

  if (integratedLUFS === null) {
    throw new Error('Could not find integrated loudness in ebur128 output');
  }

  if (truePeakDBTP === null) {
    throw new Error('Could not find true peak in ebur128 output');
  }

  // Round to 1 decimal place for determinism
  return {
    integrated_lufs: Math.round(integratedLUFS * 10) / 10,
    true_peak_dbtp: Math.round(truePeakDBTP * 10) / 10
  };
}
