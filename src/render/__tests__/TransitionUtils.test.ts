// Unit tests for TransitionUtils

import { buildXFade, buildAcrossfade, buildDebugGrid } from '../TransitionUtils';
import { LabelGen } from '../LabelGen';

describe('TransitionUtils', () => {
  describe('buildXFade', () => {
    it('should generate a fade transition with default parameters', () => {
      const lb = new LabelGen();
      const result = buildXFade(lb, 'v0', 'v1', { duration: 1.0, offset: 2.0 });
      
      expect(result.graph).toBe('[v0][v1]xfade=transition=fade:duration=1:offset=2[xf0]');
      expect(result.outV).toBe('xf0');
    });

    it('should generate a wipeleft transition with custom parameters', () => {
      const lb = new LabelGen();
      const result = buildXFade(lb, 'v0', 'v1', { 
        transition: 'wipeleft', 
        duration: 0.5, 
        offset: 1.5 
      });
      
      expect(result.graph).toBe('[v0][v1]xfade=transition=wipeleft:duration=0.5:offset=1.5[xf0]');
      expect(result.outV).toBe('xf0');
    });
  });

  describe('buildAcrossfade', () => {
    it('should generate an audio crossfade with default curves', () => {
      const lb = new LabelGen();
      const result = buildAcrossfade(lb, 'a0', 'a1', { duration: 1.0 });
      
      expect(result.graph).toBe('[a0][a1]acrossfade=d=1:c1=tri:c2=tri[axf0]');
      expect(result.outA).toBe('axf0');
    });

    it('should generate an audio crossfade with custom curves', () => {
      const lb = new LabelGen();
      const result = buildAcrossfade(lb, 'a0', 'a1', { 
        duration: 0.5, 
        curveA: 'qsin', 
        curveB: 'hsin' 
      });
      
      expect(result.graph).toBe('[a0][a1]acrossfade=d=0.5:c1=qsin:c2=hsin[axf0]');
      expect(result.outA).toBe('axf0');
    });
  });

  describe('buildDebugGrid', () => {
    it('should generate a debug grid with default cell size', () => {
      const lb = new LabelGen();
      const result = buildDebugGrid(lb, 'v0');
      
      expect(result.graph).toBe('[v0]drawgrid=width=120:height=120:color=white@0.25:thickness=1,showinfo[grid0]');
      expect(result.outV).toBe('grid0');
    });

    it('should generate a debug grid with custom cell size', () => {
      const lb = new LabelGen();
      const result = buildDebugGrid(lb, 'v0', 60);
      
      expect(result.graph).toBe('[v0]drawgrid=width=60:height=60:color=white@0.25:thickness=1,showinfo[grid0]');
      expect(result.outV).toBe('grid0');
    });
  });
});