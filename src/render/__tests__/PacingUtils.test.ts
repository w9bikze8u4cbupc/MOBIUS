// Unit tests for PacingUtils

import { deadZoneMerge, syllableSnap, validatePacing, TimelineSegment } from '../PacingUtils';

describe('PacingUtils', () => {
  describe('deadZoneMerge', () => {
    it('should extend segments shorter than minimum duration', () => {
      const timeline: TimelineSegment[] = [
        { id: 's1', type: 'title', start: 0, end: 0.2 }, // Too short
        { id: 's2', type: 'hook', start: 0.2, end: 0.3 }, // Too short
        { id: 's3', type: 'components', start: 0.3, end: 2.5 }, // Good duration
      ];
      
      const result = deadZoneMerge(timeline, 0.3);
      
      // All segments should be extended to meet minimum duration
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('s1');
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(0.3); // Extended to minimum
      expect(result[1].id).toBe('s2');
      expect(result[1].start).toBe(0.2);
      expect(result[1].end).toBe(0.5); // Extended to minimum (start + 0.3)
      expect(result[2].id).toBe('s3');
      expect(result[2].start).toBe(0.3);
      expect(result[2].end).toBe(2.5); // Unchanged
    });

    it('should not modify segments that meet minimum duration', () => {
      const timeline: TimelineSegment[] = [
        { id: 's1', type: 'title', start: 0, end: 0.5 },
        { id: 's2', type: 'hook', start: 0.5, end: 1.0 },
        { id: 's3', type: 'components', start: 1.0, end: 2.5 },
      ];
      
      const result = deadZoneMerge(timeline, 0.3);
      
      // All segments should remain unchanged
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('s1');
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(0.5);
      expect(result[1].id).toBe('s2');
      expect(result[1].start).toBe(0.5);
      expect(result[1].end).toBe(1.0);
      expect(result[2].id).toBe('s3');
      expect(result[2].start).toBe(1.0);
      expect(result[2].end).toBe(2.5);
    });

    it('should handle empty timeline', () => {
      const timeline: TimelineSegment[] = [];
      const result = deadZoneMerge(timeline, 0.3);
      expect(result).toHaveLength(0);
    });
  });

  describe('syllableSnap', () => {
    it('should extend segments below minimum visibility', () => {
      const timeline: TimelineSegment[] = [
        { id: 's1', type: 'title', start: 0, end: 0.05 }, // Below minimum visibility
        { id: 's2', type: 'hook', start: 0.05, end: 0.5 }, // Above minimum
      ];
      
      const result = syllableSnap(timeline, {}, 0.1);
      
      expect(result[0].id).toBe('s1');
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(0.1); // Extended to minimum visibility
      expect(result[1].id).toBe('s2');
      expect(result[1].start).toBe(0.05);
      expect(result[1].end).toBe(0.5); // Unchanged
    });
  });

  describe('validatePacing', () => {
    it('should validate correct pacing', () => {
      const timeline: TimelineSegment[] = [
        { id: 's1', type: 'title', start: 0, end: 0.5 },
        { id: 's2', type: 'hook', start: 0.5, end: 1.0 },
      ];
      
      const result = validatePacing(timeline, 0.3, 0.1);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect segments below minimum duration', () => {
      const timeline: TimelineSegment[] = [
        { id: 's1', type: 'title', start: 0, end: 0.2 }, // Below minimum duration
        { id: 's2', type: 'hook', start: 0.2, end: 1.0 },
      ];
      
      const result = validatePacing(timeline, 0.3, 0.1);
      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toContain('below minimum duration');
    });

    it('should detect segments below minimum visibility', () => {
      const timeline: TimelineSegment[] = [
        { id: 's1', type: 'title', start: 0, end: 0.05 }, // Below minimum visibility
        { id: 's2', type: 'hook', start: 0.05, end: 1.0 },
      ];
      
      const result = validatePacing(timeline, 0.3, 0.1);
      expect(result.valid).toBe(false);
      // Both checks will fail - duration and visibility
      expect(result.issues).toHaveLength(2);
      expect(result.issues.some(issue => issue.includes('below minimum duration'))).toBe(true);
      expect(result.issues.some(issue => issue.includes('below minimum visibility'))).toBe(true);
    });
  });
});