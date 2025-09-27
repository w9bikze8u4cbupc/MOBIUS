#!/bin/bash

# MOBIUS Notification Mock Script (Bash)
# Mock notification system for Slack, email, and other channels

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="$(basename "$0")"

# Default configuration
DRY_RUN=false
VERBOSE=false
TYPE="slack"
MESSAGE=""
TEST_MODE=false
WEBHOOK_URL="${MOBIUS_NOTIFICATION_URL:-}"
EMAIL_RECIPIENTS="${MOBIUS_EMAIL_RECIPIENTS:-admin@example.com}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] [${BLUE}INFO${NC}] $*" >&2
    fi
}

log_warn() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] [${YELLOW}WARN${NC}] $*" >&2
}

log_error() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] [${RED}ERROR${NC}] $*" >&2
}

log_success() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] [${GREEN}SUCCESS${NC}] $*" >&2
}

# Usage information
show_usage() {
    cat << EOF
$SCRIPT_NAME - MOBIUS Notification Mock Script

USAGE:
    $SCRIPT_NAME [OPTIONS]

OPTIONS:
    --type TYPE              Notification type (slack, email, teams, webhook)
    --message MSG            Message to send
    --test                   Run in test mode
    --dry-run                Simulate sending (no actual notification)
    --verbose                Enable verbose logging
    --webhook-url URL        Custom webhook URL
    --email-recipients LIST  Comma-separated email list
    --help                   Show this help message

EXAMPLES:
    $SCRIPT_NAME --type slack --message "Deployment completed"
    $SCRIPT_NAME --test --type email --verbose
    $SCRIPT_NAME --type webhook --webhook-url https://example.com/hook

ENVIRONMENT VARIABLES:
    MOBIUS_NOTIFICATION_URL  Default webhook URL
    MOBIUS_EMAIL_RECIPIENTS  Default email recipients

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --type)
                TYPE="$2"
                shift 2
                ;;
            --message)
                MESSAGE="$2"
                shift 2
                ;;
            --test)
                TEST_MODE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --webhook-url)
                WEBHOOK_URL="$2"
                shift 2
                ;;
            --email-recipients)
                EMAIL_RECIPIENTS="$2"
                shift 2
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

# Validate notification type
validate_type() {
    case "$TYPE" in
        slack|email|teams|webhook|sms)
            log_info "Notification type: $TYPE"
            ;;
        *)
            log_error "Unsupported notification type: $TYPE"
            log_error "Supported types: slack, email, teams, webhook, sms"
            exit 1
            ;;
    esac
}

# Generate test message if needed
generate_message() {
    if [[ "$TEST_MODE" == "true" && -z "$MESSAGE" ]]; then
        MESSAGE="MOBIUS Test Notification - $(date) - Type: $TYPE"
    elif [[ -z "$MESSAGE" ]]; then
        MESSAGE="MOBIUS Notification - $(date)"
    fi
    
    log_info "Message: $MESSAGE"
}

# Mock Slack notification
send_slack_notification() {
    log_info "Sending Slack notification..."
    
    local payload=$(cat << EOF
{
    "text": "$MESSAGE",
    "username": "MOBIUS Bot",
    "icon_emoji": ":robot_face:",
    "channel": "#deployments",
    "attachments": [
        {
            "color": "good",
            "fields": [
                {
                    "title": "Service",
                    "value": "MOBIUS Tutorial Generator",
                    "short": true
                },
                {
                    "title": "Timestamp",
                    "value": "$(date -Iseconds)",
                    "short": true
                },
                {
                    "title": "Environment",
                    "value": "${MOBIUS_ENV:-development}",
                    "short": true
                }
            ]
        }
    ]
}
EOF
    )
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would send Slack payload:"
        log_info "$payload"
    else
        if [[ -n "$WEBHOOK_URL" ]]; then
            log_info "Posting to webhook: $WEBHOOK_URL"
            # In real implementation: curl -X POST -H 'Content-type: application/json' --data "$payload" "$WEBHOOK_URL"
            log_success "Mock Slack notification sent successfully"
        else
            log_warn "No webhook URL configured - using mock response"
            log_success "Mock Slack notification sent (no actual webhook)"
        fi
    fi
}

# Mock email notification
send_email_notification() {
    log_info "Sending email notification..."
    
    local subject="MOBIUS Deployment Notification"
    local body=$(cat << EOF
MOBIUS Tutorial Generator Notification

Message: $MESSAGE
Timestamp: $(date)
Environment: ${MOBIUS_ENV:-development}
Host: $(hostname)

This is an automated notification from the MOBIUS deployment system.
EOF
    )
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would send email:"
        log_info "To: $EMAIL_RECIPIENTS"
        log_info "Subject: $subject"
        log_info "Body: $body"
    else
        log_info "Sending to: $EMAIL_RECIPIENTS"
        # In real implementation: echo "$body" | mail -s "$subject" "$EMAIL_RECIPIENTS"
        log_success "Mock email notification sent successfully"
    fi
}

# Mock Teams notification
send_teams_notification() {
    log_info "Sending Microsoft Teams notification..."
    
    local payload=$(cat << EOF
{
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "themeColor": "0076D7",
    "summary": "MOBIUS Notification",
    "sections": [{
        "activityTitle": "MOBIUS Tutorial Generator",
        "activitySubtitle": "Deployment Notification",
        "activityImage": "https://example.com/mobius-icon.png",
        "facts": [{
            "name": "Message",
            "value": "$MESSAGE"
        }, {
            "name": "Environment",
            "value": "${MOBIUS_ENV:-development}"
        }, {
            "name": "Timestamp",
            "value": "$(date)"
        }],
        "markdown": true
    }]
}
EOF
    )
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would send Teams payload:"
        log_info "$payload"
    else
        # In real implementation: curl -H 'Content-Type: application/json' -d "$payload" "$WEBHOOK_URL"
        log_success "Mock Teams notification sent successfully"
    fi
}

# Mock webhook notification
send_webhook_notification() {
    log_info "Sending webhook notification..."
    
    local payload=$(cat << EOF
{
    "service": "MOBIUS Tutorial Generator",
    "message": "$MESSAGE",
    "timestamp": "$(date -Iseconds)",
    "environment": "${MOBIUS_ENV:-development}",
    "host": "$(hostname)",
    "type": "notification"
}
EOF
    )
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would send webhook payload:"
        log_info "$payload"
    else
        if [[ -n "$WEBHOOK_URL" ]]; then
            log_info "Posting to webhook: $WEBHOOK_URL"
            # In real implementation: curl -X POST -H 'Content-type: application/json' --data "$payload" "$WEBHOOK_URL"
            log_success "Mock webhook notification sent successfully"
        else
            log_warn "No webhook URL configured"
            exit 1
        fi
    fi
}

# Mock SMS notification
send_sms_notification() {
    log_info "Sending SMS notification..."
    
    local sms_message="MOBIUS: $MESSAGE"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would send SMS:"
        log_info "Message: $sms_message"
    else
        # In real implementation: integrate with SMS service (Twilio, AWS SNS, etc.)
        log_success "Mock SMS notification sent successfully"
    fi
}

# Send notification based on type
send_notification() {
    case "$TYPE" in
        slack)
            send_slack_notification
            ;;
        email)
            send_email_notification
            ;;
        teams)
            send_teams_notification
            ;;
        webhook)
            send_webhook_notification
            ;;
        sms)
            send_sms_notification
            ;;
        *)
            log_error "Unsupported notification type: $TYPE"
            exit 1
            ;;
    esac
}

# Main function
main() {
    validate_type
    generate_message
    send_notification
    
    if [[ "$TEST_MODE" == "true" ]]; then
        log_success "Test notification completed for type: $TYPE"
    else
        log_success "Notification sent successfully"
    fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    parse_args "$@"
    main
fi