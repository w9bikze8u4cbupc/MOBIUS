// Helper to convert GIG area hints to spotlight parameters
import { RelArea, PxArea, areaPixelsFromHint, expandRect } from './AreaUtils';
import { buildHighlightSpotlight } from './AnimationTemplateRegistry';
import { LabelGen } from './LabelGen';

/**
 * Converts a GIG area hint to a spotlight highlight
 * @param lb LabelGen instance for unique labels
 * @param baseV Base video stream label
 * @param frameW Frame width
 * @param frameH Frame height
 * @param area GIG area hint (relative or pixel coordinates)
 * @param p Additional spotlight parameters
 * @returns Object with outV and graph properties
 */
export function spotlightFromAreaHint(
  lb: LabelGen, 
  baseV: string, 
  frameW: number, 
  frameH: number, 
  area: RelArea | PxArea, 
  p: {
    opacity?: number;
    feather?: number;
    margin?: number;
    start: number;
    end: number;
  }
) {
  // Convert area hint to pixel coordinates
  const pixelArea = areaPixelsFromHint(frameW, frameH, area);
  
  // Expand the area with margin if specified
  const expandedArea = p.margin ? expandRect(pixelArea, p.margin, { w: frameW, h: frameH }) : pixelArea;
  
  // Build spotlight parameters
  const spotlightParams = {
    x: expandedArea.x,
    y: expandedArea.y,
    w: expandedArea.w,
    h: expandedArea.h,
    opacity: p.opacity,
    feather: p.feather,
    start: p.start,
    end: p.end
  };
  
  // Call the existing spotlight builder
  return buildHighlightSpotlight(baseV, frameW, frameH, spotlightParams);
}