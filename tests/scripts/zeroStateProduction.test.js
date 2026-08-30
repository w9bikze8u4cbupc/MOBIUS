describe('zero-state production contracts', () => {
  test('stage checkpoints reuse only matching content hashes and existing outputs', async () => {
    const { execFileSync } = require('child_process');
    const script = require('path').resolve(__dirname, '../../scripts/run-rulebook-production.mjs').replace(/\\/g, '/');
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `import {stageReady} from '${script}'; const c={stages:{extraction:{inputHash:'same'}}}; console.log(JSON.stringify([stageReady(c,'extraction','same',[]),stageReady(c,'extraction','changed',[])]));`], { encoding: 'utf8' });
    expect(JSON.parse(output.trim().split(/\r?\n/).pop())).toEqual([true, false]);
  });

  test('the library computes stable source identity independent of the filename used later', async () => {
    const { execFileSync } = require('child_process');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-zero-state-'));
    const firstPath = path.join(directory, 'original.pdf');
    const renamedPath = path.join(directory, 'renamed-rulebook.pdf');
    fs.writeFileSync(firstPath, Buffer.from('%PDF-1.4 stable source bytes'));
    fs.copyFileSync(firstPath, renamedPath);
    const library = path.resolve(__dirname, '../../scripts/rulebook-library.mjs').replace(/\\/g, '/');
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `import {computePdfIdentity} from '${library}'; const a=await computePdfIdentity(${JSON.stringify(firstPath)}); const b=await computePdfIdentity(${JSON.stringify(renamedPath)}); console.log(JSON.stringify([a,b]));`], { encoding: 'utf8' });
    const [first, renamed] = JSON.parse(output.trim().split(/\r?\n/).pop());
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.sha256).toBe(renamed.sha256);
    expect(first.bytes).toBe(renamed.bytes);
  });
});
