/**
 * Simple test for confidence to hamming distance formula
 * Testing the core requirement from the PR description
 */

// Import using CommonJS for Jest compatibility
const {
  confidenceToMaxHamming,
  hammingToConfidence,
  DHASH_BITS
} = require('../dhash.js');

describe('DHash Formula Validation', () => {
  test('should implement correct confidence to hamming formula', () => {
    // Test the specific examples mentioned in the PR description
    // Formula: max_hamming = ⌊(1−confidence) × bit_length⌋
    
    const confidence90 = 0.90;
    const maxHamming90 = confidenceToMaxHamming(confidence90);
    expect(maxHamming90).toBe(6); // ⌊(1-0.9) × 64⌋ = ⌊6.4⌋ = 6

    const confidence95 = 0.95;
    const maxHamming95 = confidenceToMaxHamming(confidence95);
    expect(maxHamming95).toBe(3); // ⌊(1-0.95) × 64⌋ = ⌊3.2⌋ = 3
  });

  test('should validate boundary cases', () => {
    expect(confidenceToMaxHamming(0)).toBe(64);
    expect(confidenceToMaxHamming(1)).toBe(0);
    
    expect(hammingToConfidence(0)).toBe(1.0);
    expect(hammingToConfidence(64)).toBe(0.0);
  });

  test('should validate input ranges', () => {
    expect(() => confidenceToMaxHamming(-0.1))
      .toThrow('Confidence must be between 0.0 and 1.0');
    
    expect(() => confidenceToMaxHamming(1.1))
      .toThrow('Confidence must be between 0.0 and 1.0');
  });
});