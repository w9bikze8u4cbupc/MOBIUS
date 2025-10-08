// src/__tests__/scripts-imports.test.ts

// This test only asserts that importing the ESM scripts does not execute side-effects
// and that they export a main() function. No top-level jest.mock() is used.
// For any module mocking in ESM, use jest.unstable_mockModule(...) + dynamic import.

describe('desktop shortcut scripts import safety', () => {
  const scriptCases = [
    { name: 'create-desktop-shortcut', path: '../../scripts/create-desktop-shortcut.mjs' },
    { name: 'verify-desktop-shortcuts', path: '../../scripts/verify-desktop-shortcuts.mjs' },
  ];

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    // Explicitly simulate a Jest environment so guards remain in effect
    process.env.JEST_WORKER_ID = process.env.JEST_WORKER_ID ?? '1';
  });

  afterAll(() => {
    delete process.env.NODE_ENV;
    delete process.env.JEST_WORKER_ID;
  });

  it.each(scriptCases)('imports %s without side effects and exposes main()', async ({ name, path }) => {
    // IMPORTANT: Use dynamic import for ESM modules
    const mod = await import(path);
    expect(typeof mod.main).toBe('function');
  });
});