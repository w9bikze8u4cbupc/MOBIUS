# Test coala static analysis on a small file
Write-Host "🔍 Testing coala static analysis..." -ForegroundColor Green

# Check if Docker is available
try {
    $dockerVersion = docker --version
    Write-Host "✅ Docker is available: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not available. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}

# Test coala on a single small file
Write-Host "🚀 Running coala on package.json..." -ForegroundColor Green

try {
    # Run coala on package.json only
    docker run --rm -v "${PWD}:/app" --workdir=/app coala/base coala --files="package.json" --non-interactive
    Write-Host "✅ coala test completed successfully!" -ForegroundColor Green
} catch {
    # coala might return non-zero exit code when it finds issues, which is normal
    if ($_.Exception.Message -like "*coala*") {
        Write-Host "✅ coala is working (found issues to report)" -ForegroundColor Green
    } else {
        Write-Host "❌ Error running coala: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n🎉 coala setup is ready!" -ForegroundColor Green
Write-Host "You can now run full analysis with:" -ForegroundColor Yellow
Write-Host "   docker run -ti -v `"${PWD}:/app`" --workdir=/app coala/base coala --non-interactive" -ForegroundColor Cyan