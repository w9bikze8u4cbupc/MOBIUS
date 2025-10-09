# PowerShell script to set up Preview Worker development environment
param(
    [switch]$InstallRedis = $false,
    [string]$DataDir = "./data"
)

Write-Host "=== Preview Worker Development Environment Setup ===" -ForegroundColor Green
Write-Host ""

# Check Node.js installation
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js $nodeVersion found" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check npm installation
try {
    $npmVersion = npm --version
    Write-Host "✓ npm $npmVersion found" -ForegroundColor Green
} catch {
    Write-Host "✗ npm not found. Please install Node.js (includes npm)." -ForegroundColor Red
    exit 1
}

# Create required directories
Write-Host "Setting up directories..." -ForegroundColor Yellow
$requiredDirs = @(
    "$DataDir/previews",
    "$DataDir/workers",
    "src/worker",
    "logs"
)

foreach ($dir in $requiredDirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  ✓ Created directory: $dir" -ForegroundColor Green
    } else {
        Write-Host "  ✓ Directory exists: $dir" -ForegroundColor Cyan
    }
}

# Set up environment variables
Write-Host "Setting up environment variables..." -ForegroundColor Yellow
$env:DATA_DIR = $DataDir
$env:PREVIEW_MAX_CONCURRENCY = "1"
$env:PREVIEW_QUEUE_MAX = "20"
$env:DEV_JOB_STORE = "sqlite"

Write-Host "  ✓ DATA_DIR=$env:DATA_DIR" -ForegroundColor Green
Write-Host "  ✓ PREVIEW_MAX_CONCURRENCY=$env:PREVIEW_MAX_CONCURRENCY" -ForegroundColor Green
Write-Host "  ✓ PREVIEW_QUEUE_MAX=$env:PREVIEW_QUEUE_MAX" -ForegroundColor Green
Write-Host "  ✓ DEV_JOB_STORE=$env:DEV_JOB_STORE" -ForegroundColor Green

# Install BullMQ and dependencies if not already present
Write-Host "Checking/installing dependencies..." -ForegroundColor Yellow
$packageJson = Get-Content -Path "package.json" -Raw | ConvertFrom-Json

# Check if BullMQ is already in dependencies
$hasBullMQ = $packageJson.dependencies.bullmq -or $packageJson.devDependencies.bullmq

if (-not $hasBullMQ) {
    Write-Host "  Installing BullMQ..." -ForegroundColor Yellow
    npm install bullmq --save
    Write-Host "  ✓ BullMQ installed" -ForegroundColor Green
} else {
    Write-Host "  ✓ BullMQ already installed" -ForegroundColor Cyan
}

# Install SQLite3 for fallback
$hasSQLite = $packageJson.dependencies.sqlite3 -or $packageJson.devDependencies.sqlite3

if (-not $hasSQLite) {
    Write-Host "  Installing SQLite3..." -ForegroundColor Yellow
    npm install sqlite3 --save
    Write-Host "  ✓ SQLite3 installed" -ForegroundColor Green
} else {
    Write-Host "  ✓ SQLite3 already installed" -ForegroundColor Cyan
}

# Install Redis locally if requested
if ($InstallRedis) {
    Write-Host "Installing Redis locally..." -ForegroundColor Yellow
    # This is platform-dependent
    # On Windows, we might use Docker or Chocolatey
    # On Linux/macOS, we might use package managers
    
    # Check if Docker is available
    try {
        $dockerVersion = docker --version
        Write-Host "  Docker found: $dockerVersion" -ForegroundColor Green
        Write-Host "  Starting Redis container..." -ForegroundColor Yellow
        docker run -d --name redis-preview-worker -p 6379:6379 redis
        $env:REDIS_URL = "redis://localhost:6379"
        Write-Host "  ✓ Redis container started at $env:REDIS_URL" -ForegroundColor Green
    } catch {
        Write-Host "  Docker not found. Please install Redis manually or use Docker." -ForegroundColor Yellow
    }
} else {
    Write-Host "  Skipping Redis installation. Using SQLite fallback." -ForegroundColor Yellow
}

# Create a basic worker script template
Write-Host "Creating worker script template..." -ForegroundColor Yellow
$workerTemplate = @'
#!/usr/bin/env node

// Preview Worker - Skeleton Implementation
const { Worker, Queue, QueueEvents } = require('bullmq');
const path = require('path');
const fs = require('fs').promises;

// Environment configuration
const DATA_DIR = process.env.DATA_DIR || './data';
const REDIS_URL = process.env.REDIS_URL || null;
const DEV_JOB_STORE = process.env.DEV_JOB_STORE || 'sqlite';
const PREVIEW_MAX_CONCURRENCY = parseInt(process.env.PREVIEW_MAX_CONCURRENCY || '1');

// Initialize connection
const connection = REDIS_URL ? { url: REDIS_URL } : null;

// Create worker
const worker = new Worker('preview', async job => {
  const { jobId, projectId, previewRequest, dryRun, requestId } = job.data;
  
  console.log(`Processing job ${jobId} for project ${projectId}`);
  
  // Create preview directory
  const previewDir = path.join(DATA_DIR, 'previews', projectId, jobId);
  await fs.mkdir(previewDir, { recursive: true });
  
  // For dry run, create a placeholder
  if (dryRun) {
    const placeholder = {
      jobId,
      projectId,
      status: 'success',
      dryRun: true,
      createdAt: new Date().toISOString()
    };
    
    await fs.writeFile(
      path.join(previewDir, 'preview.json'),
      JSON.stringify(placeholder, null, 2)
    );
    
    return { status: 'success', dryRun: true };
  }
  
  // TODO: Implement actual preview rendering
  // This is where you'd call your renderer (ffmpeg/python)
  
  return { status: 'success' };
}, { 
  connection,
  concurrency: PREVIEW_MAX_CONCURRENCY
});

worker.on('completed', job => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});

console.log('Preview Worker started');
'@

$workerPath = "src/worker/previewWorker.js"
if (-not (Test-Path $workerPath)) {
    Set-Content -Path $workerPath -Value $workerTemplate
    Write-Host "  ✓ Created worker template at $workerPath" -ForegroundColor Green
} else {
    Write-Host "  ✓ Worker script already exists" -ForegroundColor Cyan
}

# Create package.json script entry if it doesn't exist
Write-Host "Updating package.json with worker script..." -ForegroundColor Yellow
$packagePath = "package.json"
if (Test-Path $packagePath) {
    $package = Get-Content -Path $packagePath -Raw | ConvertFrom-Json
    
    # Add worker script if it doesn't exist
    if (-not $package.scripts) {
        $package | Add-Member -Name "scripts" -Value @{} -MemberType NoteProperty
    }
    
    if (-not $package.scripts."worker:preview") {
        $package.scripts | Add-Member -Name "worker:preview" -Value "node src/worker/previewWorker.js" -MemberType NoteProperty
        $packageJsonString = $package | ConvertTo-Json -Depth 10
        Set-Content -Path $packagePath -Value $packageJsonString
        Write-Host "  ✓ Added worker:preview script to package.json" -ForegroundColor Green
    } else {
        Write-Host "  ✓ worker:preview script already exists in package.json" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host "Environment variables set:" -ForegroundColor Cyan
Write-Host "  DATA_DIR: $env:DATA_DIR" -ForegroundColor Gray
Write-Host "  PREVIEW_MAX_CONCURRENCY: $env:PREVIEW_MAX_CONCURRENCY" -ForegroundColor Gray
Write-Host "  PREVIEW_QUEUE_MAX: $env:PREVIEW_QUEUE_MAX" -ForegroundColor Gray
Write-Host "  DEV_JOB_STORE: $env:DEV_JOB_STORE" -ForegroundColor Gray
if ($env:REDIS_URL) {
    Write-Host "  REDIS_URL: $env:REDIS_URL" -ForegroundColor Gray
}

Write-Host ""
Write-Host "You can now run the worker with:" -ForegroundColor Yellow
Write-Host "  npm run worker:preview" -ForegroundColor Gray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Implement the actual preview rendering logic in src/worker/previewWorker.js" -ForegroundColor Gray
Write-Host "  2. Add queue metrics and status endpoints" -ForegroundColor Gray
Write-Host "  3. Implement renderer integration" -ForegroundColor Gray
Write-Host "  4. Add tests and monitoring" -ForegroundColor Gray