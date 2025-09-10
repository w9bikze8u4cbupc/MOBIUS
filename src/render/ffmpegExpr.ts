// FFmpeg expression helpers for reliable animations with fewer surprises

/**
 * Format a number to a fixed number of decimal places
 * @param n Number to format
 * @param p Number of decimal places (default: 3)
 * @returns Formatted number
 */
export const fmt = (n: number, p = 3) => Number.isFinite(n) ? Number(n.toFixed(p)) : 0;

/**
 * Escape text for use in drawtext/textlike fields (single-quoted contexts)
 * @param s String to escape
 * @returns Escaped string
 */
export function ffEscapeText(s: string) {
  return String(s)
    .replace(/\\/g, '\\\\')   // backslashes
    .replace(/:/g, '\\:')     // drawtext uses ':' as delimiter
    .replace(/'/g, "\\\\'");  // single quotes
}

/**
 * Create an enable expression for a time window
 * @param start Start time
 * @param end End time
 * @returns Enable expression string
 */
export const enableBetween = (start: number, end: number) =>
  `enable='between(t,${fmt(start)},${fmt(end)})'`;

/**
 * Clamp a value between lo and hi
 * @param x Expression to clamp
 * @param lo Lower bound
 * @param hi Upper bound
 * @returns Clamped expression
 */
const clamp = (x: string, lo: number, hi: number) =>
  `if(lt(${x},${fmt(lo)}),${fmt(lo)}, if(gt(${x},${fmt(hi)}),${fmt(hi)}, ${x}))`;

/**
 * Normalize time between t0 and t1 to 0-1 range
 * @param t0 Start time
 * @param t1 End time
 * @returns Normalized expression
 */
const norm = (t0: number, t1: number) =>
  clamp(`(t-${fmt(t0)})/(${fmt(t1)}-${fmt(t0)})`, 0, 1);

// Easing functions in FFmpeg expression space
export const ease = {
  /**
   * 0→1 with cubic ease-out
   * @param t0 Start time
   * @param t1 End time
   * @returns Ease-out expression
   */
  outCubic: (t0: number, t1: number) => {
    const n = norm(t0, t1);
    return `(1 - pow(1 - ${n}, 3))`;
  },
  
  /**
   * 0→1 with cubic ease-in-out
   * @param t0 Start time
   * @param t1 End time
   * @returns Ease-in-out expression
   */
  inOutCubic: (t0: number, t1: number) => {
    const n = norm(t0, t1);
    // piecewise: n<0.5 ? 4n^3 : 1 - (-2n+2)^3/2
    return `if(lt(${n},0.5), 4*${n}*${n}*${n}, 1 - pow(-2*${n}+2,3)/2)`;
  },
};

/**
 * Linear interpolation between a and b using nExpr as the interpolation factor
 * @param a Start value
 * @param b End value
 * @param nExpr Interpolation expression (0-1)
 * @returns Lerp expression
 */
export const lerp = (a: number, b: number, nExpr: string) =>
  `(${fmt(a)} + (${fmt(b)} - ${fmt(a)})*${nExpr})`;