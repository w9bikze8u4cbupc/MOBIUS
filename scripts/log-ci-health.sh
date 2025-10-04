#!/bin/bash

# Manual CI Health Logger
# Use this script to manually log CI status during the stabilization period

set -e

# Configuration
LOG_DIR="stabilization-logs"
DATE=$(date -u +%Y%m%d)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOG_FILE="$LOG_DIR/ci-health-$DATE.log"

# Expected contexts
EXPECTED_CONTEXTS=(
    "build-and-qa (macos-latest)"
    "build-and-qa (ubuntu-latest)" 
    "build-and-qa (windows-latest)"
    "Golden checks (macos-latest)"
    "Golden checks (ubuntu-latest)"
    "Golden checks (windows-latest)"
)

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Function to log CI status for a specific commit
log_ci_status() {
    local commit_sha="$1"
    local description="${2:-Manual check}"
    
    if [ -z "$commit_sha" ]; then
        echo "Usage: log_ci_status <commit_sha> [description]"
        return 1
    fi
    
    echo "=== Manual CI Health Check - $TIMESTAMP ===" >> "$LOG_FILE"
    echo "Commit: $commit_sha" >> "$LOG_FILE"
    echo "Description: $description" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    
    # Check if we have GitHub CLI and token
    if ! command -v gh &> /dev/null; then
        echo "WARNING: GitHub CLI not available. Manual status entry only." >> "$LOG_FILE"
        echo "Please verify the following contexts manually:" >> "$LOG_FILE"
        for context in "${EXPECTED_CONTEXTS[@]}"; do
            echo "  - $context: [MANUAL_CHECK_NEEDED]" >> "$LOG_FILE"
        done
        echo "" >> "$LOG_FILE"
        return 0
    fi
    
    if [ -z "$GITHUB_TOKEN" ]; then
        echo "WARNING: GITHUB_TOKEN not set. Manual status entry only." >> "$LOG_FILE"
        echo "Please verify the following contexts manually:" >> "$LOG_FILE"
        for context in "${EXPECTED_CONTEXTS[@]}"; do
            echo "  - $context: [MANUAL_CHECK_NEEDED]" >> "$LOG_FILE"
        done
        echo "" >> "$LOG_FILE"
        return 0
    fi
    
    # Get actual check runs
    echo "Fetching check runs for commit $commit_sha..." >&2
    
    # Get repository from git remote (if available)
    if git remote get-url origin &> /dev/null; then
        REPO_URL=$(git remote get-url origin)
        REPO=$(echo "$REPO_URL" | sed -E 's|.*github\.com[:/]([^/]+/[^/]+)(\.git)?.*|\1|')
    else
        echo "ERROR: Could not determine repository. Please run from git repository." >&2
        return 1
    fi
    
    ACTUAL_CONTEXTS=$(gh api "repos/$REPO/commits/$commit_sha/check-runs" \
        --jq '.check_runs[] | select(.app.slug == "github-actions") | .name' | sort 2>/dev/null || echo "")
    
    if [ -z "$ACTUAL_CONTEXTS" ]; then
        echo "WARNING: No check runs found or API error" >> "$LOG_FILE"
        echo "Please verify contexts manually" >> "$LOG_FILE"
        echo "" >> "$LOG_FILE"
        return 0
    fi
    
    # Check each expected context
    local all_healthy=true
    for expected in "${EXPECTED_CONTEXTS[@]}"; do
        if echo "$ACTUAL_CONTEXTS" | grep -Fxq "$expected"; then
            # Get status
            CONTEXT_STATUS=$(gh api "repos/$REPO/commits/$commit_sha/check-runs" \
                --jq ".check_runs[] | select(.name == \"$expected\") | .conclusion" 2>/dev/null || echo "unknown")
            
            if [ "$CONTEXT_STATUS" = "success" ]; then
                echo "HEALTHY: $expected - Status: $CONTEXT_STATUS" >> "$LOG_FILE"
            else
                echo "ISSUE: $expected - Status: $CONTEXT_STATUS" >> "$LOG_FILE"
                all_healthy=false
            fi
        else
            echo "MISSING: $expected" >> "$LOG_FILE"
            all_healthy=false
        fi
    done
    
    # Check for extra contexts
    while IFS= read -r actual; do
        if [ -n "$actual" ]; then
            FOUND=false
            for expected in "${EXPECTED_CONTEXTS[@]}"; do
                if [ "$actual" = "$expected" ]; then
                    FOUND=true
                    break
                fi
            done
            if [ "$FOUND" = false ]; then
                echo "EXTRA: $actual" >> "$LOG_FILE"
            fi
        fi
    done <<< "$ACTUAL_CONTEXTS"
    
    if [ "$all_healthy" = true ]; then
        echo "RESULT: All contexts healthy ✅" >> "$LOG_FILE"
    else
        echo "RESULT: Anomalies detected ⚠️" >> "$LOG_FILE"
    fi
    
    echo "" >> "$LOG_FILE"
    echo "Manual check completed for commit $commit_sha" >&2
}

# Function to add a manual note
add_note() {
    local note="$1"
    if [ -z "$note" ]; then
        echo "Usage: add_note <note_text>"
        return 1
    fi
    
    echo "=== Manual Note - $TIMESTAMP ===" >> "$LOG_FILE"
    echo "Note: $note" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    echo "Note added to log" >&2
}

# Function to show recent log entries
show_recent() {
    local lines="${1:-20}"
    if [ -f "$LOG_FILE" ]; then
        echo "Recent entries from $LOG_FILE:"
        tail -n "$lines" "$LOG_FILE"
    else
        echo "No log file found for today: $LOG_FILE"
    fi
}

# Main script logic
case "${1:-help}" in
    "check")
        if [ -z "$2" ]; then
            echo "Usage: $0 check <commit_sha> [description]"
            exit 1
        fi
        log_ci_status "$2" "$3"
        ;;
    "note")
        if [ -z "$2" ]; then
            echo "Usage: $0 note <note_text>"
            exit 1
        fi
        add_note "$2"
        ;;
    "recent")
        show_recent "$2"
        ;;
    "help"|*)
        echo "CI Health Logger - Manual logging during stabilization period"
        echo ""
        echo "Usage:"
        echo "  $0 check <commit_sha> [description]  - Log CI status for a commit"
        echo "  $0 note <note_text>                  - Add a manual note to the log"
        echo "  $0 recent [lines]                    - Show recent log entries (default: 20)"
        echo "  $0 help                              - Show this help"
        echo ""
        echo "Examples:"
        echo "  $0 check 8638dab2e9b7f45b807cf75c4fc0f933aab3f1a4d 'Post-rollout verification'"
        echo "  $0 note 'Branch protection successfully applied'"
        echo "  $0 recent 50"
        echo ""
        echo "Log file: $LOG_FILE"
        ;;
esac