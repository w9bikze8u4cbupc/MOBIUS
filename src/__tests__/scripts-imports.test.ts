// __tests__/scripts-imports.test.ts
// Ensures scripts can be imported by Jest without executing side effects.

describe('scripts import safety', () => {
  test('create-desktop-shortcut can be imported and exports main', async () => {
    // This test is primarily to ensure the module can be imported without side effects
    // The actual functionality is tested in the behavioral tests
    const mod = await import('../../scripts/create-desktop-shortcut.mjs');
    expect(typeof mod.main).toBe('function');
  });

  test('verify-desktop-shortcuts can be imported and exports main', async () => {
    // This test is primarily to ensure the module can be imported without side effects
    // The actual functionality is tested in the behavioral tests
    const mod = await import('../../scripts/verify-desktop-shortcuts.mjs');
    expect(typeof mod.main).toBe('function');
  });
});