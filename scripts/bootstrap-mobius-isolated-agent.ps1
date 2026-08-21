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

# Stop every MOBIUS API and agent before cleaning the isolated worktree.
# Native Sharp DLLs remain locked until their owning Node process exits.
Stop-ScheduledTask -TaskName 'MOBIUS Local Agent' -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match '(^|\s)src[\\/]api[\\/]index\.js(\s|$)' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 3

$primaryData = Join-Path $repo 'data'
$deploymentData = Join-Path $deployment 'data'
$runtimeDataBackup = Join-Path (Split-Path $deployment -Parent) 'mobius-games-tutorial-generator-runtime-bootstrap-data'

function Copy-DirectoryContents {
    param([string]$Source, [string]$Destination)
    if (-not (Test-Path $Source)) { return }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    & robocopy $Source $Destination /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "Unable to copy runtime project data (robocopy exit code $LASTEXITCODE)." }
}

function Preserve-RuntimeData {
    if (Test-Path $deploymentData) {
        Remove-Item -Recurse -Force $runtimeDataBackup -ErrorAction SilentlyContinue
        Copy-DirectoryContents $deploymentData $runtimeDataBackup
    }
}

function Restore-RuntimeData {
    if (Test-Path $runtimeDataBackup) {
        Copy-DirectoryContents $runtimeDataBackup $deploymentData
        Remove-Item -Recurse -Force $runtimeDataBackup -ErrorAction SilentlyContinue
    }
}

$createdDeployment = $false
if (-not (Test-Path (Join-Path $deployment '.git'))) {
    if (Test-Path $deployment) {
        $contents = Get-ChildItem -Force -Path $deployment -ErrorAction SilentlyContinue
        if ($contents) { throw "Deployment directory exists but is not a MOBIUS worktree: $deployment" }
    }
    & git -C $repo worktree add --detach $deployment origin/main
    if ($LASTEXITCODE -ne 0) { throw 'Unable to create the isolated MOBIUS worktree.' }
    $createdDeployment = $true
} else {
    # A runtime can modify tracked metadata such as data/images.json. Preserve the
    # full canonical data tree before reset so no primary or Git copy can replace it.
    Preserve-RuntimeData
    try {
        & git -C $deployment reset --hard origin/main
        if ($LASTEXITCODE -ne 0) { throw 'Unable to refresh the isolated MOBIUS worktree.' }
        & git -C $deployment clean -fdx -e data/ -e src/api/uploads/
        if ($LASTEXITCODE -ne 0) { throw 'Unable to clean stale build artifacts from the isolated worktree.' }
    } finally {
        Restore-RuntimeData
    }
}

# Runtime data is canonical after initialization. Seed it from the primary checkout
# only when creating a brand-new isolated worktree; never overlay an existing runtime.
if ($createdDeployment -and (Test-Path $primaryData)) {
    Copy-DirectoryContents $primaryData $deploymentData
}

$primaryEnv = Join-Path $repo '.env'
$runtimeEnv = Join-Path $deployment '.env'
if (Test-Path $primaryEnv) {
    Copy-Item -Force -Path $primaryEnv -Destination $runtimeEnv
}

if (-not (Test-Path $agentPath)) { throw "Isolated agent script not found: $agentPath" }

Unregister-ScheduledTask -TaskName 'MOBIUS Local Agent' -Confirm:$false -ErrorAction SilentlyContinue
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
