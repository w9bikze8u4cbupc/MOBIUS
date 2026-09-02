describe('zero-state production contracts', () => {
  test('stage checkpoints reuse only matching content hashes and existing outputs', async () => {
    const { execFileSync } = require('child_process');
    const { pathToFileURL } = require('url');
    const script = pathToFileURL(require('path').resolve(__dirname, '../../scripts/run-rulebook-production.mjs')).href;
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
    const { pathToFileURL } = require('url');
    const library = pathToFileURL(path.resolve(__dirname, '../../scripts/rulebook-library.mjs')).href;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `import {computePdfIdentity} from '${library}'; const a=await computePdfIdentity(${JSON.stringify(firstPath)}); const b=await computePdfIdentity(${JSON.stringify(renamedPath)}); console.log(JSON.stringify([a,b]));`], { encoding: 'utf8' });
    const [first, renamed] = JSON.parse(output.trim().split(/\r?\n/).pop());
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.sha256).toBe(renamed.sha256);
    expect(first.bytes).toBe(renamed.bytes);
  });

  test('content-derived game identity and source offsets beat filename/page guesses', async () => {
    const { execFileSync } = require('child_process');
    const { pathToFileURL } = require('url');
    const path = require('path');
    const production = pathToFileURL(path.resolve(__dirname, '../../scripts/run-rulebook-production.mjs')).href;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `import {gameNameFromRulebookText,pagesForSources} from '${production}'; const ranges=[{page:1,start:0,end:2},{page:2,start:2,end:1970},{page:16,start:48917,end:50140}]; console.log(JSON.stringify({name:gameNameFromRulebookText('In Terraforming Mars, you control a corporation.', 'fa0678822223-tm-eng-bgg'), pages:pagesForSources([{startOffset:47974,endOffset:50136}], ranges)}));`], { encoding: 'utf8' });
    const result = JSON.parse(output.trim().split(/\r?\n/).pop());
    expect(result.name).toBe('Terraforming Mars');
    expect(result.pages).toEqual([16]);
  });

});
