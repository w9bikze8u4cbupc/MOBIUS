[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\mobius-games-tutorial-generator',
    [ValidateRange(30, 3600)]
    [int]$IntervalSeconds = 90
)

$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath($RepoRoot)
$agent = Join-Path $repo 'scripts\mobius-local-agent.ps1'
$taskName = 'MOBIUS Local Agent'
$logDir = Join-Path $repo 'data\logs'
$statusPath = Join-Path $logDir 'mobius-local-agent.status.json'

if (-not (Test-Path (Join-Path $repo '.git'))) {
    throw "MOBIUS repository not found: $repo"
}
if (-not (Test-Path $agent)) {
    throw "MOBIUS local agent not found: $agent. Run git pull origin main first."
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$powerShell = Join-Path $PSHOME 'powershell.exe'
if (-not (Test-Path $powerShell)) { $powerShell = 'powershell.exe' }

$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$agent`" -Mode Watch -RepoRoot `"$repo`" -IntervalSeconds $IntervalSeconds"
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Safely updates, builds and restarts the local MOBIUS API when origin/main advances.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

$deadline = (Get-Date).AddSeconds(30)
do {
    Start-Sleep -Seconds 2
    if (Test-Path $statusPath) {
        $status = Get-Content -Path $statusPath -Raw | ConvertFrom-Json
        if ($status.state -in @('ready', 'waiting_for_clean_tree', 'error')) { break }
    }
} while ((Get-Date) -lt $deadline)

if (-not $status) {
    throw "The agent did not create a status file within 30 seconds: $statusPath"
}

Write-Host "MOBIUS local agent installed. State: $($status.state)"
Write-Host "Status: $statusPath"
Write-Host "Log: $(Join-Path $logDir 'mobius-local-agent.log')"
Write-Host "The agent now checks origin/main every $IntervalSeconds seconds and safely deploys clean fast-forward updates."
