// Unit tests for AreaUtils

import { areaPixelsFromHint, expandRect, RelArea, PxArea } from '../AreaUtils';

describe('AreaUtils', () => {
  describe('areaPixelsFromHint', () => {
    it('should convert relative area to pixels', () => {
      const relArea: RelArea = { relX: 0.1, relY: 0.2, relW: 0.3, relH: 0.4 };
      const result = areaPixelsFromHint(1920, 1080, relArea);
      
      expect(result).toEqual({ x: 192, y: 216, w: 576, h: 432 });
    });

    it('should return pixel area as-is', () => {
      const pxArea: PxArea = { x: 100, y: 200, w: 300, h: 400 };
      const result = areaPixelsFromHint(1920, 1080, pxArea);
      
      expect(result).toEqual({ x: 100, y: 200, w: 300, h: 400 });
    });
  });

  describe('expandRect', () => {
    const baseRect: PxArea = { x: 100, y: 100, w: 200, h: 200 };

    it('should expand rect with uniform padding', () => {
      const result = expandRect(baseRect, 20);
      
      expect(result).toEqual({ x: 80, y: 80, w: 240, h: 240 });
    });

    it('should expand rect with separate x/y padding', () => {
      const result = expandRect(baseRect, { x: 10, y: 30 });
      
      expect(result).toEqual({ x: 90, y: 70, w: 220, h: 260 });
    });

    it('should clamp expanded rect to bounds', () => {
      const result = expandRect(baseRect, 50, { w: 300, h: 300 });
      
      expect(result).toEqual({ x: 50, y: 50, w: 250, h: 250 });
    });

    it('should handle edge cases when clamping', () => {
      const smallRect: PxArea = { x: 0, y: 0, w: 10, h: 10 };
      const result = expandRect(smallRect, 50, { w: 100, h: 100 });
      
      expect(result).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    });
  });
});