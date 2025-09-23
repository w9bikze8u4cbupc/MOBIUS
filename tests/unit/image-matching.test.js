/**
 * Basic functionality tests for image extraction utilities
 */

import { calculateHammingDistance, calculateSimilarityScore } from '../../src/utils/imageMatching/matcher.js';

describe('Image Matching Core Functions', () => {
  
  test('calculateHammingDistance should work for identical hashes', () => {
    const hash1 = 'abcd1234';
    const hash2 = 'abcd1234';
    expect(calculateHammingDistance(hash1, hash2)).toBe(0);
  });

  test('calculateHammingDistance should calculate distance correctly', () => {
    const hash1 = '0000';
    const hash2 = 'ffff';
    // Each hex digit differs by 4 bits, so 4 digits * 4 bits = 16
    expect(calculateHammingDistance(hash1, hash2)).toBe(16);
  });

  test('calculateSimilarityScore should return 1 for identical hashes', () => {
    expect(calculateSimilarityScore(0, 64)).toBe(1);
  });

  test('calculateSimilarityScore should return 0.5 for half-different hashes', () => {
    expect(calculateSimilarityScore(32, 64)).toBe(0.5);
  });

  test('calculateSimilarityScore should not return negative values', () => {
    expect(calculateSimilarityScore(100, 64)).toBe(0);
  });
});

describe('Utility Functions', () => {
  test('should handle edge cases in similarity calculation', () => {
    expect(calculateSimilarityScore(0, 64)).toBe(1);
    expect(calculateSimilarityScore(64, 64)).toBe(0);
    expect(calculateSimilarityScore(-5, 64)).toBe(0);
    expect(calculateSimilarityScore(100, 64)).toBe(0);
  });

  test('should handle empty hash strings', () => {
    expect(() => calculateHammingDistance('', '')).not.toThrow();
    expect(calculateHammingDistance('', '')).toBe(0);
  });
});