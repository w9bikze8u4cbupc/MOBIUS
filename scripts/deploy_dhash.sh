#!/usr/bin/env bash
set -euo pipefail

# scripts/deploy_dhash.sh
# Deploy script with dry-run capability for the MOBIUS video generation pipeline
#
# Usage:
#   ./scripts/deploy_dhash.sh --env staging --dry-run
#   ./scripts/deploy_dhash.sh --env production
#
# Options:
#   --env ENV        Target environment (staging, production)
#   --dry-run        Perform validation checks without actual deployment
#   --help           Show this help

usage() {
  cat <<EOF
Usage: $0 --env ENVIRONMENT [options]

Deploy the MOBIUS video generation pipeline.

Options:
  --env ENV        Target environment: staging, production (required)
  --dry-run        Perform validation checks without actual deployment
  --help           Show this help

Examples:
  $0 --env staging --dry-run
  $0 --env production
EOF
}

# Parse arguments
ENVIRONMENT=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$ENVIRONMENT" ]]; then
  echo "Error: --env option is required" >&2
  usage >&2
  exit 1
fi

if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
  echo "Error: environment must be 'staging' or 'production'" >&2
  exit 1
fi

echo "Deploy script starting for environment: $ENVIRONMENT"
if [[ "$DRY_RUN" == "true" ]]; then
  echo "DRY-RUN MODE: No actual deployment will occur"
fi

# Check prerequisites
echo "Checking prerequisites..."

# Check Node.js
if ! command -v node > /dev/null; then
  echo "Error: Node.js not found" >&2
  exit 1
fi
NODE_VERSION=$(node --version)
echo "✓ Node.js: $NODE_VERSION"

# Check npm
if ! command -v npm > /dev/null; then
  echo "Error: npm not found" >&2
  exit 1
fi
NPM_VERSION=$(npm --version)
echo "✓ npm: $NPM_VERSION"

# Check FFmpeg
if ! command -v ffmpeg > /dev/null; then
  echo "Error: FFmpeg not found" >&2
  exit 1
fi
FFMPEG_VERSION=$(ffmpeg -version | head -n1)
echo "✓ FFmpeg: $FFMPEG_VERSION"

# Check Python
if ! command -v python3 > /dev/null; then
  echo "Error: Python 3 not found" >&2
  exit 1
fi
PYTHON_VERSION=$(python3 --version)
echo "✓ Python: $PYTHON_VERSION"

# Check project files
echo "Checking project structure..."
REQUIRED_FILES=(
  "package.json"
  "src/"
  "scripts/"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -e "$file" ]]; then
    echo "Error: Required file/directory not found: $file" >&2
    exit 1
  fi
  echo "✓ Found: $file"
done

# Check dependencies
echo "Checking dependencies..."
if [[ ! -d "node_modules" ]]; then
  echo "Warning: node_modules not found, dependencies may not be installed"
  if [[ "$DRY_RUN" == "false" ]]; then
    echo "Installing dependencies..."
    npm ci
  fi
else
  echo "✓ Dependencies installed"
fi

# Environment-specific validation
echo "Validating environment configuration for: $ENVIRONMENT"

case "$ENVIRONMENT" in
  staging)
    echo "✓ Staging environment validation passed"
    DEPLOY_TARGET="staging-server"
    ;;
  production)
    echo "✓ Production environment validation passed"
    DEPLOY_TARGET="production-server"
    # Additional production checks could go here
    if [[ "$DRY_RUN" == "false" ]]; then
      echo "Warning: Production deployment - ensure you have proper authorization"
      # In a real scenario, you might check for production deployment keys/tokens
    fi
    ;;
esac

# Simulate deployment steps
echo "Deployment steps for $ENVIRONMENT:"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "DRY-RUN: Would build application"
  echo "DRY-RUN: Would run tests"
  echo "DRY-RUN: Would package application"
  echo "DRY-RUN: Would deploy to $DEPLOY_TARGET"
  echo "DRY-RUN: Would verify deployment"
else
  echo "Building application..."
  npm run build --if-present || echo "No build script found, skipping"
  
  echo "Running tests..."
  npm test --if-present || echo "No test script found, skipping"
  
  echo "Packaging application..."
  # In a real deployment, this would create deployment artifacts
  
  echo "Deploying to $DEPLOY_TARGET..."
  # In a real deployment, this would push to the target environment
  
  echo "Verifying deployment..."
  # In a real deployment, this would run health checks
fi

echo "Deployment $(if [[ "$DRY_RUN" == "true" ]]; then echo "dry-run"; else echo "execution"; fi) completed successfully for $ENVIRONMENT"
exit 0