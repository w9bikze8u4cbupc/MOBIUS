const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('native Inbox persistence recovery and owned-lease regressions run in normal CI', () => {
  const output = execFileSync(process.execPath, ['--test', path.join(__dirname, 'persistenceRecovery.node.test.mjs')], {
    cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  expect(output).toMatch(/# fail 0/);
}, 35000);
