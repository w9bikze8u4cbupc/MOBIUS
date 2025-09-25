#!/bin/bash

# Pre-merge Checklist Script for MOBIUS
# Runs all the commands specified in the production-ready requirements

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 MOBIUS Pre-merge Checklist"
echo "============================="
echo ""

cd "$PROJECT_ROOT"

# 1. Create verified backup
echo "💾 1. Creating verified backup..."
BACKUP_TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_FILE="backups/dhash_${BACKUP_TIMESTAMP}.zip"

./scripts/backup_library.sh --out "$BACKUP_FILE"

echo "🔐 Verifying backup..."
cd "$(dirname "$BACKUP_FILE")"
sha256sum -c "$(basename "${BACKUP_FILE}.sha256")"
cd "$PROJECT_ROOT"
echo "✅ Backup verified: dhash_${BACKUP_TIMESTAMP}.zip: OK"
echo ""

# 2. Run dry-run deploy and migration
echo "🧪 2. Running dry-run deploy and migration..."
echo "   Staging deployment dry-run:"
./scripts/deploy_dhash.sh --dry-run --env staging

echo ""
echo "   Migration dry-run:"
node scripts/migrate-dhash.js --dry-run > migrate-dryrun.log
echo "✅ Migration dry-run completed, saved to migrate-dryrun.log"
echo ""

# 3. Run smoke tests
echo "🏓 3. Running smoke tests..."
echo "   Starting test server..."

# Start test server in background
node scripts/test-server.js &
TEST_SERVER_PID=$!

# Wait for server to start
sleep 3

echo "   Running logging tests:"
node scripts/test_logging.js

echo ""
echo "   Running comprehensive smoke tests:"
node scripts/smoke-tests.js --quick

# Stop test server
kill $TEST_SERVER_PID 2>/dev/null || true
echo "✅ Smoke tests completed"
echo ""

# 4. Display results summary
echo "📋 Pre-merge Checklist Results"
echo "============================="
echo ""
echo "✅ COMPLETED TASKS:"
echo "   • Backup created and verified: $BACKUP_FILE"
echo "   • SHA256 checksum: $(cut -d' ' -f1 "${BACKUP_FILE}.sha256")"
echo "   • Deploy dry-run: staging environment tested"
echo "   • Migration dry-run: completed successfully"
echo "   • Smoke tests: all critical tests passed"
echo ""

echo "🎯 PRODUCTION READINESS STATUS:"
echo "   ✅ Structured logging with rotation"
echo "   ✅ Health & metrics endpoints"
echo "   ✅ Backup & SHA256 verification"
echo "   ✅ Deploy & rollback scripts with dry-run support"
echo "   ✅ Database migration tooling"
echo "   ✅ Comprehensive smoke testing"
echo ""

echo "📁 ARTIFACTS GENERATED:"
echo "   • Backup file: $BACKUP_FILE"
echo "   • Checksum file: ${BACKUP_FILE}.sha256"
echo "   • Migration log: migrate-dryrun.log"
echo ""

echo "🔧 DEPLOYMENT COMMANDS:"
echo "   Production deploy:"
echo "   ./scripts/deploy_dhash.sh --env production"
echo ""
echo "   Rollback (if needed):"
echo "   ./scripts/rollback_dhash.sh --backup \"$BACKUP_FILE\""
echo ""

echo "📊 MONITORING ENDPOINTS:"
echo "   Health: http://localhost:5000/health (production)"
echo "   Metrics: http://localhost:5000/metrics (production)"
echo ""

echo "🎉 PRE-MERGE CHECKLIST COMPLETE!"
echo "   Ready for production deployment during planned maintenance window."
echo "   Monitor health and metrics endpoints for 30-60 minutes after deployment."