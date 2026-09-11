[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\mobius-games-tutorial-generator',
    [string]$DeploymentRoot = 'C:\mobius-games-tutorial-generator-runtime',
    [ValidateRange(30, 3600)]
    [int]$IntervalSeconds = 90,
    [string]$BaseUrl = 'http://127.0.0.1:5001',
    [string]$TargetRevision = '',
    [switch]$AdoptLegacyRuntime
)

$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath($RepoRoot)
$deployment = [System.IO.Path]::GetFullPath($DeploymentRoot)
$taskName = 'MOBIUS Isolated Local Agent'
$agentPath = Join-Path $deployment 'scripts\mobius-isolated-agent.ps1'
$runtimeUri = [Uri]$BaseUrl
$runtimePort = $runtimeUri.Port
$ownershipPath = Join-Path $deployment 'data\logs\mobius-runtime-ownership.json'

if (-not (Test-Path (Join-Path $repo '.git'))) { throw "MOBIUS repository not found: $repo" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is required but was not found in PATH.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required but was not found in PATH.' }

# The primary checkout is never pulled, reset, built, or restarted by this bootstrap.
& git -C $repo fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'Unable to fetch origin/main for isolated deployment.' }
$target = if ($TargetRevision) { (& git -C $repo rev-parse $TargetRevision).Trim() } else { (& git -C $repo rev-parse origin/main).Trim() }
if ($LASTEXITCODE -ne 0 -or $target -notmatch '^[a-f0-9]{40}$') { throw "Unable to resolve runtime target revision: $TargetRevision" }

# Stop the canonical agent before changing its isolated worktree. The API is
# stopped only when ownership is proven, or during an explicit one-time legacy
# adoption whose Scheduled Task points at this exact deployment.
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName 'MOBIUS Local Agent' -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $runtimePort -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
    $pids = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($pids.Count -ne 1) { throw "Ambiguous process ownership on runtime port $runtimePort." }
    $apiProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($pids[0])" -ErrorAction Stop
    $isNodeApi = $apiProcess.Name -eq 'node.exe' -and $apiProcess.CommandLine -match '(^|\s)src[\\/]api[\\/]index\.js(\s|$)'
    $owned = $false
    try {
        $capabilities = Invoke-RestMethod -Uri "$($BaseUrl.TrimEnd('/'))/api/runtime/capabilities" -TimeoutSec 4
        if (Test-Path $ownershipPath) {
            $ownership = Get-Content -Raw -LiteralPath $ownershipPath | ConvertFrom-Json
            $owned = $capabilities.contract -eq 'mobius-runtime-capabilities-v1' -and
                $capabilities.ownership.manager -eq 'mobius-isolated-agent-v2' -and
                $capabilities.ownership.tokenFingerprint -eq $ownership.tokenFingerprint -and
                [int]$ownership.pid -eq [int]$apiProcess.ProcessId
        }
    } catch { $owned = $false }
    $legacyTaskOwnsDeployment = $existingTask -and
        ($existingTask.Actions | Where-Object { $_.Execute -match 'powershell' -and $_.Arguments -like "*$deployment*mobius-isolated-agent.ps1*" })
    if (-not $isNodeApi -or (-not $owned -and -not ($AdoptLegacyRuntime -and $legacyTaskOwnsDeployment))) {
        throw "Runtime port $runtimePort ownership is ambiguous; refusing to stop PID $($apiProcess.ProcessId)."
    }
    Stop-Process -Id $apiProcess.ProcessId -Force -ErrorAction Stop
}
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
    & git -C $repo worktree add --detach $deployment $target
    if ($LASTEXITCODE -ne 0) { throw 'Unable to create the isolated MOBIUS worktree.' }
    $createdDeployment = $true
} else {
    # A runtime can modify tracked metadata such as data/images.json. Preserve the
    # full canonical data tree before reset so no primary or Git copy can replace it.
    Preserve-RuntimeData
    try {
        & git -C $deployment reset --hard $target
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

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$agentPath`" -Mode Watch -RepoRoot `"$repo`" -DeploymentRoot `"$deployment`" -BaseUrl `"$BaseUrl`" -IntervalSeconds $IntervalSeconds"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Safely deploys MOBIUS from an isolated Git worktree without touching the primary checkout.' -Force | Out-Null

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agentPath -Mode Align -RepoRoot $repo -DeploymentRoot $deployment -BaseUrl $BaseUrl -TargetRevision $target -IntervalSeconds $IntervalSeconds -ForceBuild
if ($LASTEXITCODE -ne 0) { throw 'The initial isolated MOBIUS deployment failed.' }
Start-ScheduledTask -TaskName $taskName
Write-Host "MOBIUS isolated agent is active. Primary checkout preserved: $repo"
Write-Host "Runtime deployment: $deployment"
Write-Host "Status: $repo\data\logs\mobius-isolated-agent.status.json"
