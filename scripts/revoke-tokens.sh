#!/bin/bash

# Token Revocation and Security Cleanup Script
# Use this script to safely revoke tokens and clean up after deployment

set -e

# Configuration
AUDIT_LOG="docs/security-audit-log.md"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Token Revocation and Security Cleanup ===${NC}"
echo "Timestamp: $TIMESTAMP"
echo ""

# Function to log security actions
log_security_action() {
    local action="$1"
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") - $action" >> security-cleanup.log
}

# Function to check if token is set
check_token_status() {
    if [ -n "$GITHUB_TOKEN" ]; then
        echo -e "${YELLOW}WARNING: GITHUB_TOKEN environment variable is still set${NC}"
        echo "Token prefix: ${GITHUB_TOKEN:0:10}..."
        return 0
    else
        echo -e "${GREEN}✓ GITHUB_TOKEN environment variable is not set${NC}"
        return 1
    fi
}

# Function to test token validity
test_token_validity() {
    local token="$1"
    if [ -z "$token" ]; then
        echo -e "${GREEN}✓ No token to test${NC}"
        return 1
    fi
    
    echo "Testing token validity..."
    if curl -s -H "Authorization: Bearer $token" https://api.github.com/user > /dev/null 2>&1; then
        echo -e "${RED}⚠️  Token is still valid and active${NC}"
        return 0
    else
        echo -e "${GREEN}✓ Token is invalid or revoked${NC}"
        return 1
    fi
}

# Function to clear environment variables
clear_environment() {
    echo "Clearing environment variables..."
    
    # Clear GitHub-related variables
    unset GITHUB_TOKEN
    unset OWNER
    unset REPO
    unset BRANCH
    
    # Clear from current session
    export GITHUB_TOKEN=""
    export OWNER=""
    export REPO=""
    export BRANCH=""
    
    echo -e "${GREEN}✓ Environment variables cleared${NC}"
    log_security_action "Environment variables cleared"
}

# Function to update security audit log
update_audit_log() {
    local status="$1"
    local details="$2"
    
    if [ -f "$AUDIT_LOG" ]; then
        # Add revocation entry to audit log
        cat >> "$AUDIT_LOG" << EOF

## Token Revocation Completed

**Timestamp:** $TIMESTAMP  
**Status:** $status  
**Details:** $details  
**Performed By:** $(whoami)  
**System:** $(hostname)  

### Actions Taken
- Environment variables cleared
- Token validity tested
- Security cleanup completed
- Audit log updated

EOF
        echo -e "${GREEN}✓ Security audit log updated${NC}"
        log_security_action "Security audit log updated with revocation status: $status"
    else
        echo -e "${YELLOW}⚠️  Security audit log not found at $AUDIT_LOG${NC}"
    fi
}

# Function to show manual revocation instructions
show_manual_instructions() {
    echo -e "${BLUE}=== Manual Token Revocation Instructions ===${NC}"
    echo ""
    echo "Since we cannot automatically revoke the token, please follow these steps:"
    echo ""
    echo "1. Open GitHub in your browser"
    echo "2. Go to Settings → Developer settings → Personal access tokens"
    echo "3. Find the token created around 2024-10-04 for branch protection"
    echo "4. Click 'Delete' to revoke the token"
    echo "5. Confirm the revocation"
    echo ""
    echo "After manual revocation, run this script again to verify cleanup."
    echo ""
}

# Function to verify security cleanup
verify_cleanup() {
    echo -e "${BLUE}=== Security Cleanup Verification ===${NC}"
    echo ""
    
    local all_clear=true
    
    # Check environment variables
    if check_token_status; then
        all_clear=false
    fi
    
    # Check for any remaining tokens in common locations
    if [ -f ~/.gitconfig ]; then
        if grep -q "token" ~/.gitconfig 2>/dev/null; then
            echo -e "${YELLOW}⚠️  Potential token found in ~/.gitconfig${NC}"
            all_clear=false
        fi
    fi
    
    # Check shell history for tokens (basic check)
    if [ -f ~/.bash_history ]; then
        if grep -q "ghp_" ~/.bash_history 2>/dev/null; then
            echo -e "${YELLOW}⚠️  Potential token found in shell history${NC}"
            echo "Consider clearing shell history: history -c"
            all_clear=false
        fi
    fi
    
    if [ "$all_clear" = true ]; then
        echo -e "${GREEN}✓ Security cleanup verification passed${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  Security cleanup verification found issues${NC}"
        return 1
    fi
}

# Main execution
main() {
    echo "Starting security cleanup process..."
    echo ""
    
    # Store current token for testing (if exists)
    local current_token="$GITHUB_TOKEN"
    
    # Clear environment variables
    clear_environment
    
    # Test if token is still valid (if we had one)
    if [ -n "$current_token" ]; then
        echo ""
        if test_token_validity "$current_token"; then
            echo -e "${RED}CRITICAL: Token is still active and needs manual revocation${NC}"
            show_manual_instructions
            update_audit_log "PENDING" "Token still active - manual revocation required"
            log_security_action "CRITICAL: Token still active, manual revocation required"
        else
            echo -e "${GREEN}✓ Token appears to be already revoked${NC}"
            update_audit_log "COMPLETED" "Token successfully revoked"
            log_security_action "Token revocation verified - token is invalid"
        fi
    else
        echo -e "${GREEN}✓ No active token found in environment${NC}"
        update_audit_log "COMPLETED" "No active token found - cleanup completed"
        log_security_action "No active token found in environment"
    fi
    
    echo ""
    verify_cleanup
    
    echo ""
    echo -e "${BLUE}=== Security Cleanup Summary ===${NC}"
    echo "- Environment variables: Cleared"
    echo "- Token validity: Tested"
    echo "- Audit log: Updated"
    echo "- Verification: Completed"
    echo ""
    echo "Security cleanup log: security-cleanup.log"
    echo "Full audit log: $AUDIT_LOG"
    echo ""
    
    if [ -n "$current_token" ] && test_token_validity "$current_token" 2>/dev/null; then
        echo -e "${RED}⚠️  MANUAL ACTION REQUIRED: Token revocation${NC}"
        exit 1
    else
        echo -e "${GREEN}✓ Security cleanup completed successfully${NC}"
        exit 0
    fi
}

# Help function
show_help() {
    echo "Token Revocation and Security Cleanup Script"
    echo ""
    echo "Usage:"
    echo "  $0                    - Run full security cleanup"
    echo "  $0 --check           - Check current security status"
    echo "  $0 --verify          - Verify cleanup completion"
    echo "  $0 --help            - Show this help"
    echo ""
    echo "This script will:"
    echo "  1. Clear environment variables"
    echo "  2. Test token validity"
    echo "  3. Update security audit log"
    echo "  4. Verify cleanup completion"
    echo ""
}

# Command line argument handling
case "${1:-run}" in
    "--check")
        echo "Checking current security status..."
        check_token_status
        ;;
    "--verify")
        echo "Verifying security cleanup..."
        verify_cleanup
        ;;
    "--help")
        show_help
        ;;
    "run"|"")
        main
        ;;
    *)
        echo "Unknown option: $1"
        show_help
        exit 1
        ;;
esac