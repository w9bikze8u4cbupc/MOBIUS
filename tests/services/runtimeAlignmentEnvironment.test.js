import { execFileSync } from 'node:child_process';
const run = code => execFileSync(process.execPath, ['--input-type=module', '-e', `import { windowsPowerShellEnvironment } from './src/services/canonicalRuntimeAlignment.js'; ${code}`], {
  cwd: process.cwd(), encoding: 'utf8', windowsHide: true, timeout: 25000,
});

test('runtime alignment resets only the inherited shell module path, never provider configuration', () => {
  const output = run(`const input = { PSModulePath: 'pwsh7-only', OPENAI_MODEL: 'unchanged-fixture-model', OPENAI_API_KEY: 'fixture-only', Path: 'unchanged' }; console.log(JSON.stringify({output:windowsPowerShellEnvironment(input), original:input.PSModulePath}));`);
  expect(JSON.parse(output)).toEqual({ output: { OPENAI_MODEL: 'unchanged-fixture-model', OPENAI_API_KEY: 'fixture-only', Path: 'unchanged' }, original: 'pwsh7-only' });
});

test('runtime bridge does not attach long-lived descendants to captured pipes', () => {
  const output = run(`import {canonicalRuntimeSpawnOptions} from './src/services/canonicalRuntimeAlignment.js'; console.log(JSON.stringify(canonicalRuntimeSpawnOptions({PSModulePath:'pwsh7-only',OPENAI_MODEL:'unchanged'})));`);
  expect(JSON.parse(output)).toMatchObject({stdio:'ignore',windowsHide:true,env:{OPENAI_MODEL:'unchanged'},timeout:900000});
});

(process.platform === 'win32' ? test : test.skip)('Windows PowerShell resolves its own Utility module when launched through Node', () => {
  const output = run(`import {execFileSync} from 'node:child_process'; console.log(execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command','(Get-Command Get-FileHash -ErrorAction Stop).Name'], {env:windowsPowerShellEnvironment({...process.env,PSModulePath:'fixture-pwsh7-only'}),encoding:'utf8',windowsHide:true,timeout:20000}).trim());`);
  expect(output.trim()).toBe('Get-FileHash');
}, 25000);
