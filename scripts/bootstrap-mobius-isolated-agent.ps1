[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\mobius-games-tutorial-generator',
    [string]$DeploymentRoot = 'C:\mobius-games-tutorial-generator-runtime',
    [ValidateRange(30, 3600)]
    [int]$IntervalSeconds = 90
)

$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath($RepoRoot)
$deployment = [System.IO.Path]::GetFullPath($DeploymentRoot)
$taskName = 'MOBIUS Isolated Local Agent'
$agentPath = Join-Path $deployment 'scripts\mobius-isolated-agent.ps1'

if (-not (Test-Path (Join-Path $repo '.git'))) { throw "MOBIUS repository not found: $repo" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is required but was not found in PATH.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required but was not found in PATH.' }

# The primary checkout is never pulled, reset, built, or restarted by this bootstrap.
& git -C $repo fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'Unable to fetch origin/main for isolated deployment.' }

if (-not (Test-Path (Join-Path $deployment '.git'))) {
    if (Test-Path $deployment) {
        $contents = Get-ChildItem -Force -Path $deployment -ErrorAction SilentlyContinue
        if ($contents) { throw "Deployment directory exists but is not a MOBIUS worktree: $deployment" }
    }
    & git -C $repo worktree add --detach $deployment origin/main
    if ($LASTEXITCODE -ne 0) { throw 'Unable to create the isolated MOBIUS worktree.' }
}

if (-not (Test-Path $agentPath)) { throw "Isolated agent script not found: $agentPath" }

Stop-ScheduledTask -TaskName 'MOBIUS Local Agent' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'MOBIUS Local Agent' -Confirm:$false -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$agentPath`" -Mode Watch -RepoRoot `"$repo`" -DeploymentRoot `"$deployment`" -IntervalSeconds $IntervalSeconds"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Safely deploys MOBIUS from an isolated Git worktree without touching the primary checkout.' -Force | Out-Null

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agentPath -Mode Sync -RepoRoot $repo -DeploymentRoot $deployment -IntervalSeconds $IntervalSeconds -ForceBuild
if ($LASTEXITCODE -ne 0) { throw 'The initial isolated MOBIUS deployment failed.' }
Start-ScheduledTask -TaskName $taskName
Write-Host "MOBIUS isolated agent is active. Primary checkout preserved: $repo"
Write-Host "Runtime deployment: $deployment"
Write-Host "Status: $repo\data\logs\mobius-isolated-agent.status.json"
