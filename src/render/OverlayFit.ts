// OverlayFit utility for robust contain/cover fit using scale2ref + pad/crop

export type FitMode = 'contain' | 'cover';
export type Alignment = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface FitOptions {
  mode: FitMode;
  alignment: Alignment;
  width: number;
  height: number;
}

/**
 * Generate FFmpeg filter chain for fitting an overlay into a rectangle
 * @param baseLabel Label of the base video stream
 * @param overlayLabel Label of the overlay video stream
 * @param options Fit options
 * @returns Object with output label and filter graph string
 */
export function buildOverlayFit(baseLabel: string, overlayLabel: string, options: FitOptions) {
  const { mode, alignment, width, height } = options;
  
  // Use scale2ref to scale overlay to reference dimensions
  const scaledLabel = 'scaled';
  const refLabel = 'ref';
  
  // Calculate scaling factors
  const scaleFilter = `scale2ref=w=${width}:h=${height}[${refLabel}][${scaledLabel}]`;
  
  // Depending on mode, we might need to pad or crop
  let fitFilter = '';
  let outLabel = 'fitted';
  
  if (mode === 'contain') {
    // For contain, we scale to fit within the bounds and pad
    fitFilter = `pad=${width}:${height}:x=${calculateXOffset(alignment, width)}:y=${calculateYOffset(alignment, height)}:color=black@0`;
  } else {
    // For cover, we scale to cover the bounds and crop
    fitFilter = `crop=${width}:${height}:x=${calculateXOffset(alignment, width)}:y=${calculateYOffset(alignment, height)}`;
  }
  
  const graph = `${scaleFilter};[${scaledLabel}]${fitFilter}[${outLabel}]`;
  
  return {
    outV: outLabel,
    graph
  };
}

/**
 * Calculate X offset based on alignment
 */
function calculateXOffset(alignment: Alignment, width: number): string {
  switch (alignment) {
    case 'left':
    case 'top-left':
    case 'bottom-left':
      return '0';
    case 'right':
    case 'top-right':
    case 'bottom-right':
      return `(ow-iw)`;
    case 'center':
    case 'top':
    case 'bottom':
    default:
      return `(ow-iw)/2`;
  }
}

/**
 * Calculate Y offset based on alignment
 */
function calculateYOffset(alignment: Alignment, height: number): string {
  switch (alignment) {
    case 'top':
    case 'top-left':
    case 'top-right':
      return '0';
    case 'bottom':
    case 'bottom-left':
    case 'bottom-right':
      return `(oh-ih)`;
    case 'center':
    case 'left':
    case 'right':
    default:
      return `(oh-ih)/2`;
  }
}