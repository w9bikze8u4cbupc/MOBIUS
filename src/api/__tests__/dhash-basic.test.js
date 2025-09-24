/**
 * Simple smoke test for DHash functionality
 */

import {
  calculateHammingDistance,
  confidenceToMaxHamming,
  hammingToConfidence,
  validateHashMetadata,
  DHASH_ALGORITHM,
  DHASH_VERSION,
  DHASH_BITS
} from '../dhash.js';

describe('DHash Basic Functionality', () => {
  
  describe('calculateHammingDistance', () => {
    test('should return 0 for identical hashes', () => {
      const hash = 'a1b2c3d4e5f6789a';
      const distance = calculateHammingDistance(hash, hash);
      expect(distance).toBe(0);
    });

    test('should calculate correct distance for different hashes', () => {
      const hash1 = '0000000000000000'; // All zeros
      const hash2 = 'ffffffffffffffff'; // All ones
      const distance = calculateHammingDistance(hash1, hash2);
      expect(distance).toBe(64); // All bits different
    });

    test('should calculate distance for 1-bit difference', () => {
      const hash1 = '0000000000000000';
      const hash2 = '0000000000000001'; // Only last bit different
      const distance = calculateHammingDistance(hash1, hash2);
      expect(distance).toBe(1);
    });
  });

  describe('confidenceToMaxHamming formula validation', () => {
    test('should implement correct formula: max_hamming = ⌊(1−confidence) × bit_length⌋', () => {
      const testCases = [
        { confidence: 0.90, expected: 6 },  // ⌊(1-0.9) × 64⌋ = ⌊6.4⌋ = 6
        { confidence: 0.95, expected: 3 },  // ⌊(1-0.95) × 64⌋ = ⌊3.2⌋ = 3
        { confidence: 0.80, expected: 12 }, // ⌊(1-0.8) × 64⌋ = ⌊12.8⌋ = 12
        { confidence: 1.00, expected: 0 },  // ⌊(1-1.0) × 64⌋ = 0
        { confidence: 0.00, expected: 64 }  // ⌊(1-0.0) × 64⌋ = 64
      ];

      testCases.forEach(({ confidence, expected }) => {
        const result = confidenceToMaxHamming(confidence);
        expect(result).toBe(expected);
      });
    });

    test('should handle unit test assertions for equivalence (PR requirement)', () => {
      // Test the specific examples mentioned in the PR description
      const confidence90 = 0.90;
      const maxHamming90 = confidenceToMaxHamming(confidence90);
      expect(maxHamming90).toBe(6); // 0.90 → max_hamming = 6 for 64 bits

      const confidence95 = 0.95;
      const maxHamming95 = confidenceToMaxHamming(confidence95);
      expect(maxHamming95).toBe(3); // 0.95 → max_hamming = 3 for 64 bits
    });

    test('should validate input ranges', () => {
      expect(() => confidenceToMaxHamming(-0.1))
        .toThrow('Confidence must be between 0.0 and 1.0');
      
      expect(() => confidenceToMaxHamming(1.1))
        .toThrow('Confidence must be between 0.0 and 1.0');
    });
  });

  describe('validateHashMetadata', () => {
    test('should validate complete metadata', () => {
      const validMetadata = {
        hash: 'a1b2c3d4e5f6789a',
        hash_alg: DHASH_ALGORITHM,
        version: DHASH_VERSION,
        bits: DHASH_BITS,
        node_module_version: 'v18.0.0'
      };
      
      expect(validateHashMetadata(validMetadata)).toBe(true);
    });

    test('should reject incomplete metadata', () => {
      const incompleteMetadata = {
        hash: 'a1b2c3d4e5f6789a',
        hash_alg: DHASH_ALGORITHM
        // Missing required fields
      };
      
      expect(validateHashMetadata(incompleteMetadata)).toBe(false);
    });
  });

  describe('Constants validation', () => {
    test('should have correct algorithm and version constants', () => {
      expect(DHASH_ALGORITHM).toBe('perceptual_dhash');
      expect(DHASH_VERSION).toBe('1.0.0');
      expect(DHASH_BITS).toBe(64);
    });
  });
});