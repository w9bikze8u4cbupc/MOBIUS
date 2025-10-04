# Manual CI Health Logger (PowerShell)
# Use this script to manually log CI status during the stabilization period

param(
    [Parameter(Position=0)]
    [string]$Action = "help",
    
    [Parameter(Position=1)]
    [string]$CommitSha,
    
    [Parameter(Position=2)]
    [string]$Description = "Manual check",
    
    [Parameter(Position=3)]
    [int]$Lines = 20
)

# Configuration
$LogDir = "stabilization-logs"
$Date = (Get-Date).ToString("yyyyMMdd")
$Timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$LogFile = "$LogDir\ci-health-$Date.log"

# Expected contexts
$ExpectedContexts = @(
    "build-and-qa (macos-latest)",
    "build-and-qa (ubuntu-latest)", 
    "build-and-qa (windows-latest)",
    "Golden checks (macos-latest)",
    "Golden checks (ubuntu-latest)",
    "Golden checks (windows-latest)"
)

# Ensure log directory exists
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Log-CIStatus {
    param(
        [string]$CommitSha,
        [string]$Description = "Manual check"
    )
    
    if (-not $CommitSha) {
        Write-Host "Usage: Log-CIStatus <commit_sha> [description]" -ForegroundColor Red
        return
    }
    
    Add-Content -Path $LogFile -Value "=== Manual CI Health Check - $Timestamp ==="
    Add-Content -Path $LogFile -Value "Commit: $CommitSha"
    Add-Content -Path $LogFile -Value "Description: $Description"
    Add-Content -Path $LogFile -Value ""
    
    # Check if we have GitHub CLI
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Add-Content -Path $LogFile -Value "WARNING: GitHub CLI not available. Manual status entry only."
        Add-Content -Path $LogFile -Value "Please verify the following contexts manually:"
        foreach ($context in $ExpectedContexts) {
            Add-Content -Path $LogFile -Value "  - $context`: [MANUAL_CHECK_NEEDED]"
        }
        Add-Content -Path $LogFile -Value ""
        return
    }
    
    if (-not $env:GITHUB_TOKEN) {
        Add-Content -Path $LogFile -Value "WARNING: GITHUB_TOKEN not set. Manual status entry only."
        Add-Content -Path $LogFile -Value "Please verify the following contexts manually:"
        foreach ($context in $ExpectedContexts) {
            Add-Content -Path $LogFile -Value "  - $context`: [MANUAL_CHECK_NEEDED]"
        }
        Add-Content -Path $LogFile -Value ""
        return
    }
    
    # Get repository from git remote
    try {
        $RepoUrl = git remote get-url origin 2>$null
        if ($RepoUrl -match "github\.com[:/]([^/]+/[^/]+)(\.git)?") {
            $Repo = $matches[1]
        } else {
            throw "Could not parse repository URL"
        }
    } catch {
        Add-Content -Path $LogFile -Value "ERROR: Could not determine repository. Please run from git repository."
        Write-Host "ERROR: Could not determine repository. Please run from git repository." -ForegroundColor Red
        return
    }
    
    Write-Host "Fetching check runs for commit $CommitSha..." -ForegroundColor Yellow
    
    try {
        $CheckRuns = gh api "repos/$Repo/commits/$CommitSha/check-runs" --jq '.check_runs[] | select(.app.slug == "github-actions") | .name' | Sort-Object
        
        if (-not $CheckRuns) {
            Add-Content -Path $LogFile -Value "WARNING: No check runs found or API error"
            Add-Content -Path $LogFile -Value "Please verify contexts manually"
            Add-Content -Path $LogFile -Value ""
            return
        }
        
        $AllHealthy = $true
        
        # Check each expected context
        foreach ($expected in $ExpectedContexts) {
            if ($CheckRuns -contains $expected) {
                # Get status
                $ContextStatus = gh api "repos/$Repo/commits/$CommitSha/check-runs" --jq ".check_runs[] | select(.name == `"$expected`") | .conclusion"
                
                if ($ContextStatus -eq "success") {
                    Add-Content -Path $LogFile -Value "HEALTHY: $expected - Status: $ContextStatus"
                } else {
                    Add-Content -Path $LogFile -Value "ISSUE: $expected - Status: $ContextStatus"
                    $AllHealthy = $false
                }
            } else {
                Add-Content -Path $LogFile -Value "MISSING: $expected"
                $AllHealthy = $false
            }
        }
        
        # Check for extra contexts
        foreach ($actual in $CheckRuns) {
            if ($actual -notin $ExpectedContexts) {
                Add-Content -Path $LogFile -Value "EXTRA: $actual"
            }
        }
        
        if ($AllHealthy) {
            Add-Content -Path $LogFile -Value "RESULT: All contexts healthy ✅"
            Write-Host "All contexts healthy ✅" -ForegroundColor Green
        } else {
            Add-Content -Path $LogFile -Value "RESULT: Anomalies detected ⚠️"
            Write-Host "Anomalies detected ⚠️" -ForegroundColor Yellow
        }
        
        Add-Content -Path $LogFile -Value ""
        Write-Host "Manual check completed for commit $CommitSha" -ForegroundColor Green
        
    } catch {
        Add-Content -Path $LogFile -Value "ERROR: Failed to fetch check runs - $($_.Exception.Message)"
        Add-Content -Path $LogFile -Value ""
        Write-Host "ERROR: Failed to fetch check runs - $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Add-Note {
    param([string]$Note)
    
    if (-not $Note) {
        Write-Host "Usage: Add-Note <note_text>" -ForegroundColor Red
        return
    }
    
    Add-Content -Path $LogFile -Value "=== Manual Note - $Timestamp ==="
    Add-Content -Path $LogFile -Value "Note: $Note"
    Add-Content -Path $LogFile -Value ""
    Write-Host "Note added to log" -ForegroundColor Green
}

function Show-Recent {
    param([int]$Lines = 20)
    
    if (Test-Path $LogFile) {
        Write-Host "Recent entries from $LogFile`:" -ForegroundColor Cyan
        Get-Content $LogFile | Select-Object -Last $Lines
    } else {
        Write-Host "No log file found for today: $LogFile" -ForegroundColor Yellow
    }
}

# Main script logic
switch ($Action.ToLower()) {
    "check" {
        if (-not $CommitSha) {
            Write-Host "Usage: .\log-ci-health.ps1 check <commit_sha> [description]" -ForegroundColor Red
            exit 1
        }
        Log-CIStatus -CommitSha $CommitSha -Description $Description
    }
    "note" {
        if (-not $CommitSha) {
            Write-Host "Usage: .\log-ci-health.ps1 note <note_text>" -ForegroundColor Red
            exit 1
        }
        Add-Note -Note $CommitSha
    }
    "recent" {
        Show-Recent -Lines $Lines
    }
    default {
        Write-Host "CI Health Logger - Manual logging during stabilization period" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Usage:" -ForegroundColor White
        Write-Host "  .\log-ci-health.ps1 check <commit_sha> [description]  - Log CI status for a commit" -ForegroundColor Gray
        Write-Host "  .\log-ci-health.ps1 note <note_text>                  - Add a manual note to the log" -ForegroundColor Gray
        Write-Host "  .\log-ci-health.ps1 recent [lines]                    - Show recent log entries (default: 20)" -ForegroundColor Gray
        Write-Host "  .\log-ci-health.ps1 help                              - Show this help" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Examples:" -ForegroundColor Yellow
        Write-Host "  .\log-ci-health.ps1 check 8638dab2e9b7f45b807cf75c4fc0f933aab3f1a4d 'Post-rollout verification'" -ForegroundColor Gray
        Write-Host "  .\log-ci-health.ps1 note 'Branch protection successfully applied'" -ForegroundColor Gray
        Write-Host "  .\log-ci-health.ps1 recent 50" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Log file: $LogFile" -ForegroundColor Green
    }
}