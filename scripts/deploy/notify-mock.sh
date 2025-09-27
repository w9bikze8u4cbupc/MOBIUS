#!/bin/bash

# MOBIUS Games Tutorial Generator - Mock Notification Script (Bash)
# Cross-platform notification testing for deployment workflows
#
# Usage:
#   ./notify-mock.sh [OPTIONS]
#
# Options:
#   --dry-run           Run without sending actual notifications
#   --verbose           Enable detailed logging
#   --message TEXT      Custom notification message
#   --type TYPE         Notification type (success|warning|error|info)
#   --recipient EMAIL   Mock recipient email
#   --channel CHANNEL   Notification channel (email|slack|webhook)
#   --help              Show help message

set -euo pipefail

# Default values
DRY_RUN=false
VERBOSE=false
MESSAGE="MOBIUS deployment notification"
TYPE="info"
RECIPIENT="admin@example.com"
CHANNEL="email"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${BLUE}[NOTIFY-INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[NOTIFY-SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[NOTIFY-WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[NOTIFY-ERROR]${NC} $1" >&2
}

log_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "[NOTIFY-VERBOSE] $1"
    fi
}

# Mock notification functions
send_email_notification() {
    local recipient="$1"
    local subject="$2"
    local body="$3"
    
    log_verbose "Email notification details:"
    log_verbose "  To: $recipient"
    log_verbose "  Subject: $subject"
    log_verbose "  Body: $body"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would send email to $recipient"
        log_verbose "Email content preview:"
        echo "----------------------------------------"
        echo "To: $recipient"
        echo "Subject: $subject"
        echo ""
        echo "$body"
        echo "----------------------------------------"
    else
        # Simulate email sending
        log_info "Sending email notification to $recipient..."
        sleep 0.5
        log_success "Email notification sent successfully"
    fi
}

send_slack_notification() {
    local webhook="$1"
    local message="$2"
    local channel="${3:-#general}"
    
    log_verbose "Slack notification details:"
    log_verbose "  Webhook: $webhook"
    log_verbose "  Channel: $channel"
    log_verbose "  Message: $message"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would send Slack message to $channel"
        log_verbose "Slack payload preview:"
        echo "----------------------------------------"
        echo "Channel: $channel"
        echo "Message: $message"
        echo "----------------------------------------"
    else
        # Simulate Slack webhook call
        log_info "Sending Slack notification to $channel..."
        sleep 0.5
        log_success "Slack notification sent successfully"
    fi
}

send_webhook_notification() {
    local url="$1"
    local payload="$2"
    
    log_verbose "Webhook notification details:"
    log_verbose "  URL: $url"
    log_verbose "  Payload: $payload"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would POST to webhook $url"
        log_verbose "Webhook payload preview:"
        echo "----------------------------------------"
        echo "$payload"
        echo "----------------------------------------"
    else
        # Simulate webhook POST
        log_info "Sending webhook notification to $url..."
        sleep 0.5
        log_success "Webhook notification sent successfully"
    fi
}

# Generate notification content based on type
generate_notification_content() {
    local msg_type="$1"
    local custom_msg="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    case "$msg_type" in
        "success")
            echo "✅ MOBIUS Deployment Success"
            echo "Time: $timestamp"
            echo "Message: $custom_msg"
            echo "Status: Deployment completed successfully"
            ;;
        "warning")
            echo "⚠️  MOBIUS Deployment Warning"
            echo "Time: $timestamp"
            echo "Message: $custom_msg"
            echo "Status: Deployment completed with warnings"
            ;;
        "error")
            echo "❌ MOBIUS Deployment Error"
            echo "Time: $timestamp"
            echo "Message: $custom_msg"
            echo "Status: Deployment failed"
            ;;
        "info"|*)
            echo "ℹ️  MOBIUS Deployment Info"
            echo "Time: $timestamp"
            echo "Message: $custom_msg"
            echo "Status: Information update"
            ;;
    esac
}

# Main notification function
send_notification() {
    local channel_type="$1"
    local msg_type="$2"
    local message="$3"
    local recipient="$4"
    
    log_info "Preparing $msg_type notification via $channel_type"
    
    local content=$(generate_notification_content "$msg_type" "$message")
    local subject="MOBIUS Deployment ${msg_type^}"
    
    case "$channel_type" in
        "email")
            send_email_notification "$recipient" "$subject" "$content"
            ;;
        "slack")
            local webhook="https://hooks.slack.com/services/MOCK/WEBHOOK/URL"
            send_slack_notification "$webhook" "$content" "#deployments"
            ;;
        "webhook")
            local webhook_url="https://api.example.com/webhooks/mobius"
            local json_payload="{\"type\":\"$msg_type\",\"message\":\"$message\",\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}"
            send_webhook_notification "$webhook_url" "$json_payload"
            ;;
        *)
            log_error "Unknown notification channel: $channel_type"
            return 1
            ;;
    esac
}

# Show help
show_help() {
    cat << EOF
MOBIUS Mock Notification Script (Bash)

Usage: $0 [OPTIONS]

This script simulates sending deployment notifications for testing purposes.

OPTIONS:
    --dry-run           Run without sending actual notifications
    --verbose           Enable verbose output
    --message TEXT      Custom notification message
    --type TYPE         Notification type (success|warning|error|info)
    --recipient EMAIL   Mock recipient email address  
    --channel CHANNEL   Notification channel (email|slack|webhook)
    --help              Show this help

EXAMPLES:
    # Basic notification test
    $0 --dry-run --message "Test deployment completed"

    # Success notification with verbose output
    $0 --dry-run --verbose --type success --message "Game tutorial deployed"

    # Test Slack integration
    $0 --dry-run --channel slack --message "Build finished"

    # Test webhook integration
    $0 --dry-run --channel webhook --type error --message "Deployment failed"

NOTIFICATION TYPES:
    success - ✅ Successful deployment
    warning - ⚠️  Deployment with warnings
    error   - ❌ Failed deployment
    info    - ℹ️  General information

CHANNELS:
    email   - Email notification (default)
    slack   - Slack webhook notification
    webhook - Generic webhook POST

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
        --message)
            MESSAGE="$2"
            shift 2
            ;;
        --type)
            TYPE="$2"
            shift 2
            ;;
        --recipient)
            RECIPIENT="$2"
            shift 2
            ;;
        --channel)
            CHANNEL="$2"
            shift 2
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
    log_info "MOBIUS Mock Notification System"
    log_verbose "Notification type: $TYPE"
    log_verbose "Channel: $CHANNEL"
    log_verbose "Recipient: $RECIPIENT"
    log_verbose "Message: $MESSAGE"
    
    if send_notification "$CHANNEL" "$TYPE" "$MESSAGE" "$RECIPIENT"; then
        log_success "Notification processing completed"
        exit 0
    else
        log_error "Notification processing failed"
        exit 1
    fi
}

# Execute main function
main "$@"