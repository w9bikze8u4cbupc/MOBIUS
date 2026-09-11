import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const agent = fs.readFileSync(path.join(directory, 'mobius-isolated-agent.ps1'), 'utf8');
const bootstrap = fs.readFileSync(path.join(directory, 'bootstrap-mobius-isolated-agent.ps1'), 'utf8');

const requiredAgentTokens = [
  "[string]$DeploymentRoot = 'C:\\mobius-games-tutorial-generator-runtime'",
  "'worktree', 'add', '--detach', $deployment, 'origin/main'",
  "-WorkingDirectory $deployment",
  "Invoke-Git $deployment @('reset', '--hard', $target)",
  "Copy-DirectoryContents (Join-Path $repo 'data') (Join-Path $deployment 'data')",
  "Installing isolated server dependencies.",
  "node_modules\\express\\package.json",
  "node_modules\\.bin\\react-scripts.cmd",
  "$npmCommand ci --ignore-scripts",
  'Resolve-NpmCommand',
  'Get-Command npm.cmd -All',
  '[Security.Cryptography.SHA256]::Create()',
  '$env:PORT = [string]$runtimePort',
  'Remove-Item -LiteralPath $ownershipPath -Force',
  "node_modules\\ffmpeg-static\\ffmpeg.exe",
  "$npmCommand rebuild ffmpeg-static --foreground-scripts",
  '$npmCommand run build',
  "Sync-LocalConfiguration",
  "Copy-Item -Force -Path $primaryEnv -Destination $runtimeEnv",
  "-e', '.env'",
  "Preserve-RuntimeData",
  "Restore-RuntimeData",
  'MOBIUS isolated deployment is current and responding on port 5001.',
  "[ValidateSet('Watch', 'Sync', 'Align', 'Status')]",
  'mobius-runtime-ownership.json',
  'mobius-runtime-alignment-request.json',
  'Runtime port $runtimePort is occupied by a process whose MOBIUS ownership is ambiguous; refusing destructive restart.',
  "MOBIUS_RUNTIME_MANAGER = 'mobius-isolated-agent-v2'",
  '-WindowStyle Hidden',
  "$Mode -eq 'Align'",
];
for (const token of requiredAgentTokens) {
  if (!agent.includes(token)) throw new Error(`Missing isolated-agent safety contract: ${token}`);
}

const requiredBootstrapTokens = [
  "'MOBIUS Isolated Local Agent'",
  "worktree add --detach $deployment $target",
  "git -C $deployment reset --hard $target",
  "Copy-DirectoryContents $primaryData $deploymentData",
  "Copy-Item -Force -Path $primaryEnv -Destination $runtimeEnv",
  "Stop-ScheduledTask -TaskName 'MOBIUS Local Agent'",
  'Get-CimInstance Win32_Process -Filter "ProcessId = $($pids[0])"',
  "Start-Sleep -Seconds 3",
  'Primary checkout preserved:',
  '-DeploymentRoot $deployment',
  '[switch]$AdoptLegacyRuntime',
  'Runtime port $runtimePort ownership is ambiguous; refusing to stop PID',
  '-Mode Align',
  'A previous managed startup may have failed before binding the configured',
];
for (const token of requiredBootstrapTokens) {
  if (!bootstrap.includes(token)) throw new Error(`Missing bootstrap safety contract: ${token}`);
}

if (bootstrap.includes('git -C $repo pull') || bootstrap.includes('git -C $repo reset')) {
  throw new Error('Bootstrap must never mutate the primary checkout.');
}
if (/Get-CimInstance Win32_Process[^\n]+\|[\s\S]{0,200}ForEach-Object \{ Stop-Process/.test(bootstrap)) {
  throw new Error('Bootstrap must never stop every matching Node process.');
}

const bootstrapDataSeed = /if \(\$createdDeployment -and \(Test-Path \$primaryData\)\) \{\s+Copy-DirectoryContents \$primaryData \$deploymentData\s+\}/s;
if (!bootstrapDataSeed.test(bootstrap)) {
  throw new Error('Bootstrap must seed primary data only when creating a new isolated worktree.');
}
if (bootstrap.includes('& robocopy $primaryData $deploymentData')) {
  throw new Error('Bootstrap must not directly overlay primary project data onto an existing runtime.');
}
const bootstrapRuntimePreservation = /Preserve-RuntimeData\s+try \{\s+& git -C \$deployment reset --hard \$target[\s\S]*?\} finally \{\s+Restore-RuntimeData\s+\}/;
if (!bootstrapRuntimePreservation.test(bootstrap)) {
  throw new Error('Bootstrap must preserve canonical runtime data across reset and cleanup.');
}
if (!bootstrap.includes('git -C $deployment clean -fdx -e data/ -e src/api/uploads/')) {
  throw new Error('Bootstrap must preserve canonical runtime data and legacy local assets while cleaning builds.');
}
if (!agent.includes("Invoke-Git $deployment @('clean', '-fdx', '-e', 'data/', '-e', 'src/api/uploads/', '-e', '.env')")) {
  throw new Error('Normal isolated updates must preserve canonical runtime data and legacy local assets.');
}

console.log(  'MOBIUS isolated-agent contract verified.');
