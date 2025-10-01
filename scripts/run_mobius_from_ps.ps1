param(
  [string]$RepoPath = ""
)

Write-Host "========================================"
Write-Host "MOBIUS WSL Bootstrap from PowerShell"
Write-Host "========================================"
Write-Host ""

# Check if WSL is installed
try {
  $wslVersion = wsl --status 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: WSL is not installed or not properly configured" -ForegroundColor Red
    Write-Host "Please install WSL2 first: wsl --install" -ForegroundColor Yellow
    exit 1
  }
} catch {
  Write-Host "Error: Cannot execute WSL commands" -ForegroundColor Red
  Write-Host "Please ensure WSL is installed: wsl --install" -ForegroundColor Yellow
  exit 1
}

# Check if Docker Desktop is running
$dockerProcess = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
if (-not $dockerProcess) {
  Write-Host "Warning: Docker Desktop does not appear to be running" -ForegroundColor Yellow
  Write-Host "Please start Docker Desktop before running this script" -ForegroundColor Yellow
  Write-Host ""
  $continue = Read-Host "Continue anyway? (y/N)"
  if ($continue -ne "y" -and $continue -ne "Y") {
    exit 1
  }
}

if ($RepoPath -ne "") {
  # Convert Windows path to WSL path
  Write-Host "Converting Windows path to WSL path..." -ForegroundColor Cyan
  
  # Handle different path formats
  $RepoPath = $RepoPath.Replace("\", "/")
  
  # Convert drive letter (C: -> /mnt/c)
  if ($RepoPath -match "^([A-Za-z]):(.*)$") {
    $drive = $matches[1].ToLower()
    $path = $matches[2]
    $wslPath = "/mnt/$drive$path"
  } else {
    $wslPath = $RepoPath
  }
  
  Write-Host "Repository path: $RepoPath" -ForegroundColor Gray
  Write-Host "WSL path: $wslPath" -ForegroundColor Gray
  Write-Host ""
  Write-Host "Running WSL bootstrap in: $wslPath" -ForegroundColor Green
  Write-Host ""
  
  # Run the bootstrap script in WSL at the specified path
  wsl bash -lc "cd '$wslPath' && bash ./scripts/run_mobius_wsl.sh"
  
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Bootstrap failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
  }
} else {
  # Run the bootstrap script from WSL home directory
  Write-Host "Running WSL bootstrap from home directory..." -ForegroundColor Green
  Write-Host ""
  
  # Check if script exists in home directory
  $scriptExists = wsl bash -lc "test -f ~/run_mobius_wsl.sh && echo 'exists' || echo 'missing'"
  
  if ($scriptExists -match "missing") {
    Write-Host "Bootstrap script not found in WSL home directory" -ForegroundColor Yellow
    Write-Host "Downloading script..." -ForegroundColor Cyan
    Write-Host ""
    
    wsl bash -lc "curl -fsSL https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_wsl.sh -o ~/run_mobius_wsl.sh && chmod +x ~/run_mobius_wsl.sh"
    
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Failed to download bootstrap script" -ForegroundColor Red
      exit 1
    }
    
    Write-Host "Script downloaded successfully" -ForegroundColor Green
    Write-Host ""
  }
  
  wsl bash -lc "bash ~/run_mobius_wsl.sh"
  
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Bootstrap failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

Write-Host ""
Write-Host "========================================"
Write-Host "Bootstrap completed successfully!" -ForegroundColor Green
Write-Host "========================================"
Write-Host ""
Write-Host "Repository is ready at: ~/MOBIUS (in WSL)" -ForegroundColor Cyan
Write-Host ""
Write-Host "To access from WSL:" -ForegroundColor Yellow
Write-Host "  wsl" -ForegroundColor Gray
Write-Host "  cd ~/MOBIUS" -ForegroundColor Gray
Write-Host ""
Write-Host "See docs/WINDOWS_SETUP.md for more information" -ForegroundColor Yellow
