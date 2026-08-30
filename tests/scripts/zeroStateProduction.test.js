describe('zero-state production contracts', () => {
  test('stage checkpoints reuse only matching content hashes and existing outputs', async () => {
    const { stageReady } = await import('../../scripts/run-rulebook-production.mjs');
    const checkpoint = { stages: { extraction: { inputHash: 'same' } } };
    expect(stageReady(checkpoint, 'extraction', 'same', [])).toBe(true);
    expect(stageReady(checkpoint, 'extraction', 'changed', [])).toBe(false);
  });

  test('the library computes stable source identity independent of the filename used later', async () => {
    const { computePdfIdentity } = await import('../../scripts/rulebook-library.mjs');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-zero-state-'));
    const firstPath = path.join(directory, 'original.pdf');
    const renamedPath = path.join(directory, 'renamed-rulebook.pdf');
    fs.writeFileSync(firstPath, Buffer.from('%PDF-1.4 stable source bytes'));
    fs.copyFileSync(firstPath, renamedPath);
    const first = await computePdfIdentity(firstPath);
    const renamed = await computePdfIdentity(renamedPath);
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.sha256).toBe(renamed.sha256);
    expect(first.bytes).toBe(renamed.bytes);
  });
});
