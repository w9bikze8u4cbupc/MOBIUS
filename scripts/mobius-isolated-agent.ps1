[CmdletBinding()]
param(
    [ValidateSet('Watch', 'Sync', 'Status')]
    [string]$Mode = 'Watch',
    [string]$RepoRoot = 'C:\mobius-games-tutorial-generator',
    [string]$DeploymentRoot = 'C:\mobius-games-tutorial-generator-runtime',
    [ValidateRange(30, 3600)]
    [int]$IntervalSeconds = 90,
    [switch]$ForceBuild
)

$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath($RepoRoot)
$deployment = [System.IO.Path]::GetFullPath($DeploymentRoot)
$controlLogDir = Join-Path $repo 'data\logs'
$statusPath = Join-Path $controlLogDir 'mobius-isolated-agent.status.json'
$agentLog = Join-Path $controlLogDir 'mobius-isolated-agent.log'
$serverLogDir = Join-Path $deployment 'data\logs'
$serverOutLog = Join-Path $serverLogDir 'mobius-server.out.log'
$serverErrLog = Join-Path $serverLogDir 'mobius-server.err.log'
$runtimeDataBackup = Join-Path (Split-Path $deployment -Parent) 'mobius-games-tutorial-generator-runtime-data'
$mutexName = 'Local\MOBIUS_Isolated_Agent_v1'

function Write-AgentLog {
    param([string]$Level, [string]$Message)
    New-Item -ItemType Directory -Force -Path $controlLogDir | Out-Null
    $line = "$(Get-Date -Format 'o') [$Level] $Message"
    Add-Content -Path $agentLog -Value $line -Encoding utf8
    Write-Host $line
}

function Write-AgentStatus {
    param([string]$State, [string]$Message, [string]$Commit = $null)
    New-Item -ItemType Directory -Force -Path $controlLogDir | Out-Null
    [ordered]@{
        updatedAt = (Get-Date).ToUniversalTime().ToString('o')
        state = $State
        message = $Message
        commit = $Commit
        repoRoot = $repo
        deploymentRoot = $deployment
        intervalSeconds = $IntervalSeconds
    } | ConvertTo-Json | Set-Content -Path $statusPath -Encoding utf8
}

function Invoke-Git {
    param([string]$Directory, [string[]]$Arguments)
    # Git writes ordinary fetch progress to stderr. Capture it without letting
    # PowerShell's ErrorActionPreference turn a successful fetch into an exception.
    $savedErrorActionPreference = $ErrorActionPreference
    $exitCode = 1
    try {
        $ErrorActionPreference = 'Continue'
        $output = & git -C $Directory @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedErrorActionPreference
    }
    if ($exitCode -ne 0) {
        throw "git -C $Directory $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
    }
    return @($output)
}

function Get-MobiusApiProcesses {
    return @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match '(^|\s)src[\\/]api[\\/]index\.js(\s|$)' })
}

function Test-MobiusHttp {
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:5001/' -UseBasicParsing -TimeoutSec 4
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Stop-MobiusApi {
    foreach ($process in Get-MobiusApiProcesses) {
        Write-AgentLog 'INFO' "Stopping MOBIUS API PID $($process.ProcessId) for isolated deployment."
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    }
}

function Start-MobiusApi {
    $running = Get-MobiusApiProcesses
    if ($running.Count -gt 0 -and (Test-MobiusHttp)) { return }
    foreach ($process in $running) { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop }

    New-Item -ItemType Directory -Force -Path $serverLogDir | Out-Null
    $process = Start-Process -FilePath 'node' `
        -ArgumentList 'src/api/index.js' `
        -WorkingDirectory $deployment `
        -RedirectStandardOutput $serverOutLog `
        -RedirectStandardError $serverErrLog `
        -PassThru
    for ($attempt = 1; $attempt -le 20; $attempt++) {
        Start-Sleep -Seconds 2
        if (Test-MobiusHttp) {
            Write-AgentLog 'INFO' "MOBIUS isolated API ready on port 5001 (PID $($process.Id))."
            return
        }
    }
    throw "MOBIUS isolated API failed its HTTP readiness check. Inspect $serverErrLog"
}

function Copy-DirectoryContents {
    param([string]$Source, [string]$Destination)
    if (-not (Test-Path $Source)) { return }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    & robocopy $Source $Destination /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "robocopy failed with exit code $LASTEXITCODE" }
}

function Ensure-IsolatedWorktree {
    if (-not (Test-Path (Join-Path $repo '.git'))) { throw "MOBIUS repository not found: $repo" }
    Invoke-Git $repo @('fetch', 'origin', 'main') | Out-Null
    if (-not (Test-Path (Join-Path $deployment '.git'))) {
        if (Test-Path $deployment) {
            $contents = Get-ChildItem -Force -Path $deployment -ErrorAction SilentlyContinue
            if ($contents) { throw "Deployment directory exists but is not a MOBIUS worktree: $deployment" }
        }
        Write-AgentLog 'INFO' "Creating isolated deployment worktree at $deployment."
        Invoke-Git $repo @('worktree', 'add', '--detach', $deployment, 'origin/main') | Out-Null
        Copy-DirectoryContents (Join-Path $repo 'data') (Join-Path $deployment 'data')
    }
}

function Sync-LocalConfiguration {
    $primaryEnv = Join-Path $repo '.env'
    $runtimeEnv = Join-Path $deployment '.env'
    if (Test-Path $primaryEnv) {
        Copy-Item -Force -Path $primaryEnv -Destination $runtimeEnv
        Write-AgentLog 'INFO' 'Copied local MOBIUS runtime configuration into the isolated deployment.'
    }
}

function Preserve-RuntimeData {
    if (Test-Path (Join-Path $deployment 'data')) {
        Remove-Item -Recurse -Force $runtimeDataBackup -ErrorAction SilentlyContinue
        Copy-DirectoryContents (Join-Path $deployment 'data') $runtimeDataBackup
    }
}

function Restore-RuntimeData {
    if (Test-Path $runtimeDataBackup) {
        Copy-DirectoryContents $runtimeDataBackup (Join-Path $deployment 'data')
        Remove-Item -Recurse -Force $runtimeDataBackup -ErrorAction SilentlyContinue
    }
}

function Install-RootDependenciesIfNeeded {
    param([string]$PreviousCommit, [string]$TargetCommit)
    $nodeModules = Join-Path $deployment 'node_modules'
    $dependencyFilesChanged = $PreviousCommit -and $TargetCommit -and @(
        Invoke-Git $deployment @('diff', '--name-only', $PreviousCommit, $TargetCommit, '--', 'package.json', 'package-lock.json')
    ).Count -gt 0
    if (-not (Test-Path $nodeModules) -or $dependencyFilesChanged) {
        Write-AgentLog 'INFO' 'Installing isolated server dependencies.'
        Push-Location $deployment
        try {
            & npm ci --ignore-scripts
            if ($LASTEXITCODE -ne 0) { throw 'Server dependency installation failed.' }
        } finally { Pop-Location }
    }
}

function Install-ClientDependenciesIfNeeded {
    param([string]$PreviousCommit, [string]$TargetCommit)
    $clientDir = Join-Path $deployment 'client'
    $nodeModules = Join-Path $clientDir 'node_modules'
    $dependencyFilesChanged = $PreviousCommit -and $TargetCommit -and @(
        Invoke-Git $deployment @('diff', '--name-only', $PreviousCommit, $TargetCommit, '--', 'client/package.json', 'client/package-lock.json')
    ).Count -gt 0
    if (-not (Test-Path $nodeModules) -or $dependencyFilesChanged) {
        Write-AgentLog 'INFO' 'Installing isolated client dependencies.'
        Push-Location $clientDir
        try {
            & npm ci --ignore-scripts
            if ($LASTEXITCODE -ne 0) { throw 'Client dependency installation failed.' }
        } finally { Pop-Location }
    }
}

function Invoke-IsolatedDeployment {
    param([switch]$ForceBuild)
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is required but was not found in PATH.' }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required but was not found in PATH.' }

    Ensure-IsolatedWorktree
    Invoke-Git $repo @('fetch', 'origin', 'main') | Out-Null
    $current = (Invoke-Git $deployment @('rev-parse', 'HEAD') | Select-Object -First 1).Trim()
    $target = (Invoke-Git $repo @('rev-parse', 'origin/main') | Select-Object -First 1).Trim()
    if ($current -eq $target -and -not $ForceBuild) {
        Start-MobiusApi
        Write-AgentStatus 'ready' 'MOBIUS isolated deployment is current and responding on port 5001.' $current
        return $false
    }

    $operation = if ($current -eq $target) { 'Rebuilding current isolated revision' } else { "Updating isolated deployment from $current to $target" }
    Write-AgentStatus 'updating' "$operation." $target
    Write-AgentLog 'INFO' $operation
    Stop-MobiusApi
    Preserve-RuntimeData
    try {
        Invoke-Git $deployment @('reset', '--hard', $target) | Out-Null
        Invoke-Git $deployment @('clean', '-fdx', '-e', 'data/', '-e', '.env') | Out-Null
    } finally {
        Restore-RuntimeData
    }

    Sync-LocalConfiguration
    Install-RootDependenciesIfNeeded -PreviousCommit $current -TargetCommit $target
    Install-ClientDependenciesIfNeeded -PreviousCommit $current -TargetCommit $target
    $clientDir = Join-Path $deployment 'client'
    Write-AgentLog 'INFO' 'Building the isolated MOBIUS client.'
    Push-Location $clientDir
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Client build failed.' }
    } finally { Pop-Location }

    Start-MobiusApi
    Write-AgentStatus 'ready' 'MOBIUS isolated deployment applied and API is responding on port 5001.' $target
    Write-AgentLog 'INFO' "Isolated deployment complete at $target."
    return $true
}

New-Item -ItemType Directory -Force -Path $controlLogDir | Out-Null
$mutex = [System.Threading.Mutex]::new($false, $mutexName)
$lockHeld = $false
try {
    try { $lockHeld = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $lockHeld = $true }
    if (-not $lockHeld) { Write-AgentLog 'INFO' 'Another isolated MOBIUS agent is already active; exiting safely.'; exit 0 }
    if ($Mode -eq 'Status') { if (Test-Path $statusPath) { Get-Content -Path $statusPath -Raw } else { Write-AgentStatus 'unknown' 'The isolated agent has not recorded a status yet.' }; exit 0 }
    if ($Mode -eq 'Sync') { [void](Invoke-IsolatedDeployment -ForceBuild:$ForceBuild); exit 0 }

    Write-AgentLog 'INFO' "MOBIUS isolated agent started; checking origin/main every $IntervalSeconds seconds."
    while ($true) {
        try { [void](Invoke-IsolatedDeployment) } catch {
            Write-AgentStatus 'error' $_.Exception.Message
            Write-AgentLog 'ERROR' $_.Exception.Message
        }
        Start-Sleep -Seconds $IntervalSeconds
    }
} finally {
    if ($lockHeld) { $mutex.ReleaseMutex() | Out-Null }
    $mutex.Dispose()
}
