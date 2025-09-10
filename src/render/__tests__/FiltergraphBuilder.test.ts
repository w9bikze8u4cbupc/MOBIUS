import { estimateSecondsByWPM } from '../FiltergraphBuilder';

describe('FiltergraphBuilder', () => {
  test('should estimate seconds by WPM correctly', () => {
    // Test with default values
    const duration1 = estimateSecondsByWPM("This is a test sentence");
    expect(duration1).toBeGreaterThanOrEqual(1.25); // minSeconds
    
    // Test with custom values
    const duration2 = estimateSecondsByWPM("This is a test sentence", {
      wpm: 200,
      minSeconds: 0.5,
      perBeatPad: 0.1
    });
    expect(duration2).toBeGreaterThan(0.5);
  });

  test('should handle empty text', () => {
    const duration = estimateSecondsByWPM("");
    expect(duration).toBe(1.25); // Should return minSeconds
  });

  test('should handle whitespace-only text', () => {
    const duration = estimateSecondsByWPM("   ");
    expect(duration).toBe(1.25); // Should return minSeconds
  });
});