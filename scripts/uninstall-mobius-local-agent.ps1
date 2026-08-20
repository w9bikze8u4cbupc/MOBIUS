[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\mobius-games-tutorial-generator'
)

$ErrorActionPreference = 'Stop'
$taskName = 'MOBIUS Local Agent'
$repo = [System.IO.Path]::GetFullPath($RepoRoot)
$agent = Join-Path $repo 'scripts\mobius-local-agent.ps1'

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
    if ($task.State -eq 'Running') { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue }
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed scheduled task: $taskName"
} else {
    Write-Host "No scheduled task found: $taskName"
}

Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$agent*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
