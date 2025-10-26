# Test script for the /api/ingest endpoint

Write-Host "Testing /api/ingest endpoint..."

# Start the server in the background
Write-Host "Starting server..."
Start-Process -NoNewWindow -FilePath "node" -ArgumentList "src/api/index.js"
Start-Sleep -Seconds 3

# Test 1: Minimal ingest
Write-Host "Test 1: Minimal ingest"
Invoke-RestMethod -Uri "http://localhost:5001/api/ingest" -Method Post -Form @{
    file = Get-Item "data/fixtures/test-fixture.txt"
}

Write-Host ""

# Test 2: Ingest with BGG ID
Write-Host "Test 2: Ingest with BGG ID"
Invoke-RestMethod -Uri "http://localhost:5001/api/ingest" -Method Post -Form @{
    file = Get-Item "data/fixtures/test-fixture.txt"
    bggId = "302723"
}

Write-Host ""

# Test 3: Ingest with BGG URL
Write-Host "Test 3: Ingest with BGG URL"
Invoke-RestMethod -Uri "http://localhost:5001/api/ingest" -Method Post -Form @{
    file = Get-Item "data/fixtures/test-fixture.txt"
    bggUrl = "https://boardgamegeek.com/boardgame/302723"
}

Write-Host ""

# Test 4: Ingest with title
Write-Host "Test 4: Ingest with title"
Invoke-RestMethod -Uri "http://localhost:5001/api/ingest" -Method Post -Form @{
    file = Get-Item "data/fixtures/test-fixture.txt"
    title = "Jaipur"
}

Write-Host ""

# Test 5: Dry run
Write-Host "Test 5: Dry run"
Invoke-RestMethod -Uri "http://localhost:5001/api/ingest" -Method Post -Form @{
    file = Get-Item "data/fixtures/test-fixture.txt"
    dryRun = "true"
}

Write-Host ""

# Stop the server
Write-Host "Stopping server..."
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue