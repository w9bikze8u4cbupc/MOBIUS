// src/__tests__/chapters.test.js
// Unit tests for chapter generation

import { generateChaptersFromSegments, generateChapterTitle } from '../render/chapters.js';

describe('Chapter Generation', () => {
  describe('generateChapterTitle', () => {
    test('should generate title from segment type', () => {
      const segment = { type: 'introduction', content: 'Welcome' };
      const title = generateChapterTitle(segment, 0);
      expect(title).toBe('Introduction');
    });
    
    test('should handle component_overview type', () => {
      const segment = { type: 'component_overview', content: 'Components' };
      const title = generateChapterTitle(segment, 1);
      expect(title).toBe('Components');
    });
    
    test('should fallback to generic title for unknown types', () => {
      const segment = { type: 'unknown_type', content: 'Content' };
      const title = generateChapterTitle(segment, 2);
      expect(title).toBe('Chapter 3');
    });
  });
  
  describe('generateChaptersFromSegments', () => {
    test('should generate chapters from segments', () => {
      const segments = [
        { type: 'introduction', content: 'Welcome', startTime: 0, endTime: 5 },
        { type: 'setup', content: 'Setup', startTime: 5, endTime: 15 }
      ];
      
      const chapters = generateChaptersFromSegments(segments, 'en');
      
      expect(chapters).toHaveLength(2);
      expect(chapters[0]).toMatchObject({
        title: 'Introduction',
        startTimeSeconds: 0,
        endTimeSeconds: 5,
        segmentType: 'introduction',
        segmentIndex: 0
      });
      expect(chapters[1]).toMatchObject({
        title: 'Setup',
        startTimeSeconds: 5,
        endTimeSeconds: 15,
        segmentType: 'setup',
        segmentIndex: 1
      });
    });
    
    test('should handle segments without timing', () => {
      const segments = [
        { type: 'introduction', content: 'Welcome' }
      ];
      
      const chapters = generateChaptersFromSegments(segments, 'en');
      
      expect(chapters).toHaveLength(1);
      expect(chapters[0].startTimeSeconds).toBe(0);
      expect(chapters[0].endTimeSeconds).toBe(5); // Default duration
    });
    
    test('should throw error for empty segments', () => {
      expect(() => {
        generateChaptersFromSegments([], 'en');
      }).toThrow('No segments provided');
    });
    
    test('should preserve segment order', () => {
      const segments = [
        { type: 'introduction', content: 'A', startTime: 0, endTime: 5 },
        { type: 'setup', content: 'B', startTime: 5, endTime: 10 },
        { type: 'gameplay', content: 'C', startTime: 10, endTime: 20 }
      ];
      
      const chapters = generateChaptersFromSegments(segments, 'en');
      
      expect(chapters[0].segmentIndex).toBe(0);
      expect(chapters[1].segmentIndex).toBe(1);
      expect(chapters[2].segmentIndex).toBe(2);
    });
  });
});
