// jest.config.elite.mjs
// Dedicated Jest config for the Elite verifier test suite.
// Runs under --experimental-vm-modules so Jest can natively load the
// real .mjs verifier without CJS bridges or logic duplication.
//
// Usage:  node --experimental-vm-modules node_modules/.bin/jest --config jest.config.elite.mjs

export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/eliteVerifierSkeleton.test.mjs'],
  // No transform — ESM mode loads .mjs natively
  transform: {},
};
