// Unit tests for AreaToSpotlightHelper

import { spotlightFromAreaHint } from '../AreaToSpotlightHelper';
import { LabelGen } from '../LabelGen';

describe('AreaToSpotlightHelper', () => {
  describe('spotlightFromAreaHint', () => {
    it('should convert relative area to spotlight highlight', () => {
      const lb = new LabelGen();
      const result = spotlightFromAreaHint(
        lb,
        'base0',
        1920,
        1080,
        { relX: 0.25, relY: 0.25, relW: 0.5, relH: 0.5 },
        { start: 1.0, end: 5.0, opacity: 0.6, feather: 20, margin: 10 },
      );

      expect(result.graph).toContain('format=rgba');
      expect(result.graph).toContain('color=c=black@0.6');
      expect(result.graph).toContain('drawbox=');
      expect(result.graph).toContain('gblur=sigma=20');
      expect(result.graph).toContain('enable=\'between(t,1,5)\'');
      expect(result.outV).toMatch(/spot_out\d+/);
    });

    it('should convert pixel area to spotlight highlight', () => {
      const lb = new LabelGen();
      const result = spotlightFromAreaHint(
        lb,
        'base0',
        1920,
        1080,
        { x: 480, y: 270, w: 960, h: 540 },
        { start: 2.0, end: 6.0 },
      );

      expect(result.graph).toContain('format=rgba');
      expect(result.graph).toContain('enable=\'between(t,2,6)\'');
      expect(result.outV).toMatch(/spot_out\d+/);
    });
  });
});
