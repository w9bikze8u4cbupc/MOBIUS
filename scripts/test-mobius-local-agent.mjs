import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const agentPath = path.join(root, 'scripts', 'mobius-local-agent.ps1');
const installerPath = path.join(root, 'scripts', 'install-mobius-local-agent.ps1');
const uninstallPath = path.join(root, 'scripts', 'uninstall-mobius-local-agent.ps1');
const agent = fs.readFileSync(agentPath, 'utf8');
const installer = fs.readFileSync(installerPath, 'utf8');
const uninstall = fs.readFileSync(uninstallPath, 'utf8');

const requiredAgentTokens = [
  "'status', '--porcelain'",
  "'pull', '--ff-only', 'origin', 'main'",
  "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\"",
  "src[\\\\/]api[\\\\/]index\\.js",
  "Invoke-WebRequest -Uri 'http://127.0.0.1:5001/'",
  'RedirectStandardOutput $serverOutLog',
  'RedirectStandardError $serverErrLog',
  "'waiting_for_clean_tree'",
  "'ready'",
  '[switch]$ForceBuild',
  'Invoke-MobiusDeployment -ForceBuild:$ForceBuild',
  "'status', '--porcelain', '--untracked-files=all'",
  "'src/api/uploads/'",
  "$status -eq '??'",
  'Local source changes detected; automatic deployment is paused to protect them.',
];
for (const token of requiredAgentTokens) {
  if (!agent.includes(token)) throw new Error(`Missing agent safety contract: ${token}`);
}

const requiredInstallerTokens = [
  "'MOBIUS Local Agent'",
  'New-ScheduledTaskTrigger -AtLogOn',
  'Register-ScheduledTask',
  'Start-ScheduledTask',
  'mobius-local-agent.status.json',
  '& $agent -Mode Sync -ForceBuild',
];
for (const token of requiredInstallerTokens) {
  if (!installer.includes(token)) throw new Error(`Missing installer contract: ${token}`);
}

if (!uninstall.includes('Unregister-ScheduledTask') || !uninstall.includes("'MOBIUS Local Agent'")) {
  throw new Error('Uninstall contract is incomplete.');
}

console.log('MOBIUS local agent contract verified.');
