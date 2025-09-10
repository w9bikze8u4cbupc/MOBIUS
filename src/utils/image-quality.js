import sharp from 'sharp';

// 3x3 Laplacian kernel
const LAPLACIAN = {
  width: 3,
  height: 3,
  kernel: [
     0, -1,  0,
    -1,  4, -1,
     0, -1,  0
  ]
};

/**
 * Calculate focus/sharpness score using Laplacian variance
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<number>} Focus score between 0-1
 */
export async function focusScore(buffer) {
  try {
    const g = await sharp(buffer).grayscale().raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const conv = await sharp(g.data, { raw: { width: g.info.width, height: g.info.height, channels: 2 /* gray+alpha */}})
      .extractChannel(0) // gray
      .convolve(LAPLACIAN)
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Variance of Laplacian response
    const arr = conv.data;
    let sum = 0, sumSq = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i] - 128; // center around 0 approx
      sum += v;
      sumSq += v * v;
    }
    const n = arr.length;
    const mean = sum / n;
    const variance = (sumSq / n) - (mean * mean);
    // Normalize roughly to 0-1 band for ranking
    const norm = Math.max(0, Math.min(1, Math.log1p(Math.max(0, variance)) / 8));
    return norm;
  } catch {
    return 0.0;
  }
}