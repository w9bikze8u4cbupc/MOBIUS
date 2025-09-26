#!/bin/bash
# MOBIUS Deployment Framework - Quick Command Helper
# Provides copy-paste ready commands for operators

set -euo pipefail

show_help() {
    cat << 'EOF'
MOBIUS Deployment Framework - Quick Commands

USAGE:
    ./scripts/deploy/quick_commands.sh [COMMAND]

COMMANDS:
    backup-verify      Show backup verification commands
    rollback-emergency Show emergency rollback commands  
    monitor-start      Show monitoring startup commands
    health-check       Show health check commands
    all                Show all commands

EXAMPLES:
    ./scripts/deploy/quick_commands.sh backup-verify
    ./scripts/deploy/quick_commands.sh rollback-emergency
    ./scripts/deploy/quick_commands.sh all

EOF
}

show_backup_verify() {
    cat << 'EOF'
=== BACKUP VERIFICATION COMMANDS ===

# Identify latest verified backup
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
echo "Latest backup: $LATEST_BACKUP"

# Verify backup integrity
sha256sum -c "${LATEST_BACKUP}.sha256"

EOF
}

show_rollback_emergency() {
    cat << 'EOF'
=== EMERGENCY ROLLBACK COMMANDS ===

# Find and verify latest backup
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"

# Execute emergency rollback (after verification)
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force

# Alternative for staging
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env staging --force

EOF
}

show_monitor_start() {
    cat << 'EOF'
=== MONITORING STARTUP COMMANDS ===

# Start 60-minute monitoring with auto-rollback (production)
MONITOR_DURATION=3600 AUTO_ROLLBACK=true ./scripts/deploy/monitor.sh --env production --api-url https://your-api-url.com &

# Start 60-minute monitoring with auto-rollback (staging)
MONITOR_DURATION=3600 AUTO_ROLLBACK=true ./scripts/deploy/monitor.sh --env staging --api-url http://localhost:5001 &

# Save monitor process ID
MONITOR_PID=$!
echo "Monitor started with PID: $MONITOR_PID"

# Stop monitoring manually (if needed)
# kill $MONITOR_PID

EOF
}

show_health_check() {
    cat << 'EOF'
=== HEALTH CHECK COMMANDS ===

# Post-rollback verification (require 3 consecutive OK health checks per runbook)
for i in {1..3}; do
    echo "Health check $i/3..."
    curl -f --connect-timeout 10 --max-time 10 "http://localhost:5001/health" && echo "✅ OK" || echo "❌ FAILED"
    sleep 10
done

# Run comprehensive smoke tests
./scripts/deploy/smoke_tests.sh --env production

# Alternative for staging
./scripts/deploy/smoke_tests.sh --env staging

# Quick API health check
curl -f http://localhost:5001/health && echo "✅ Health OK" || echo "❌ Health FAILED"

EOF
}

show_all_commands() {
    show_backup_verify
    show_rollback_emergency
    show_monitor_start
    show_health_check
    
    cat << 'EOF'
=== COMPLETE DEPLOYMENT WORKFLOW ===

# 1. Create backup
./scripts/deploy/backup_dhash.sh --env production

# 2. Run deployment dry-run
./scripts/deploy/deploy_dryrun.sh --env production

# 3. Execute your deployment process
# [Insert your actual deployment commands here]

# 4. Start monitoring
MONITOR_DURATION=3600 AUTO_ROLLBACK=true ./scripts/deploy/monitor.sh --env production &

# 5. Run smoke tests
./scripts/deploy/smoke_tests.sh --env production

# 6. If issues detected, execute emergency rollback
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --force

=== PRE-MERGE ORCHESTRATION ===

# Run complete pre-merge validation
./scripts/deploy/premerge_orchestration.sh --env staging

# Run with custom options
./scripts/deploy/premerge_orchestration.sh --env production --skip-backup

EOF
}

# Main script logic
case "${1:-help}" in
    "backup-verify")
        show_backup_verify
        ;;
    "rollback-emergency")
        show_rollback_emergency
        ;;
    "monitor-start")
        show_monitor_start
        ;;
    "health-check")
        show_health_check
        ;;
    "all")
        show_all_commands
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    *)
        echo "Unknown command: $1" >&2
        echo "Run './scripts/deploy/quick_commands.sh help' for usage." >&2
        exit 1
        ;;
esac