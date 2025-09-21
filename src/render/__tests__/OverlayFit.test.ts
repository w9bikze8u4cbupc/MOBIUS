// Unit tests for OverlayFit

import { buildOverlayFit } from '../OverlayFit';

describe('OverlayFit', () => {
  describe('buildOverlayFit', () => {
    it('should generate correct filter for contain mode with center alignment', () => {
      const result = buildOverlayFit('base', 'overlay', {
        mode: 'contain',
        alignment: 'center',
        width: 400,
        height: 300,
      });

      expect(result.graph).toContain('scale2ref=w=400:h=300');
      expect(result.graph).toContain('pad=400:300');
      expect(result.graph).toContain('x=(ow-iw)/2:y=(oh-ih)/2');
      expect(result.outV).toBe('fitted');
    });

    it('should generate correct filter for cover mode with top-left alignment', () => {
      const result = buildOverlayFit('base', 'overlay', {
        mode: 'cover',
        alignment: 'top-left',
        width: 400,
        height: 300,
      });

      expect(result.graph).toContain('scale2ref=w=400:h=300');
      expect(result.graph).toContain('crop=400:300');
      expect(result.graph).toContain('x=0:y=0');
      expect(result.outV).toBe('fitted');
    });

    it('should generate correct filter for contain mode with right alignment', () => {
      const result = buildOverlayFit('base', 'overlay', {
        mode: 'contain',
        alignment: 'right',
        width: 400,
        height: 300,
      });

      expect(result.graph).toContain('scale2ref=w=400:h=300');
      expect(result.graph).toContain('pad=400:300');
      expect(result.graph).toContain('x=(ow-iw):y=(oh-ih)/2');
      expect(result.outV).toBe('fitted');
    });
  });
});
