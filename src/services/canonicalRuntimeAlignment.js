import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveGitIdentity } from './runtimeCompatibility.js';

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function localBaseUrl(value) {
  try {
    const parsed = new URL(value);
    return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function resolveCanonicalRuntimeConfigurationPath({ root = moduleRoot, env = process.env } = {}) {
  const explicit = String(env.MOBIUS_CONFIG_PATH || '').trim();
  if (explicit) return fs.existsSync(path.resolve(explicit)) ? path.resolve(explicit) : null;
  const common = spawnSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8', windowsHide: true,
  });
  if (common.status === 0) {
    const shared = path.join(path.dirname(common.stdout.trim()), '.env');
    if (fs.existsSync(shared)) return path.resolve(shared);
  }
  const local = path.join(root, '.env');
  return fs.existsSync(local) ? path.resolve(local) : null;
}

export async function alignCanonicalRuntime({ baseUrl, requirements } = {}) {
  if (process.platform !== 'win32' || !localBaseUrl(baseUrl)) {
    return { attempted: false, aligned: false, reason: 'automatic-alignment-only-applies-to-the-owned-local-Windows-runtime' };
  }
  const script = path.join(moduleRoot, 'scripts', 'mobius-isolated-agent.ps1');
  const deploymentRoot = process.env.MOBIUS_RUNTIME_DEPLOYMENT_ROOT || 'C:\\mobius-games-tutorial-generator-runtime';
  const targetRevision = requirements?.workerIdentity || resolveGitIdentity({ cwd: moduleRoot });
  const configurationPath = resolveCanonicalRuntimeConfigurationPath({ root: moduleRoot });
  if (!/^[a-f0-9]{40}$/i.test(targetRevision)) {
    return { attempted: false, aligned: false, reason: 'worker-build-identity-is-not-a-deployable-git-revision' };
  }
  const argumentsList = [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', script,
    '-Mode', 'Align',
    '-RepoRoot', moduleRoot,
    '-DeploymentRoot', deploymentRoot,
    '-BaseUrl', baseUrl,
    '-TargetRevision', targetRevision,
  ];
  if (configurationPath) argumentsList.push('-ConfigurationPath', configurationPath);
  const result = spawnSync('powershell.exe', argumentsList, { encoding: 'utf8', windowsHide: true, timeout: 15 * 60 * 1000 });
  if (result.status !== 0) {
    return {
      attempted: true,
      aligned: false,
      reason: 'canonical-runtime-manager-refused-or-failed-alignment',
      exitCode: result.status,
      stdout: result.stdout?.trim() || '',
      stderr: result.stderr?.trim() || '',
    };
  }
  return { attempted: true, aligned: false, reason: 'canonical-runtime-manager-completed; capability-recheck-required' };
}
