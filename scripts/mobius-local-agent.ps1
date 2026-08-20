[CmdletBinding()]
param(
    [ValidateSet('Watch', 'Sync', 'Status')]
    [string]$Mode = 'Watch',
    [string]$RepoRoot = 'C:\mobius-games-tutorial-generator',
    [ValidateRange(30, 3600)]
    [int]$IntervalSeconds = 90
)

$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath($RepoRoot)
$logDir = Join-Path $repo 'data\logs'
$statusPath = Join-Path $logDir 'mobius-local-agent.status.json'
$agentLog = Join-Path $logDir 'mobius-local-agent.log'
$serverOutLog = Join-Path $logDir 'mobius-server.out.log'
$serverErrLog = Join-Path $logDir 'mobius-server.err.log'
$mutexName = 'Local\MOBIUS_Local_Agent_v1'

function Write-AgentLog {
    param([string]$Level, [string]$Message)
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $line = "$(Get-Date -Format 'o') [$Level] $Message"
    Add-Content -Path $agentLog -Value $line -Encoding utf8
    Write-Host $line
}

function Write-AgentStatus {
    param(
        [string]$State,
        [string]$Message,
        [string]$Commit = $null
    )
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    [ordered]@{
        updatedAt = (Get-Date).ToUniversalTime().ToString('o')
        state = $State
        message = $Message
        commit = $Commit
        repoRoot = $repo
        intervalSeconds = $IntervalSeconds
    } | ConvertTo-Json | Set-Content -Path $statusPath -Encoding utf8
}

function Invoke-Git {
    param([string[]]$Arguments)
    $output = & git -C $repo @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
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

function Start-MobiusApi {
    $running = Get-MobiusApiProcesses
    if ($running.Count -gt 0 -and (Test-MobiusHttp)) {
        return
    }
    foreach ($process in $running) {
        Write-AgentLog 'WARN' "Stopping stale MOBIUS API PID $($process.ProcessId)."
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    }

    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $process = Start-Process -FilePath 'node' `
        -ArgumentList 'src/api/index.js' `
        -WorkingDirectory $repo `
        -RedirectStandardOutput $serverOutLog `
        -RedirectStandardError $serverErrLog `
        -PassThru

    for ($attempt = 1; $attempt -le 15; $attempt++) {
        Start-Sleep -Seconds 2
        if (Test-MobiusHttp) {
            Write-AgentLog 'INFO' "MOBIUS API ready on port 5001 (PID $($process.Id))."
            return
        }
    }
    throw "MOBIUS API failed its HTTP readiness check. Inspect $serverErrLog"
}

function Stop-MobiusApi {
    foreach ($process in Get-MobiusApiProcesses) {
        Write-AgentLog 'INFO' "Stopping MOBIUS API PID $($process.ProcessId) for safe deployment."
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    }
}

function Invoke-MobiusDeployment {
    if (-not (Test-Path (Join-Path $repo '.git'))) {
        throw "MOBIUS repository not found: $repo"
    }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw 'Git is required but was not found in PATH.'
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Node.js is required but was not found in PATH.'
    }

    $dirty = Invoke-Git @('status', '--porcelain')
    if ($dirty.Count -gt 0) {
        Write-AgentStatus 'waiting_for_clean_tree' 'Local source changes detected; automatic deployment is paused to protect them.'
        Write-AgentLog 'WARN' 'Local source changes detected; skipping automatic deployment to protect them.'
        return $false
    }

    Invoke-Git @('fetch', 'origin', 'main') | Out-Null
    $head = (Invoke-Git @('rev-parse', 'HEAD') | Select-Object -First 1).Trim()
    $remote = (Invoke-Git @('rev-parse', 'origin/main') | Select-Object -First 1).Trim()
    if ($head -eq $remote) {
        Start-MobiusApi
        Write-AgentStatus 'ready' 'MOBIUS is current and responding on port 5001.' $head
        return $false
    }

    Write-AgentStatus 'updating' "Updating MOBIUS from $head to $remote." $remote
    Write-AgentLog 'INFO' "Applying fast-forward update $head -> $remote."
    Stop-MobiusApi
    Invoke-Git @('pull', '--ff-only', 'origin', 'main') | Out-Null

    $clientDir = Join-Path $repo 'client'
    if (-not (Test-Path (Join-Path $clientDir 'package.json'))) {
        throw "Client package manifest not found: $clientDir\package.json"
    }
    Write-AgentLog 'INFO' 'Building the MOBIUS client.'
    Push-Location $clientDir
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Client build failed.' }
    } finally {
        Pop-Location
    }

    Start-MobiusApi
    $applied = (Invoke-Git @('rev-parse', 'HEAD') | Select-Object -First 1).Trim()
    Write-AgentStatus 'ready' 'MOBIUS update applied and API is responding on port 5001.' $applied
    Write-AgentLog 'INFO' "Deployment complete at $applied."
    return $true
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$mutex = [System.Threading.Mutex]::new($false, $mutexName)
$lockHeld = $false
try {
    try { $lockHeld = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $lockHeld = $true }
    if (-not $lockHeld) {
        Write-AgentLog 'INFO' 'Another MOBIUS local agent is already active; exiting safely.'
        exit 0
    }

    if ($Mode -eq 'Status') {
        if (Test-Path $statusPath) { Get-Content -Path $statusPath -Raw } else { Write-AgentStatus 'unknown' 'The local agent has not recorded a status yet.' }
        exit 0
    }

    if ($Mode -eq 'Sync') {
        [void](Invoke-MobiusDeployment)
        exit 0
    }

    Write-AgentLog 'INFO' "MOBIUS local agent started; checking origin/main every $IntervalSeconds seconds."
    while ($true) {
        try {
            [void](Invoke-MobiusDeployment)
        } catch {
            Write-AgentStatus 'error' $_.Exception.Message
            Write-AgentLog 'ERROR' $_.Exception.Message
        }
        Start-Sleep -Seconds $IntervalSeconds
    }
} finally {
    if ($lockHeld) { $mutex.ReleaseMutex() | Out-Null }
    $mutex.Dispose()
}
