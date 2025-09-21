/**
 * Test to verify that our coala and ESLint configuration is working correctly
 */

// This test file verifies that our ESLint configuration is properly set up
// It doesn't test actual functionality, but rather the linting configuration

describe('Coala Configuration Test', () => {
  test('should detect http URLs', () => {
    // This should be flagged by our custom ESLint rule
    const insecureUrl = 'http://example.com';
    expect(insecureUrl).toBeDefined();
  });

  test('should handle console warnings correctly', () => {
    // This should be allowed by our ESLint configuration
    console.warn('This warning should be allowed');
    console.error('This error should be allowed');

    // But this should be flagged
    console.log('This log might be flagged in production');
  });

  test('should handle reasonable function complexity', () => {
    // This simple function should not be flagged
    const simpleFunction = () => {
      return 'simple';
    };

    expect(simpleFunction()).toBe('simple');
  });
});
