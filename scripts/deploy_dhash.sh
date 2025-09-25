#!/bin/bash

# MOBIUS Deploy Script with Dry-run Support
# Usage: ./scripts/deploy_dhash.sh --env staging|production [--dry-run]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default values
ENVIRONMENT=""
DRY_RUN=false
SKIP_BACKUP=false
SKIP_TESTS=false
VERBOSE=false

# Parse command line arguments
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
    --skip-backup)
      SKIP_BACKUP=true
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help)
      echo "Usage: $0 --env ENVIRONMENT [OPTIONS]"
      echo ""
      echo "Required:"
      echo "  --env ENVIRONMENT    staging or production"
      echo ""
      echo "Options:"
      echo "  --dry-run           Simulate deployment without making changes"
      echo "  --skip-backup       Skip automatic backup creation"
      echo "  --skip-tests        Skip pre-deployment tests"
      echo "  --verbose           Enable verbose output"
      echo "  --help              Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0 --env staging --dry-run"
      echo "  $0 --env production"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$ENVIRONMENT" ]]; then
  echo "Error: --env parameter is required"
  echo "Use --help for usage information"
  exit 1
fi

if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
  echo "Error: Environment must be 'staging' or 'production'"
  exit 1
fi

# Configuration based on environment
case "$ENVIRONMENT" in
  staging)
    PORT=5001
    DB_FILE="mobius-staging.db"
    LOG_LEVEL="debug"
    ;;
  production)
    PORT=5000
    DB_FILE="mobius.db"
    LOG_LEVEL="info"
    ;;
esac

if [[ "$DRY_RUN" == "true" ]]; then
  echo "🧪 DRY RUN MODE - No changes will be made"
fi

echo "🚀 MOBIUS Deployment Script"
echo "   Environment: $ENVIRONMENT"
echo "   Port: $PORT"
echo "   Dry run: $DRY_RUN"
echo ""

# Pre-deployment checks
echo "🔍 Pre-deployment checks..."

# Check if project directory exists
if [[ ! -d "$PROJECT_ROOT" ]]; then
  echo "❌ Project directory not found: $PROJECT_ROOT"
  exit 1
fi

# Check if Node.js is available
if ! command -v node > /dev/null; then
  echo "❌ Node.js is not installed"
  exit 1
fi

# Check if npm is available  
if ! command -v npm > /dev/null; then
  echo "❌ npm is not installed"
  exit 1
fi

# Check package.json exists
if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
  echo "❌ package.json not found"
  exit 1
fi

echo "✅ Basic checks passed"

# Create backup unless skipped
if [[ "$SKIP_BACKUP" == "false" ]]; then
  echo ""
  echo "💾 Creating deployment backup..."
  
  BACKUP_TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
  BACKUP_FILE="backups/pre-deploy-${ENVIRONMENT}-${BACKUP_TIMESTAMP}.zip"
  
  if [[ "$DRY_RUN" == "false" ]]; then
    mkdir -p "$(dirname "$BACKUP_FILE")"
    if [[ "$VERBOSE" == "true" ]]; then
      "$SCRIPT_DIR/backup_library.sh" --out "$BACKUP_FILE" --verbose
    else
      "$SCRIPT_DIR/backup_library.sh" --out "$BACKUP_FILE"
    fi
    echo "✅ Backup created: $BACKUP_FILE"
  else
    echo "🧪 Would create backup: $BACKUP_FILE"
  fi
else
  echo "⚠️  Skipping backup creation"
fi

# Install/update dependencies
echo ""
echo "📦 Installing dependencies..."

if [[ "$DRY_RUN" == "false" ]]; then
  cd "$PROJECT_ROOT"
  npm ci --production
  
  # Install client dependencies
  if [[ -f "client/package.json" ]]; then
    cd "$PROJECT_ROOT/client"
    npm ci --production
    cd "$PROJECT_ROOT"
  fi
  echo "✅ Dependencies installed"
else
  echo "🧪 Would install dependencies with npm ci"
fi

# Run tests unless skipped
if [[ "$SKIP_TESTS" == "false" ]]; then
  echo ""
  echo "🧪 Running pre-deployment tests..."
  
  if [[ "$DRY_RUN" == "false" ]]; then
    cd "$PROJECT_ROOT"
    
    # Run unit tests
    npm test --if-present || {
      echo "❌ Tests failed"
      exit 1
    }
    
    # Run smoke tests if available
    if [[ -f "scripts/smoke-tests.js" ]]; then
      node scripts/smoke-tests.js --quick || {
        echo "❌ Smoke tests failed"
        exit 1
      }
    fi
    
    echo "✅ Tests passed"
  else
    echo "🧪 Would run: npm test && node scripts/smoke-tests.js --quick"
  fi
else
  echo "⚠️  Skipping tests"
fi

# Build application
echo ""
echo "🔨 Building application..."

if [[ "$DRY_RUN" == "false" ]]; then
  cd "$PROJECT_ROOT"
  
  # Build client if build script exists
  if [[ -f "client/package.json" ]]; then
    cd "$PROJECT_ROOT/client"
    if npm run build --if-present; then
      echo "✅ Client built successfully"
    else
      echo "❌ Client build failed"
      exit 1
    fi
    cd "$PROJECT_ROOT"
  fi
  
  # Build server if build script exists
  if npm run build --if-present; then
    echo "✅ Server build completed"
  fi
else
  echo "🧪 Would build client and server"
fi

# Environment configuration
echo ""
echo "⚙️  Environment configuration..."

ENV_FILE="$PROJECT_ROOT/.env"
if [[ "$DRY_RUN" == "false" ]]; then
  # Create or update .env file for the environment
  cat > "$ENV_FILE" << EOF
NODE_ENV=$ENVIRONMENT
PORT=$PORT
LOG_LEVEL=$LOG_LEVEL
DB_FILE=$DB_FILE
EOF
  
  # Add environment-specific variables
  case "$ENVIRONMENT" in
    staging)
      echo "API_BASE_URL=https://staging.mobius.example.com" >> "$ENV_FILE"
      ;;
    production)
      echo "API_BASE_URL=https://api.mobius.example.com" >> "$ENV_FILE"
      ;;
  esac
  
  echo "✅ Environment configured for $ENVIRONMENT"
else
  echo "🧪 Would create .env file with:"
  echo "   NODE_ENV=$ENVIRONMENT"
  echo "   PORT=$PORT"
  echo "   LOG_LEVEL=$LOG_LEVEL"
  echo "   DB_FILE=$DB_FILE"
fi

# Database migration
echo ""
echo "🗄️  Database migration..."

if [[ -f "$SCRIPT_DIR/migrate-dhash.js" ]]; then
  if [[ "$DRY_RUN" == "false" ]]; then
    cd "$PROJECT_ROOT"
    node "$SCRIPT_DIR/migrate-dhash.js" --env "$ENVIRONMENT" || {
      echo "❌ Database migration failed"
      exit 1
    }
    echo "✅ Database migration completed"
  else
    echo "🧪 Would run: node scripts/migrate-dhash.js --env $ENVIRONMENT"
  fi
else
  echo "⚠️  No migration script found (scripts/migrate-dhash.js)"
fi

# Process management simulation
echo ""
echo "🔄 Process management..."

if [[ "$DRY_RUN" == "false" ]]; then
  # In a real deployment, you would use PM2, systemd, or similar
  echo "✅ Would restart application with process manager"
  echo "   Command: pm2 restart mobius-$ENVIRONMENT || pm2 start ecosystem.config.js --env $ENVIRONMENT"
else
  echo "🧪 Would restart application process for $ENVIRONMENT"
fi

# Health check
echo ""
echo "❤️  Post-deployment health check..."

if [[ "$DRY_RUN" == "false" ]]; then
  echo "Waiting for application to start..."
  sleep 5
  
  # Check if health endpoint responds
  if command -v curl > /dev/null; then
    if curl -f "http://localhost:$PORT/health" > /dev/null 2>&1; then
      echo "✅ Health check passed"
    else
      echo "❌ Health check failed"
      echo "Check application logs for errors"
      exit 1
    fi
  else
    echo "⚠️  curl not available, skipping health check"
  fi
else
  echo "🧪 Would check: curl http://localhost:$PORT/health"
fi

# Deployment summary
echo ""
echo "🎉 Deployment Summary"
echo "   Environment: $ENVIRONMENT"
echo "   Port: $PORT"
echo "   Status: $(if [[ "$DRY_RUN" == "true" ]]; then echo "SIMULATED"; else echo "COMPLETED"; fi)"
if [[ "$SKIP_BACKUP" == "false" ]]; then
  echo "   Backup: $BACKUP_FILE"
fi
echo ""

if [[ "$ENVIRONMENT" == "production" ]]; then
  echo "🚨 PRODUCTION DEPLOYMENT COMPLETE"
  echo "   Monitor the following for 30-60 minutes:"
  echo "   - Health endpoint: http://localhost:$PORT/health"
  echo "   - Metrics endpoint: http://localhost:$PORT/metrics"
  echo "   - Application logs in logs/ directory"
  echo "   - System resource usage"
  echo ""
  echo "🔄 Rollback command if needed:"
  echo "   ./scripts/rollback_dhash.sh --backup \"$BACKUP_FILE\""
else
  echo "✅ STAGING DEPLOYMENT COMPLETE"
  echo "   Test the application thoroughly before deploying to production"
fi