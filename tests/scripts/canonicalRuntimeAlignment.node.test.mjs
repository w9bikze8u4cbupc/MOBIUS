import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { resolveCanonicalRuntimeConfigurationPath } from '../../src/services/canonicalRuntimeAlignment.js';

test('explicit canonical runtime configuration is honored without exposing its contents', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-config-explicit-'));
  const file = path.join(root, 'runtime.env');
  fs.writeFileSync(file, 'OPENAI_API_KEY=secret\nOPENAI_MODEL=test-model\n');
  assert.equal(resolveCanonicalRuntimeConfigurationPath({ root, env: { MOBIUS_CONFIG_PATH: file } }), path.resolve(file));
  fs.rmSync(root, { recursive: true, force: true });
});
test('a linked Windows-compatible worktree resolves configuration from the Git common owner', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-config-common-'));
  const worktree = `${root}-linked`;
  execFileSync('git', ['init', root], { windowsHide: true });
  execFileSync('git', ['-C', root, 'config', 'user.email', 'fixture@example.invalid'], { windowsHide: true });
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Fixture'], { windowsHide: true });
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'fixture');
  fs.writeFileSync(path.join(root, '.env'), 'OPENAI_API_KEY=secret\nOPENAI_MODEL=test-model\n');
  execFileSync('git', ['-C', root, 'add', 'tracked.txt'], { windowsHide: true });
  execFileSync('git', ['-C', root, 'commit', '-m', 'fixture'], { windowsHide: true });
  execFileSync('git', ['-C', root, 'worktree', 'add', '--detach', worktree, 'HEAD'], { windowsHide: true });
  try {
    assert.equal(resolveCanonicalRuntimeConfigurationPath({ root: worktree, env: {} }), path.resolve(root, '.env'));
  } finally {
    execFileSync('git', ['-C', root, 'worktree', 'remove', '--force', worktree], { windowsHide: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
