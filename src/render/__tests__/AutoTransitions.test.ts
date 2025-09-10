// Unit tests for AutoTransitions

import { LabelGen } from '../LabelGen';
import { planAndBuildCrossfades, Seg, XFadePolicy } from '../AutoTransitions';

describe('AutoTransitions', () => {
  describe('planAndBuildCrossfades', () => {
    it('should generate crossfades for overlapping segments', () => {
      const lb = new LabelGen();
      const segs: Seg[] = [
        { v: 'v0', a: 'a0', start: 0, end: 5 },
        { v: 'v1', a: 'a1', start: 4, end: 10 }
      ];

      const result = planAndBuildCrossfades(lb, segs);

      expect(result.graph).toContain('xfade=transition=fade:duration=0.5:offset=4.5');
      expect(result.graph).toContain('acrossfade=d=0.5:c1=tri:c2=tri');
      expect(result.outV).toMatch(/xf\d+/);
      expect(result.outA).toMatch(/axf\d+/);
    });

    it('should generate default crossfades for non-overlapping segments', () => {
      const lb = new LabelGen();
      const segs: Seg[] = [
        { v: 'v0', a: 'a0', start: 0, end: 5 },
        { v: 'v1', a: 'a1', start: 6, end: 10 }
      ];

      const result = planAndBuildCrossfades(lb, segs);

      expect(result.graph).toContain('xfade=transition=fade:duration=0.35:offset=6');
      expect(result.graph).toContain('acrossfade=d=0.35:c1=tri:c2=tri');
    });

    it('should handle segments with no audio', () => {
      const lb = new LabelGen();
      const segs: Seg[] = [
        { v: 'v0', start: 0, end: 5 },
        { v: 'v1', start: 4, end: 10 }
      ];

      const result = planAndBuildCrossfades(lb, segs);

      expect(result.graph).toContain('xfade=transition=fade:duration=0.5:offset=4.5');
      expect(result.outV).toMatch(/xf\d+/);
      expect(result.outA).toBeUndefined();
    });
  });
});