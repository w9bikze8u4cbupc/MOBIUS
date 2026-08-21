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
  "npm ci --ignore-scripts",
  "node_modules\\ffmpeg-static\\ffmpeg.exe",
  "npm rebuild ffmpeg-static --foreground-scripts",
  "Sync-LocalConfiguration",
  "Copy-Item -Force -Path $primaryEnv -Destination $runtimeEnv",
  "-e', '.env'",
  "Preserve-RuntimeData",
  "Restore-RuntimeData",
  'MOBIUS isolated deployment is current and responding on port 5001.',
];
for (const token of requiredAgentTokens) {
  if (!agent.includes(token)) throw new Error(`Missing isolated-agent safety contract: ${token}`);
}

const requiredBootstrapTokens = [
  "'MOBIUS Isolated Local Agent'",
  "worktree add --detach $deployment origin/main",
  "git -C $deployment reset --hard origin/main",
  "Copy-DirectoryContents $primaryData $deploymentData",
  "Copy-Item -Force -Path $primaryEnv -Destination $runtimeEnv",
  "Stop-ScheduledTask -TaskName 'MOBIUS Local Agent'",
  "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\"",
  "Start-Sleep -Seconds 3",
  'Primary checkout preserved:',
  '-DeploymentRoot $deployment',
];
for (const token of requiredBootstrapTokens) {
  if (!bootstrap.includes(token)) throw new Error(`Missing bootstrap safety contract: ${token}`);
}

if (bootstrap.includes('git -C $repo pull') || bootstrap.includes('git -C $repo reset')) {
  throw new Error('Bootstrap must never mutate the primary checkout.');
}

const bootstrapDataSeed = /if \(\$createdDeployment -and \(Test-Path \$primaryData\)\) \{\s+Copy-DirectoryContents \$primaryData \$deploymentData\s+\}/s;
if (!bootstrapDataSeed.test(bootstrap)) {
  throw new Error('Bootstrap must seed primary data only when creating a new isolated worktree.');
}
if (bootstrap.includes('& robocopy $primaryData $deploymentData')) {
  throw new Error('Bootstrap must not directly overlay primary project data onto an existing runtime.');
}
const bootstrapRuntimePreservation = /Preserve-RuntimeData\s+try \{\s+& git -C \$deployment reset --hard origin\/main[\s\S]*?\} finally \{\s+Restore-RuntimeData\s+\}/;
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
