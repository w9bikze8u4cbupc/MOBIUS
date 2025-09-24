#!/bin/bash

# MOBIUS Game Tutorial Generator - Deployment Script
# Usage: ./deploy_dhash.sh [--dry-run] [--verbose] [--force]

set -euo pipefail

# Configuration
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${DEPLOY_DIR}/backups"
LOG_FILE="${BACKUP_DIR}/deploy_$(date +%Y%m%d_%H%M%S).log"

# Flags
DRY_RUN=false
VERBOSE=false
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--dry-run] [--verbose] [--force]"
            exit 1
            ;;
    esac
done

# Logging function
log() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$message"
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "$message" >> "$LOG_FILE"
}

# Verbose logging
verbose_log() {
    if [[ "$VERBOSE" == "true" ]]; then
        log "VERBOSE: $*"
    fi
}

# Main deployment function
deploy() {
    log "Starting MOBIUS deployment..."
    verbose_log "Deploy directory: $DEPLOY_DIR"
    verbose_log "Backup directory: $BACKUP_DIR"
    verbose_log "Log file: $LOG_FILE"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN MODE - No actual changes will be made"
    fi
    
    # Pre-deployment checks
    log "Running pre-deployment checks..."
    
    # Check Node.js and npm
    if ! command -v node &> /dev/null; then
        log "ERROR: Node.js is not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log "ERROR: npm is not installed"
        exit 1
    fi
    
    verbose_log "Node.js version: $(node --version)"
    verbose_log "npm version: $(npm --version)"
    
    # Check dependencies
    if [[ ! -f "$DEPLOY_DIR/package.json" ]]; then
        log "ERROR: package.json not found in $DEPLOY_DIR"
        exit 1
    fi
    
    # Install/update dependencies
    if [[ "$DRY_RUN" == "false" ]]; then
        log "Installing/updating dependencies..."
        cd "$DEPLOY_DIR"
        npm ci --production
    else
        log "DRY RUN: Would install/update dependencies"
    fi
    
    # Run golden tests
    log "Running golden tests..."
    if [[ "$DRY_RUN" == "false" ]]; then
        cd "$DEPLOY_DIR"
        npm run golden:check || {
            log "ERROR: Golden tests failed"
            if [[ "$FORCE" == "false" ]]; then
                exit 1
            else
                log "WARNING: Proceeding despite test failures (--force flag used)"
            fi
        }
    else
        log "DRY RUN: Would run golden tests"
    fi
    
    # Test pipeline
    log "Testing video generation pipeline..."
    if [[ "$DRY_RUN" == "false" ]]; then
        cd "$DEPLOY_DIR"
        npm run test-pipeline || {
            log "ERROR: Pipeline test failed"
            if [[ "$FORCE" == "false" ]]; then
                exit 1
            else
                log "WARNING: Proceeding despite pipeline failures (--force flag used)"
            fi
        }
    else
        log "DRY RUN: Would test pipeline"
    fi
    
    # Start services (placeholder for actual service deployment)
    log "Deploying services..."
    if [[ "$DRY_RUN" == "false" ]]; then
        # TODO: Implement actual service deployment
        log "Service deployment placeholder - implement actual deployment logic"
    else
        log "DRY RUN: Would deploy services"
    fi
    
    log "Deployment completed successfully!"
    log "Log file saved to: $LOG_FILE"
}

# Error handling
trap 'log "Deployment failed with exit code $?"' ERR

# Run deployment
deploy