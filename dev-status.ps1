# Use if-else instead of null-coalescing operator for compatibility
if ($env:API_BASE) {
    $ApiBase = $env:API_BASE
} else {
    $ApiBase = 'http://127.0.0.1:5001'
}

try { 
    $response = Invoke-WebRequest -Uri "$ApiBase/healthz" -UseBasicParsing -TimeoutSec 2
    Write-Host "Health: $($response.Content)"
} catch { 
    Write-Host "Health: unhealthy"
}

Write-Host "Ports:"
netstat -ano | findstr :3000
netstat -ano | findstr :5001

Write-Host "PIDs:"
if (Test-Path 'logs/dev-backend.pid') { 
    $backendPid = Get-Content 'logs/dev-backend.pid' -Raw
    Write-Host "backend: $backendPid"
}
if (Test-Path 'logs/dev-frontend.pid') { 
    $frontendPid = Get-Content 'logs/dev-frontend.pid' -Raw
    Write-Host "frontend: $frontendPid"
}