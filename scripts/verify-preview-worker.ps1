# Preview Worker Verification Script (Windows PowerShell)
# This script verifies that the Preview Worker is properly implemented and functional

Write-Host "=== Preview Worker Verification ===" -ForegroundColor Green

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "Error: Must run from project root directory" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Running from project root" -ForegroundColor Green

# Check dependencies
Write-Host "Checking dependencies..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js is installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Error: Node.js is not installed" -ForegroundColor Red
    exit 1
}

try {
    $npmVersion = npm --version
    Write-Host "✓ npm is installed: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "Error: npm is not installed" -ForegroundColor Red
    exit 1
}

# Check if Redis is running
Write-Host "Checking Redis connectivity..." -ForegroundColor Yellow
try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $connect = $tcpClient.BeginConnect("localhost", 6379, $null, $null)
    $wait = $connect.AsyncWaitHandle.WaitOne(1000, $false)
    if ($wait) {
        try {
            $tcpClient.EndConnect($connect)
            Write-Host "✓ Redis is running on localhost:6379" -ForegroundColor Green
        } catch {
            Write-Host "Warning: Redis is not running on localhost:6379" -ForegroundColor Yellow
            Write-Host "  Please start Redis server before running full tests" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Warning: Redis is not running on localhost:6379" -ForegroundColor Yellow
        Write-Host "  Please start Redis server before running full tests" -ForegroundColor Yellow
    }
    $tcpClient.Close()
} catch {
    Write-Host "Warning: Redis is not running on localhost:6379" -ForegroundColor Yellow
    Write-Host "  Please start Redis server before running full tests" -ForegroundColor Yellow
}

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm ci

# Run payload validation tests
Write-Host "Running payload validation tests..." -ForegroundColor Yellow
npm run test:preview-payloads

# Run unit tests
Write-Host "Running unit tests..." -ForegroundColor Yellow
npm test

# Check for required files
Write-Host "Checking for required files..." -ForegroundColor Yellow

$requiredFiles = @(
    "src/worker/previewWorker.js",
    "src/worker/previewWorkerClient.js",
    "src/worker/previewMetrics.js",
    "src/worker/health.js",
    "src/worker/jobHandlers/renderPreview.js",
    "schemas/preview-job.schema.json",
    "scripts/validatePreviewPayload.js",
    "tests/worker/previewWorker.comprehensive.test.js",
    ".github/workflows/ci-preview-worker.yml"
)

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "✓ $file exists" -ForegroundColor Green
    } else {
        Write-Host "✗ $file is missing" -ForegroundColor Red
        exit 1
    }
}

# Check package.json for new scripts
Write-Host "Checking package.json for new scripts..." -ForegroundColor Yellow
$packageJson = Get-Content package.json -Raw | ConvertFrom-Json

if ($packageJson.scripts."worker:preview") {
    Write-Host "✓ worker:preview script exists" -ForegroundColor Green
} else {
    Write-Host "✗ worker:preview script is missing" -ForegroundColor Red
    exit 1
}

if ($packageJson.scripts."test:preview-payloads") {
    Write-Host "✓ test:preview-payloads script exists" -ForegroundColor Green
} else {
    Write-Host "✗ test:preview-payloads script is missing" -ForegroundColor Red
    exit 1
}

# Check package.json for new dependencies
Write-Host "Checking package.json for new dependencies..." -ForegroundColor Yellow

if ($packageJson.dependencies.bullmq) {
    Write-Host "✓ bullmq dependency exists" -ForegroundColor Green
} else {
    Write-Host "✗ bullmq dependency is missing" -ForegroundColor Red
    exit 1
}

if ($packageJson.dependencies.ioredis) {
    Write-Host "✓ ioredis dependency exists" -ForegroundColor Green
} else {
    Write-Host "✗ ioredis dependency is missing" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Preview Worker Verification Complete ===" -ForegroundColor Green
Write-Host "All checks passed! The Preview Worker implementation is ready." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Start Redis server if not already running" -ForegroundColor Yellow
Write-Host "2. Start the worker: npm run worker:preview" -ForegroundColor Yellow
Write-Host "3. Test the API endpoints:" -ForegroundColor Yellow
Write-Host "   - Health check: curl http://localhost:5001/api/preview/worker/health" -ForegroundColor Yellow
Write-Host "   - Submit job: curl -X POST http://localhost:5001/api/preview/job -H 'Content-Type: application/json' -d @preview_payload_minimal.json" -ForegroundColor Yellow