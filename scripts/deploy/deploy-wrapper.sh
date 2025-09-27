#!/bin/bash

# MOBIUS Games Tutorial Generator - Mock Deployment Script (Bash)
# Cross-platform deployment testing infrastructure
#
# Usage:
#   ./deploy-wrapper.sh [OPTIONS]
#
# Options:
#   --dry-run           Run without actual deployment (safe mode)
#   --verbose           Enable detailed logging
#   --debug             Enable debug output
#   --input-path PATH   Specify input video file path
#   --output-dir DIR    Specify output directory
#   --game NAME         Game name for deployment
#   --platform PLATFORM Override platform detection (linux|macos|windows)
#   --simulate-error    Simulate deployment errors for testing
#   --help              Show this help message

set -euo pipefail

# Default values
DRY_RUN=false
VERBOSE=false
DEBUG=false
INPUT_PATH="out/preview.mp4"
OUTPUT_DIR="deploy"
GAME_NAME=""
PLATFORM=""
SIMULATE_ERROR=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_debug() {
    if [[ "$DEBUG" == "true" ]]; then
        echo -e "[DEBUG] $1" >&2
    fi
}

log_verbose() {
    if [[ "$VERBOSE" == "true" ]] || [[ "$DEBUG" == "true" ]]; then
        echo -e "[VERBOSE] $1"
    fi
}

# Platform detection
detect_platform() {
    if [[ -n "$PLATFORM" ]]; then
        echo "$PLATFORM"
        return
    fi
    
    case "$(uname -s)" in
        Linux*)     echo "linux";;
        Darwin*)    echo "macos";;
        CYGWIN*|MINGW*|MSYS*) echo "windows";;
        *)          echo "unknown";;
    esac
}

# Hash calculation
calculate_hash() {
    local file="$1"
    if [[ ! -f "$file" ]]; then
        log_error "File not found for hash calculation: $file"
        return 1
    fi
    
    local platform=$(detect_platform)
    case "$platform" in
        "linux"|"windows")
            sha256sum "$file" | cut -d' ' -f1
            ;;
        "macos")
            shasum -a 256 "$file" | cut -d' ' -f1
            ;;
        *)
            log_error "Unsupported platform for hash calculation: $platform"
            return 1
            ;;
    esac
}

# File size formatting
format_file_size() {
    local size="$1"
    if (( size < 1024 )); then
        echo "${size} bytes"
    elif (( size < 1048576 )); then
        echo "$(( size / 1024 )) KB"
    elif (( size < 1073741824 )); then
        echo "$(( size / 1048576 )) MB"
    else
        echo "$(( size / 1073741824 )) GB"
    fi
}

# Mock deployment function
mock_deploy() {
    local input_file="$1"
    local output_dir="$2"
    local game_name="$3"
    
    log_info "Starting mock deployment..."
    log_verbose "Platform: $(detect_platform)"
    log_verbose "Input file: $input_file"
    log_verbose "Output directory: $output_dir"
    log_verbose "Game name: $game_name"
    
    # Check if input file exists
    if [[ ! -f "$input_file" ]]; then
        log_error "Input file not found: $input_file"
        return 1
    fi
    
    # Get file info
    local file_size=$(stat -c%s "$input_file" 2>/dev/null || stat -f%z "$input_file" 2>/dev/null || echo "unknown")
    log_verbose "File size: $(format_file_size $file_size)"
    
    # Calculate hash
    log_verbose "Calculating SHA256 hash..."
    local file_hash=$(calculate_hash "$input_file")
    log_verbose "SHA256: $file_hash"
    
    # Simulate deployment steps
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN MODE - No actual deployment performed"
        log_verbose "Would create output directory: $output_dir"
        log_verbose "Would copy file to: $output_dir/${game_name:-preview}.mp4"
        log_verbose "Would verify file integrity"
        log_verbose "Would send deployment notifications"
        
        # Simulate processing time
        sleep 1
        
        if [[ "$SIMULATE_ERROR" == "true" ]]; then
            log_error "Simulated deployment error (as requested)"
            return 1
        fi
        
        log_success "Mock deployment completed successfully"
        return 0
    fi
    
    # Actual deployment simulation (still safe)
    log_info "Creating output directory..."
    mkdir -p "$output_dir"
    
    local output_file="$output_dir/${game_name:-preview}.mp4"
    log_info "Copying file to deployment location..."
    cp "$input_file" "$output_file"
    
    # Verify copied file
    log_info "Verifying file integrity..."
    local copied_hash=$(calculate_hash "$output_file")
    if [[ "$file_hash" != "$copied_hash" ]]; then
        log_error "File integrity check failed!"
        log_error "Original: $file_hash"
        log_error "Copied:   $copied_hash"
        return 1
    fi
    
    log_success "File integrity verified"
    log_success "Deployment completed successfully"
}

# Show help
show_help() {
    cat << EOF
MOBIUS Mock Deployment Script (Bash)

Usage: $0 [OPTIONS]

This script provides a safe testing environment for deployment workflows
without actually publishing content.

OPTIONS:
    --dry-run           Run in dry-run mode (no file operations)
    --verbose           Enable verbose output
    --debug             Enable debug output
    --input-path PATH   Input video file (default: out/preview.mp4)
    --output-dir DIR    Output directory (default: deploy)
    --game NAME         Game name for deployment
    --platform PLATFORM Override platform detection
    --simulate-error    Simulate deployment errors
    --help              Show this help

EXAMPLES:
    # Basic dry run
    $0 --dry-run

    # Verbose dry run with custom input
    $0 --dry-run --verbose --input-path "out/my-game.mp4"

    # Test error handling
    $0 --dry-run --simulate-error

    # Hash verification
    $0 --dry-run --verbose && sha256sum out/preview.mp4

PLATFORM SUPPORT:
    - Linux (native bash)
    - macOS (native bash)  
    - Windows (Git Bash/WSL)
    - Cross-platform hash verification

EOF
}

# Parse command line arguments
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
        --debug)
            DEBUG=true
            VERBOSE=true
            shift
            ;;
        --input-path)
            INPUT_PATH="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --game)
            GAME_NAME="$2"
            shift 2
            ;;
        --platform)
            PLATFORM="$2"
            shift 2
            ;;
        --simulate-error)
            SIMULATE_ERROR=true
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Main execution
main() {
    local start_time=$(date +%s)
    
    log_info "MOBIUS Mock Deployment Script"
    log_debug "Script started at $(date)"
    log_debug "Arguments: DRY_RUN=$DRY_RUN, VERBOSE=$VERBOSE, DEBUG=$DEBUG"
    log_debug "Input: $INPUT_PATH, Output: $OUTPUT_DIR, Game: $GAME_NAME"
    
    # Run mock deployment
    if mock_deploy "$INPUT_PATH" "$OUTPUT_DIR" "$GAME_NAME"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_success "Mock deployment completed in ${duration}s"
        
        # Call notification mock if available
        if [[ -f "scripts/deploy/notify-mock.sh" ]]; then
            log_verbose "Sending deployment notification..."
            bash scripts/deploy/notify-mock.sh --dry-run --message "Deployment completed: $GAME_NAME"
        fi
        
        exit 0
    else
        log_error "Mock deployment failed"
        exit 1
    fi
}

# Execute main function
main "$@"