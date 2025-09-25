#!/bin/bash

# MOBIUS Rollback Script with SHA256 Verification
# Usage: ./scripts/rollback_dhash.sh --backup backups/dhash_20250925T123731Z.zip

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default values
BACKUP_FILE=""
SKIP_VERIFICATION=false
SKIP_SERVICE_STOP=false
FORCE=false
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --backup)
      BACKUP_FILE="$2"
      shift 2
      ;;
    --skip-verification)
      SKIP_VERIFICATION=true
      shift
      ;;
    --skip-service-stop)
      SKIP_SERVICE_STOP=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help)
      echo "Usage: $0 --backup BACKUP_FILE [OPTIONS]"
      echo ""
      echo "Required:"
      echo "  --backup FILE       Path to backup ZIP file to restore"
      echo ""
      echo "Options:"
      echo "  --skip-verification Skip SHA256 checksum verification"
      echo "  --skip-service-stop Skip stopping application service"
      echo "  --force             Force rollback without confirmation"
      echo "  --verbose           Enable verbose output"
      echo "  --help              Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0 --backup backups/dhash_20250925T123731Z.zip"
      echo "  $0 --backup backups/pre-deploy-production-20250925T123731Z.zip --force"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Error: --backup parameter is required"
  echo "Use --help for usage information"
  exit 1
fi

# Convert to absolute path
BACKUP_FILE="$(cd "$(dirname "$BACKUP_FILE")" && pwd)/$(basename "$BACKUP_FILE")"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "❌ Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "🔄 MOBIUS Rollback Script"
echo "   Backup file: $BACKUP_FILE"
echo "   Skip verification: $SKIP_VERIFICATION"
echo "   Force: $FORCE"
echo ""

# Verify backup integrity
if [[ "$SKIP_VERIFICATION" == "false" ]]; then
  echo "🔐 Verifying backup integrity..."
  
  SHA256_FILE="${BACKUP_FILE}.sha256"
  if [[ -f "$SHA256_FILE" ]]; then
    cd "$(dirname "$BACKUP_FILE")"
    if command -v sha256sum > /dev/null; then
      if sha256sum -c "$(basename "$SHA256_FILE")" > /dev/null; then
        echo "✅ SHA256 verification passed"
      else
        echo "❌ SHA256 verification failed"
        echo "Backup file may be corrupted or tampered with"
        exit 1
      fi
    elif command -v shasum > /dev/null; then
      EXPECTED_HASH=$(cat "$SHA256_FILE" | cut -d' ' -f1)
      ACTUAL_HASH=$(shasum -a 256 "$(basename "$BACKUP_FILE")" | cut -d' ' -f1)
      if [[ "$EXPECTED_HASH" == "$ACTUAL_HASH" ]]; then
        echo "✅ SHA256 verification passed"
      else
        echo "❌ SHA256 verification failed"
        echo "Expected: $EXPECTED_HASH"
        echo "Actual:   $ACTUAL_HASH"
        exit 1
      fi
    else
      echo "⚠️  Neither sha256sum nor shasum found, skipping verification"
    fi
  else
    echo "⚠️  No SHA256 file found: $SHA256_FILE"
    echo "Cannot verify backup integrity"
    if [[ "$FORCE" == "false" ]]; then
      read -p "Continue without verification? (y/N): " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Rollback cancelled"
        exit 1
      fi
    fi
  fi
else
  echo "⚠️  Skipping backup verification"
fi

# Confirmation prompt
if [[ "$FORCE" == "false" ]]; then
  echo ""
  echo "⚠️  WARNING: This will replace the current application with the backup"
  echo "   Current data will be lost unless you have a backup"
  echo ""
  read -p "Are you sure you want to proceed with the rollback? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Rollback cancelled"
    exit 1
  fi
fi

# Create rollback backup of current state
echo ""
echo "💾 Creating rollback backup of current state..."

ROLLBACK_TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
CURRENT_BACKUP="backups/pre-rollback-${ROLLBACK_TIMESTAMP}.zip"

mkdir -p "$(dirname "$CURRENT_BACKUP")"
if [[ "$VERBOSE" == "true" ]]; then
  "$SCRIPT_DIR/backup_library.sh" --out "$CURRENT_BACKUP" --verbose
else
  "$SCRIPT_DIR/backup_library.sh" --out "$CURRENT_BACKUP"
fi

echo "✅ Current state backed up to: $CURRENT_BACKUP"

# Stop application service
if [[ "$SKIP_SERVICE_STOP" == "false" ]]; then
  echo ""
  echo "🛑 Stopping application service..."
  
  # Try to stop common process managers
  if command -v pm2 > /dev/null; then
    pm2 stop all 2>/dev/null || echo "No PM2 processes to stop"
  fi
  
  # Find and stop any Node.js processes running the application
  pkill -f "node.*api/index.js" 2>/dev/null || echo "No Node.js processes found"
  
  # Give processes time to stop gracefully
  sleep 3
  
  echo "✅ Application service stopped"
else
  echo "⚠️  Skipping service stop"
fi

# Extract backup
echo ""
echo "📦 Extracting backup..."

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

cd "$TEMP_DIR"
if unzip -q "$BACKUP_FILE"; then
  echo "✅ Backup extracted"
else
  echo "❌ Failed to extract backup"
  exit 1
fi

# Verify backup contents
BACKUP_CONTENT_DIR=""
if [[ -d "mobius-backup" ]]; then
  BACKUP_CONTENT_DIR="mobius-backup"
elif [[ -d "backup" ]]; then
  BACKUP_CONTENT_DIR="backup"
else
  # Find the first directory
  BACKUP_CONTENT_DIR=$(find . -maxdepth 1 -type d -not -name "." | head -n 1)
fi

if [[ -z "$BACKUP_CONTENT_DIR" ]]; then
  echo "❌ Cannot find backup contents in extracted files"
  exit 1
fi

echo "Found backup contents in: $BACKUP_CONTENT_DIR"

# Verify backup metadata
METADATA_FILE="$BACKUP_CONTENT_DIR/backup_metadata.json"
if [[ -f "$METADATA_FILE" ]]; then
  if [[ "$VERBOSE" == "true" ]]; then
    echo "📋 Backup metadata:"
    cat "$METADATA_FILE" | python3 -m json.tool 2>/dev/null || cat "$METADATA_FILE"
  fi
else
  echo "⚠️  No backup metadata found"
fi

# Restore files
echo ""
echo "🔄 Restoring files..."

cd "$PROJECT_ROOT"

# Remove current files (but keep backups directory)
if [[ "$VERBOSE" == "true" ]]; then
  echo "Removing current application files..."
fi

rm -rf src/ client/ scripts/ tests/ .github/ 2>/dev/null || true
rm -f package.json package-lock.json .gitignore README.md 2>/dev/null || true

# Copy files from backup
cd "$TEMP_DIR/$BACKUP_CONTENT_DIR"
if [[ "$VERBOSE" == "true" ]]; then
  echo "Copying files from backup..."
  cp -rv * "$PROJECT_ROOT/"
else
  cp -r * "$PROJECT_ROOT/"
fi

echo "✅ Files restored"

# Restore dependencies
echo ""
echo "📦 Installing dependencies..."

cd "$PROJECT_ROOT"
if npm ci; then
  echo "✅ Dependencies installed"
else
  echo "❌ Failed to install dependencies"
  exit 1
fi

# Install client dependencies if present
if [[ -f "client/package.json" ]]; then
  cd "$PROJECT_ROOT/client"
  if npm ci; then
    echo "✅ Client dependencies installed"
  else
    echo "❌ Failed to install client dependencies"
    exit 1
  fi
  cd "$PROJECT_ROOT"
fi

# Run post-rollback migration if needed
echo ""
echo "🗄️  Running post-rollback setup..."

if [[ -f "scripts/migrate-dhash.js" ]]; then
  if node scripts/migrate-dhash.js; then
    echo "✅ Post-rollback setup completed"
  else
    echo "❌ Post-rollback setup failed"
    exit 1
  fi
else
  echo "⚠️  No post-rollback setup script found"
fi

# Start application
echo ""
echo "🚀 Starting application..."

# In a real environment, you would use your process manager
echo "Application restore completed. Please start the service manually:"
echo "  npm start"
echo "  or"
echo "  pm2 start ecosystem.config.js"

# Health check
echo ""
echo "❤️  Performing health check..."

# Wait a moment for potential startup
sleep 2

# Try to check if the application responds
PORT=$(grep "PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo "5001")

if command -v curl > /dev/null; then
  echo "Checking health endpoint..."
  if curl -f --connect-timeout 10 "http://localhost:$PORT/health" > /dev/null 2>&1; then
    echo "✅ Health check passed"
  else
    echo "⚠️  Health check failed or service not yet started"
    echo "Manual verification required"
  fi
else
  echo "⚠️  curl not available, manual health check required"
fi

# Rollback summary
echo ""
echo "🎉 Rollback Summary"
echo "   Source backup: $(basename "$BACKUP_FILE")"
echo "   Rollback backup: $CURRENT_BACKUP"
echo "   Status: COMPLETED"
echo ""
echo "📋 Next steps:"
echo "   1. Start the application if not already running"
echo "   2. Verify functionality manually"  
echo "   3. Monitor logs for any issues"
echo "   4. Run smoke tests if available"
echo ""
echo "🔄 To rollback this rollback:"
echo "   ./scripts/rollback_dhash.sh --backup \"$CURRENT_BACKUP\""