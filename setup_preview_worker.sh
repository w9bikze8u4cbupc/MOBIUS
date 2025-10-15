#!/bin/bash
# Bash script to set up Preview Worker development environment

# Default options
INSTALL_REDIS=false
DATA_DIR="./data"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --install-redis)
      INSTALL_REDIS=true
      shift
      ;;
    --data-dir)
      DATA_DIR="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "=== Preview Worker Development Environment Setup ==="
echo ""

# Check Node.js installation
echo "Checking Node.js installation..."
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  echo "✓ Node.js $NODE_VERSION found"
else
  echo "✗ Node.js not found. Please install Node.js first."
  exit 1
fi

# Check npm installation
if command -v npm &> /dev/null; then
  NPM_VERSION=$(npm --version)
  echo "✓ npm $NPM_VERSION found"
else
  echo "✗ npm not found. Please install Node.js (includes npm)."
  exit 1
fi

# Create required directories
echo "Setting up directories..."
required_dirs=(
  "$DATA_DIR/previews"
  "$DATA_DIR/workers"
  "src/worker"
  "logs"
)

for dir in "${required_dirs[@]}"; do
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir"
    echo "  ✓ Created directory: $dir"
  else
    echo "  ✓ Directory exists: $dir"
  fi
done

# Set up environment variables
echo "Setting up environment variables..."
export DATA_DIR="$DATA_DIR"
export PREVIEW_MAX_CONCURRENCY="1"
export PREVIEW_QUEUE_MAX="20"
export DEV_JOB_STORE="sqlite"

echo "  ✓ DATA_DIR=$DATA_DIR"
echo "  ✓ PREVIEW_MAX_CONCURRENCY=$PREVIEW_MAX_CONCURRENCY"
echo "  ✓ PREVIEW_QUEUE_MAX=$PREVIEW_QUEUE_MAX"
echo "  ✓ DEV_JOB_STORE=$DEV_JOB_STORE"

# Install BullMQ and dependencies if not already present
echo "Checking/installing dependencies..."
if [ -f "package.json" ]; then
  if ! grep -q '"bullmq"' package.json; then
    echo "  Installing BullMQ..."
    npm install bullmq --save
    echo "  ✓ BullMQ installed"
  else
    echo "  ✓ BullMQ already installed"
  fi
  
  if ! grep -q '"sqlite3"' package.json; then
    echo "  Installing SQLite3..."
    npm install sqlite3 --save
    echo "  ✓ SQLite3 installed"
  else
    echo "  ✓ SQLite3 already installed"
  fi
else
  echo "  Installing BullMQ and SQLite3..."
  npm init -y >/dev/null 2>&1
  npm install bullmq sqlite3 --save
  echo "  ✓ BullMQ and SQLite3 installed"
fi

# Install Redis locally if requested
if [ "$INSTALL_REDIS" = true ]; then
  echo "Installing Redis locally..."
  
  # Check if Docker is available
  if command -v docker &> /dev/null; then
    echo "  Docker found"
    echo "  Starting Redis container..."
    docker run -d --name redis-preview-worker -p 6379:6379 redis
    export REDIS_URL="redis://localhost:6379"
    echo "  ✓ Redis container started at $REDIS_URL"
  else
    echo "  Docker not found. Please install Redis manually or use Docker."
  fi
else
  echo "  Skipping Redis installation. Using SQLite fallback."
fi

# Create a basic worker script template
echo "Creating worker script template..."
worker_template='#!/usr/bin/env node

// Preview Worker - Skeleton Implementation
const { Worker, Queue, QueueEvents } = require("bullmq");
const path = require("path");
const fs = require("fs").promises;

// Environment configuration
const DATA_DIR = process.env.DATA_DIR || "./data";
const REDIS_URL = process.env.REDIS_URL || null;
const DEV_JOB_STORE = process.env.DEV_JOB_STORE || "sqlite";
const PREVIEW_MAX_CONCURRENCY = parseInt(process.env.PREVIEW_MAX_CONCURRENCY || "1");

// Initialize connection
const connection = REDIS_URL ? { url: REDIS_URL } : null;

// Create worker
const worker = new Worker("preview", async job => {
  const { jobId, projectId, previewRequest, dryRun, requestId } = job.data;
  
  console.log(`Processing job ${jobId} for project ${projectId}`);
  
  // Create preview directory
  const previewDir = path.join(DATA_DIR, "previews", projectId, jobId);
  await fs.mkdir(previewDir, { recursive: true });
  
  // For dry run, create a placeholder
  if (dryRun) {
    const placeholder = {
      jobId,
      projectId,
      status: "success",
      dryRun: true,
      createdAt: new Date().toISOString()
    };
    
    await fs.writeFile(
      path.join(previewDir, "preview.json"),
      JSON.stringify(placeholder, null, 2)
    );
    
    return { status: "success", dryRun: true };
  }
  
  // TODO: Implement actual preview rendering
  // This is where you would call your renderer (ffmpeg/python)
  
  return { status: "success" };
}, { 
  connection,
  concurrency: PREVIEW_MAX_CONCURRENCY
});

worker.on("completed", job => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});

console.log("Preview Worker started");
'

worker_path="src/worker/previewWorker.js"
if [ ! -f "$worker_path" ]; then
  echo "$worker_template" > "$worker_path"
  echo "  ✓ Created worker template at $worker_path"
else
  echo "  ✓ Worker script already exists"
fi

# Create package.json script entry if it doesn't exist
echo "Updating package.json with worker script..."
if [ -f "package.json" ]; then
  if ! grep -q '"worker:preview"' package.json; then
    # Use jq to add the script if available
    if command -v jq &> /dev/null; then
      jq '.scripts["worker:preview"] = "node src/worker/previewWorker.js"' package.json > temp.json && mv temp.json package.json
      echo "  ✓ Added worker:preview script to package.json"
    else
      # Fallback: append to scripts section
      sed -i '/"scripts": {/a \    "worker:preview": "node src/worker/previewWorker.js",' package.json
      echo "  ✓ Added worker:preview script to package.json"
    fi
  else
    echo "  ✓ worker:preview script already exists in package.json"
  fi
fi

echo ""
echo "=== Setup Complete ==="
echo "Environment variables set:"
echo "  DATA_DIR: $DATA_DIR"
echo "  PREVIEW_MAX_CONCURRENCY: $PREVIEW_MAX_CONCURRENCY"
echo "  PREVIEW_QUEUE_MAX: $PREVIEW_QUEUE_MAX"
echo "  DEV_JOB_STORE: $DEV_JOB_STORE"
if [ -n "$REDIS_URL" ]; then
  echo "  REDIS_URL: $REDIS_URL"
fi

echo ""
echo "You can now run the worker with:"
echo "  npm run worker:preview"
echo ""
echo "Next steps:"
echo "  1. Implement the actual preview rendering logic in src/worker/previewWorker.js"
echo "  2. Add queue metrics and status endpoints"
echo "  3. Implement renderer integration"
echo "  4. Add tests and monitoring"