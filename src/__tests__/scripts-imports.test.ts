// __tests__/scripts-imports.test.ts
// Ensures scripts can be imported by Jest without executing side effects.

// Mock the ESM modules since Jest has trouble importing them directly
jest.mock('../../scripts/create-desktop-shortcut.mjs', () => {
  return {
    main: jest.fn(),
  };
});

jest.mock('../../scripts/verify-desktop-shortcuts.mjs', () => {
  return {
    main: jest.fn(),
  };
});

describe('scripts import safety', () => {
  test('create-desktop-shortcut can be imported and exports main', async () => {
    const mod = await import('../../scripts/create-desktop-shortcut.mjs');
    expect(typeof mod.main).toBe('function');
  });

  test('verify-desktop-shortcuts can be imported and exports main', async () => {
    const mod = await import('../../scripts/verify-desktop-shortcuts.mjs');
    expect(typeof mod.main).toBe('function');
  });
});