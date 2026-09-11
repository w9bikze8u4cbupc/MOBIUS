[CmdletBinding()]
param(
    [ValidateSet('Watch', 'Sync', 'Align', 'Status')]
    [string]$Mode = 'Watch',
    [string]$RepoRoot = 'C:\mobius-games-tutorial-generator',
    [string]$DeploymentRoot = 'C:\mobius-games-tutorial-generator-runtime',
    [ValidateRange(30, 3600)]
    [int]$IntervalSeconds = 90,
    [string]$BaseUrl = 'http://127.0.0.1:5001',
    [string]$TargetRevision = '',
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
$ownershipPath = Join-Path $serverLogDir 'mobius-runtime-ownership.json'
$alignmentRequestPath = Join-Path $serverLogDir 'mobius-runtime-alignment-request.json'
$runtimeDataBackup = Join-Path (Split-Path $deployment -Parent) 'mobius-games-tutorial-generator-runtime-data'
$mutexName = 'Local\MOBIUS_Isolated_Agent_v1'
$runtimeUri = [Uri]$BaseUrl
$runtimePort = $runtimeUri.Port
$requiredCapabilityContract = 'mobius-runtime-capabilities-v1'

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

function Get-PortOwnerProcess {
    $listener = @(Get-NetTCPConnection -State Listen -LocalPort $runtimePort -ErrorAction SilentlyContinue)
    if ($listener.Count -eq 0) { return $null }
    $pids = @($listener | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($pids.Count -ne 1) { throw "Ambiguous process ownership on runtime port $runtimePort." }
    return Get-CimInstance Win32_Process -Filter "ProcessId = $($pids[0])" -ErrorAction SilentlyContinue
}

function Resolve-NpmCommand {
    $candidates = @(Get-Command npm.cmd -All -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -Unique)
    foreach ($candidate in $candidates) {
        $savedErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $null = & $candidate --version 2>&1
            if ($LASTEXITCODE -eq 0) { return $candidate }
        } finally { $ErrorActionPreference = $savedErrorActionPreference }
    }
    throw 'A functional npm.cmd is required but every discovered npm command failed its version probe.'
}

function Get-MobiusCapabilities {
    try {
        return Invoke-RestMethod -Uri "$($BaseUrl.TrimEnd('/'))/api/runtime/capabilities" -TimeoutSec 4
    } catch {
        return $null
    }
}

function Read-RuntimeOwnership {
    if (-not (Test-Path $ownershipPath)) { return $null }
    try { return Get-Content -Raw -LiteralPath $ownershipPath | ConvertFrom-Json } catch { return $null }
}

function Assert-OwnedRuntimeProcess {
    $process = Get-PortOwnerProcess
    if (-not $process) { return $null }
    $ownership = Read-RuntimeOwnership
    $capabilities = Get-MobiusCapabilities
    $isNodeApi = $process.Name -eq 'node.exe' -and $process.CommandLine -match '(^|\s)src[\\/]api[\\/]index\.js(\s|$)'
    $owned = $ownership -and $capabilities -and
        $capabilities.contract -eq $requiredCapabilityContract -and
        $capabilities.ownership.manager -eq 'mobius-isolated-agent-v2' -and
        $capabilities.ownership.tokenFingerprint -eq $ownership.tokenFingerprint -and
        [int]$ownership.pid -eq [int]$process.ProcessId
    if (-not $isNodeApi -or -not $owned) {
        throw "Runtime port $runtimePort is occupied by a process whose MOBIUS ownership is ambiguous; refusing destructive restart."
    }
    return $process
}

function Stop-MobiusApi {
    $process = Assert-OwnedRuntimeProcess
    if ($process) {
        Write-AgentLog 'INFO' "Stopping owned MOBIUS API PID $($process.ProcessId) for isolated deployment."
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
        for ($attempt = 1; $attempt -le 20 -and (Get-PortOwnerProcess); $attempt++) { Start-Sleep -Milliseconds 250 }
        if (Get-PortOwnerProcess) { throw "Owned MOBIUS API did not release port $runtimePort." }
        Remove-Item -LiteralPath $ownershipPath -Force -ErrorAction SilentlyContinue
    }
}

function Start-MobiusApi {
    param([string]$ExpectedCommit)
    $existing = Get-PortOwnerProcess
    if ($existing) {
        [void](Assert-OwnedRuntimeProcess)
        $capabilities = Get-MobiusCapabilities
        if ($capabilities.runtimeIdentity -eq $ExpectedCommit) { return }
        Stop-MobiusApi
    }

    New-Item -ItemType Directory -Force -Path $serverLogDir | Out-Null
    $token = [Guid]::NewGuid().ToString('N')
    $tokenBytes = [Text.Encoding]::UTF8.GetBytes($token)
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $tokenFingerprint = ([BitConverter]::ToString($sha256.ComputeHash($tokenBytes))).Replace('-', '').ToLowerInvariant()
    } finally { $sha256.Dispose() }
    $saved = @{
        MOBIUS_RUNTIME_MANAGER = $env:MOBIUS_RUNTIME_MANAGER
        MOBIUS_RUNTIME_DEPLOYMENT_ROOT = $env:MOBIUS_RUNTIME_DEPLOYMENT_ROOT
        MOBIUS_RUNTIME_OWNERSHIP_TOKEN = $env:MOBIUS_RUNTIME_OWNERSHIP_TOKEN
        MOBIUS_BUILD_SHA = $env:MOBIUS_BUILD_SHA
    }
    try {
        $env:MOBIUS_RUNTIME_MANAGER = 'mobius-isolated-agent-v2'
        $env:MOBIUS_RUNTIME_DEPLOYMENT_ROOT = $deployment
        $env:MOBIUS_RUNTIME_OWNERSHIP_TOKEN = $token
        $env:MOBIUS_BUILD_SHA = $ExpectedCommit
        $process = Start-Process -FilePath 'node' `
            -ArgumentList 'src/api/index.js' `
            -WorkingDirectory $deployment `
            -RedirectStandardOutput $serverOutLog `
            -RedirectStandardError $serverErrLog `
            -WindowStyle Hidden `
            -PassThru
    } finally {
        foreach ($name in $saved.Keys) {
            if ($null -eq $saved[$name]) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue } else { Set-Item "Env:$name" $saved[$name] }
        }
    }
    [ordered]@{ contract = 'mobius-runtime-ownership-v1'; pid = $process.Id; deploymentRoot = $deployment; commit = $ExpectedCommit; tokenFingerprint = $tokenFingerprint; startedAt = (Get-Date).ToUniversalTime().ToString('o') } |
        ConvertTo-Json | Set-Content -LiteralPath $ownershipPath -Encoding utf8
    for ($attempt = 1; $attempt -le 20; $attempt++) {
        Start-Sleep -Seconds 2
        $capabilities = Get-MobiusCapabilities
        if ($capabilities -and $capabilities.runtimeIdentity -eq $ExpectedCommit -and $capabilities.ownership.tokenFingerprint -eq $tokenFingerprint) {
            Write-AgentLog 'INFO' "MOBIUS isolated API ready on port $runtimePort (PID $($process.Id), build $ExpectedCommit)."
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
    if (-not $TargetRevision -and -not (Test-Path $alignmentRequestPath)) {
        Invoke-Git $repo @('fetch', 'origin', 'main') | Out-Null
    }
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

function Resolve-DeploymentTarget {
    if ($TargetRevision) {
        Invoke-Git $repo @('cat-file', '-e', "$TargetRevision^{commit}") | Out-Null
        return (Invoke-Git $repo @('rev-parse', $TargetRevision) | Select-Object -First 1).Trim()
    }
    if (Test-Path $alignmentRequestPath) {
        try {
            $request = Get-Content -Raw -LiteralPath $alignmentRequestPath | ConvertFrom-Json
            if ($request.targetRevision) {
                Invoke-Git $repo @('cat-file', '-e', "$($request.targetRevision)^{commit}") | Out-Null
                return (Invoke-Git $repo @('rev-parse', $request.targetRevision) | Select-Object -First 1).Trim()
            }
        } catch { Write-AgentLog 'WARN' "Ignoring invalid runtime alignment request: $($_.Exception.Message)" }
    }
    return (Invoke-Git $repo @('rev-parse', 'origin/main') | Select-Object -First 1).Trim()
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
    $expressPackage = Join-Path $deployment 'node_modules\express\package.json'
    # ffmpeg-static downloads its platform-specific executable through its own
    # package lifecycle. Keep npm ci script-free, then run only that audited
    # package's installer when the executable is missing.
    $portableFfmpeg = Join-Path $deployment 'node_modules\ffmpeg-static\ffmpeg.exe'
    $dependencyFilesChanged = $PreviousCommit -and $TargetCommit -and @(
        Invoke-Git $deployment @('diff', '--name-only', $PreviousCommit, $TargetCommit, '--', 'package.json', 'package-lock.json')
    ).Count -gt 0
    $needsPortableFfmpeg = -not (Test-Path $portableFfmpeg)
    if (-not (Test-Path $nodeModules) -or -not (Test-Path $expressPackage) -or $dependencyFilesChanged -or $needsPortableFfmpeg) {
        Write-AgentLog 'INFO' 'Installing isolated server dependencies.'
        Push-Location $deployment
        try {
            $npmCommand = Resolve-NpmCommand
            & $npmCommand ci --ignore-scripts
            if ($LASTEXITCODE -ne 0) { throw 'Server dependency installation failed.' }
            if (-not (Test-Path $portableFfmpeg)) {
                Write-AgentLog 'INFO' 'Installing the required portable FFmpeg binary.'
                & $npmCommand rebuild ffmpeg-static --foreground-scripts
                if ($LASTEXITCODE -ne 0 -or -not (Test-Path $portableFfmpeg)) { throw 'Portable FFmpeg installation failed.' }
            }
        } finally { Pop-Location }
    }
}

function Install-ClientDependenciesIfNeeded {
    param([string]$PreviousCommit, [string]$TargetCommit)
    $clientDir = Join-Path $deployment 'client'
    $nodeModules = Join-Path $clientDir 'node_modules'
    $reactScripts = Join-Path $clientDir 'node_modules\.bin\react-scripts.cmd'
    $dependencyFilesChanged = $PreviousCommit -and $TargetCommit -and @(
        Invoke-Git $deployment @('diff', '--name-only', $PreviousCommit, $TargetCommit, '--', 'client/package.json', 'client/package-lock.json')
    ).Count -gt 0
    if (-not (Test-Path $nodeModules) -or -not (Test-Path $reactScripts) -or $dependencyFilesChanged) {
        Write-AgentLog 'INFO' 'Installing isolated client dependencies.'
        Push-Location $clientDir
        try {
            $npmCommand = Resolve-NpmCommand
            & $npmCommand ci --ignore-scripts
            if ($LASTEXITCODE -ne 0) { throw 'Client dependency installation failed.' }
        } finally { Pop-Location }
    }
}

function Invoke-IsolatedDeployment {
    param([switch]$ForceBuild)
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is required but was not found in PATH.' }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required but was not found in PATH.' }

    Ensure-IsolatedWorktree
    if (-not $TargetRevision -and -not (Test-Path $alignmentRequestPath)) {
        Invoke-Git $repo @('fetch', 'origin', 'main') | Out-Null
    }
    $current = (Invoke-Git $deployment @('rev-parse', 'HEAD') | Select-Object -First 1).Trim()
    $target = Resolve-DeploymentTarget
    if ($current -eq $target -and -not $ForceBuild) {
        Start-MobiusApi -ExpectedCommit $target
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
        Invoke-Git $deployment @('clean', '-fdx', '-e', 'data/', '-e', 'src/api/uploads/', '-e', '.env') | Out-Null
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
        $npmCommand = Resolve-NpmCommand
        & $npmCommand run build
        if ($LASTEXITCODE -ne 0) { throw 'Client build failed.' }
    } finally { Pop-Location }

    Start-MobiusApi -ExpectedCommit $target
    Write-AgentStatus 'ready' 'MOBIUS isolated deployment applied and API is responding on port 5001.' $target
    Write-AgentLog 'INFO' "Isolated deployment complete at $target."
    return $true
}

New-Item -ItemType Directory -Force -Path $controlLogDir | Out-Null
$mutex = [System.Threading.Mutex]::new($false, $mutexName)
function Invoke-WithAgentLock {
    param([scriptblock]$Action, [int]$WaitMilliseconds = 0)
    $held = $false
    try {
        try { $held = $mutex.WaitOne($WaitMilliseconds) } catch [System.Threading.AbandonedMutexException] { $held = $true }
        if (-not $held) { throw 'Another isolated MOBIUS deployment operation is active.' }
        & $Action
    } finally { if ($held) { $mutex.ReleaseMutex() | Out-Null } }
}

try {
    if ($Mode -eq 'Status') { if (Test-Path $statusPath) { Get-Content -Path $statusPath -Raw } else { Write-AgentStatus 'unknown' 'The isolated agent has not recorded a status yet.' }; exit 0 }
    if ($Mode -eq 'Align') {
        if (-not $TargetRevision) { throw 'Align mode requires -TargetRevision.' }
        New-Item -ItemType Directory -Force -Path $serverLogDir | Out-Null
        [ordered]@{ contract = 'mobius-runtime-alignment-request-v1'; targetRevision = $TargetRevision; requestedAt = (Get-Date).ToUniversalTime().ToString('o') } |
            ConvertTo-Json | Set-Content -LiteralPath $alignmentRequestPath -Encoding utf8
        Invoke-WithAgentLock -WaitMilliseconds 60000 -Action { [void](Invoke-IsolatedDeployment -ForceBuild:$ForceBuild) }
        exit 0
    }
    if ($Mode -eq 'Sync') { Invoke-WithAgentLock -WaitMilliseconds 60000 -Action { [void](Invoke-IsolatedDeployment -ForceBuild:$ForceBuild) }; exit 0 }

    Write-AgentLog 'INFO' "MOBIUS isolated agent started; checking the canonical deployment target every $IntervalSeconds seconds."
    while ($true) {
        try { Invoke-WithAgentLock -Action { [void](Invoke-IsolatedDeployment) } } catch {
            Write-AgentStatus 'error' $_.Exception.Message
            Write-AgentLog 'ERROR' $_.Exception.Message
        }
        Start-Sleep -Seconds $IntervalSeconds
    }
} finally {
    $mutex.Dispose()
}
